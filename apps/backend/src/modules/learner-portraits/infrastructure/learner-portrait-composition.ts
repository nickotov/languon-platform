import { createTextAiProviderRuntime } from '../../../infrastructure/text-ai/provider-runtime';
import { runPinnedFallback } from '../../text-ai/infrastructure/ai/run-pinned-fallback';
import { DrizzleCapabilityPolicyParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { eq } from 'drizzle-orm';
import { learnerPortraitInterviewOperationsTable as operations } from './persistence/drizzle/schema';
import type { PortraitTransaction } from './persistence/drizzle/drizzle-portrait-store';
import type { TextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import { resolveTextAiProviderOptions } from '../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import {
    readInterviewInputTokenLimit,
    readInterviewOutputTokenLimit,
    type InterviewExecution,
} from './ai/interview-request';
import { PortraitService } from '../application/portrait-service';
import { InterviewService } from '../application/interview-service';
import { InterviewWorkerService } from '../application/interview-worker-service';
import {
    DrizzlePortraitStore,
    type PortraitDatabase,
} from './persistence/drizzle/drizzle-portrait-store';
import { DrizzleInterviewStore } from './persistence/drizzle/drizzle-interview-store';
import {
    createInterviewAdmission,
    createInterviewAccounting,
    settleInterruptedInterviewCalls,
} from './interview-accounting';
import { createLearnerInterviewerRunner } from './ai/learner-interviewer';

async function recoverInterview(
    tx: PortraitTransaction,
    operationId: string,
    _now: Date,
) {
    const [operation] = await tx
        .select()
        .from(operations)
        .where(eq(operations.id, operationId));
    if (operation) await settleInterruptedInterviewCalls(tx, operation);
}

export function createLearnerPortraitModule(input: {
    database: PortraitDatabase;
    selectionPolicy?: TextAiAvailabilityPolicy;
}) {
    const store = new DrizzleInterviewStore(
        input.database,
        createInterviewAdmission({
            ...(input.selectionPolicy
                ? { selectionPolicy: input.selectionPolicy }
                : {}),
        }),
        recoverInterview,
    );
    return {
        portraits: new PortraitService(
            new DrizzlePortraitStore(input.database),
        ),
        interviews: new InterviewService(store),
        readChargingPolicy: () =>
            input.database.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).current(
                    'portrait-interview',
                ),
            ),
        store,
    };
}
export function createLearnerPortraitWorkerComposition(input: {
    database: PortraitDatabase;
    credentials: Partial<
        Record<
            | 'DEEPSEEK_API_KEY'
            | 'KIE_API_KEY'
            | 'EVOLINK_API_KEY'
            | 'OPENROUTER_API_KEY',
            string
        >
    >;
}) {
    const providerRuntime = createTextAiProviderRuntime(
        input.database,
        input.credentials,
    );
    // Worker never reads mutable free/paid policy: every admitted operation pins it.
    const store = new DrizzleInterviewStore(
        input.database,
        async () => {
            throw new Error('Workers cannot admit interviews.');
        },
        recoverInterview,
    );
    const worker = new InterviewWorkerService({
        store,
        createRunner(operation) {
            const execution =
                operation.execution as unknown as InterviewExecution;
            if (!execution.snapshot)
                throw new Error('Interview execution snapshot is unavailable.');
            const snapshot = execution.snapshot;
            return {
                run: async (runInput) =>
                    runPinnedFallback({
                        snapshot,
                        signal: runInput.signal,
                        hasPublished: () => false,
                        execute: async (snapshot, attempt) => {
                            const selectedExecution = {
                                ...execution,
                                snapshot,
                                budget: {
                                    ...execution.budget,
                                    inputCostMicrosPerMillionTokens:
                                        snapshot.aggregateBudget
                                            .inputCostMicrosPerMillionTokens,
                                    outputCostMicrosPerMillionTokens:
                                        snapshot.aggregateBudget
                                            .outputCostMicrosPerMillionTokens,
                                },
                                ...(attempt === 2
                                    ? {
                                          providerPrice:
                                              snapshot.routingAuthority!
                                                  .candidates[1]!.providerPrice,
                                      }
                                    : {}),
                            };
                            const provider = resolveTextAiProviderOptions({
                                ...providerRuntime,
                                snapshot,
                                budget: selectedExecution.budget,
                                credentials: input.credentials,
                            });
                            const runner = createLearnerInterviewerRunner({
                                model: provider.model,
                                providerId: snapshot.providerId,
                                attemptWitness: {
                                    jobId: operation.id,
                                    leaseToken: operation.leaseToken,
                                },
                                accounting: createInterviewAccounting({
                                    database: input.database,
                                    withOperation: (work) =>
                                        store.withOperation(operation, work),
                                    ownerId: operation.ownerId,
                                    operationId: operation.id,
                                    leaseToken: operation.leaseToken,
                                    execution: selectedExecution,
                                }),
                                maxInputTokens:
                                    readInterviewInputTokenLimit(
                                        selectedExecution,
                                    ),
                                maxOutputTokens:
                                    readInterviewOutputTokenLimit(
                                        selectedExecution,
                                    ),
                            });
                            return runner.run(runInput);
                        },
                    }),
            };
        },
    });
    // processNext propagates shutdown to active calls and settles them. A killed
    // process is finalized by the 60-second durable lease recovery; never replay
    // ambiguous provider work or release its numerical liability early.
    return {
        processNext: (signal: AbortSignal) => worker.processNext(signal),
        releaseWorkerLeases: async (_signal: AbortSignal) => undefined,
    };
}
