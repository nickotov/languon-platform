import { eq } from 'drizzle-orm';
import { learnerPortraitInterviewOperationsTable as operations } from './persistence/drizzle/schema';
import type { PortraitTransaction } from './persistence/drizzle/drizzle-portrait-store';
import type { TextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import { resolveTextAiProviderOptions } from '../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import type { TextAiAdmissionExecution } from '../../text-ai/application/text-ai-admission-participant';
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
    creditsBypass: boolean;
    selectionPolicy?: TextAiAvailabilityPolicy;
}) {
    const store = new DrizzleInterviewStore(
        input.database,
        createInterviewAdmission({
            creditsBypass: input.creditsBypass,
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
        store,
    };
}
export function createLearnerPortraitWorkerComposition(input: {
    database: PortraitDatabase;
    credentials: Partial<Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>>;
}) {
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
                operation.execution as unknown as TextAiAdmissionExecution & {
                    interviewCreditsBypass: boolean;
                };
            if (!execution.snapshot)
                throw new Error('Interview execution snapshot is unavailable.');
            const provider = resolveTextAiProviderOptions({
                snapshot: execution.snapshot,
                budget: execution.budget,
                credentials: input.credentials,
            });
            return createLearnerInterviewerRunner({
                model: provider.model,
                accounting: createInterviewAccounting({
                    database: input.database,
                    withOperation: (work) =>
                        store.withOperation(operation, work),
                    ownerId: operation.ownerId,
                    operationId: operation.id,
                    execution,
                }),
                maxInputTokens: execution.snapshot.perCallMaxInputTokens,
                maxOutputTokens: execution.snapshot.perCallMaxOutputTokens,
            });
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
