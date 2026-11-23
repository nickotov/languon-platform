import type { PrepareListeningRecording } from '../application/listening-script';
import { KnowledgeShareCrypto } from '../../knowledge/infrastructure/knowledge-share-crypto';
import { createTextAiProviderRuntime } from '../../../infrastructure/text-ai/provider-runtime';
import { runPinnedFallback } from '../../text-ai/infrastructure/ai/run-pinned-fallback';
import { ProviderExecutionError } from '../../text-ai/infrastructure/ai/provider-execution-outcome';
import { GenerationExecutionFailure } from '../application/generation-failure';
import { randomBytes } from 'node:crypto';
import { ConversationWorkerService } from '../application/conversation-worker-service';
import { DrizzleConversationStore } from './persistence/drizzle/drizzle-conversation-store';
import {
    ConversationSourceResolver,
    type ConversationsDatabase,
} from './persistence/drizzle/conversation-source';
import { HmacDictionaryCryptography } from '../../dictionaries/infrastructure/crypto/dictionary-cryptography';
import { createTextsCryptography } from '../../texts/infrastructure/texts-composition';
import { DrizzleKnowledgeTransactionParticipant } from '../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { resolveTextAiProviderOptions } from '../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import type { TextAiAdmissionExecution } from '../../text-ai/application/text-ai-admission-participant';
import {
    conversationAdmission,
    createConversationAccounting,
    settleInterruptedConversationCalls,
} from './conversation-accounting';
import { tutorStageTimeLimitMs } from './ai/accounted-tutor-model';
import { fenceTutorPublications } from './ai/tutor-publication-fence';
import { createContextualTutorRunner } from './ai/contextual-tutor-runner';

/** Shares the existing worker slot pool. Every executable instance is bound to a claimed turn. */
export function createConversationWorkerComposition(input: {
    prepareListeningRecording?: PrepareListeningRecording;
    database: ConversationsDatabase;
    dictionaryHmacSecret: string;
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
    const dictionary = new HmacDictionaryCryptography({
        secret: input.dictionaryHmacSecret,
        entropy: { randomBytes },
    });
    const text = createTextsCryptography(input.dictionaryHmacSecret, {
        randomBytes,
    });
    const store = new DrizzleConversationStore({
        database: input.database,
        sources: new ConversationSourceResolver({
            verifyDictionaryShare: (key, digest) =>
                dictionary.verifyShare(key, digest),
            verifyTextShare: (key, digest) => text.verifyShare(key, digest),
            verifyKnowledgeShare: (key, digest) =>
                new KnowledgeShareCrypto(input.dictionaryHmacSecret).verify(
                    key,
                    digest,
                ),
            readNote: (tx, ownerId, id) =>
                new DrizzleKnowledgeTransactionParticipant(tx).getForSource(
                    ownerId,
                    id,
                ),
        }),
        nameUntitledNote: (tx, ownerId, noteId, title) =>
            new DrizzleKnowledgeTransactionParticipant(
                tx,
            ).nameUntitledFromFirstMessage(ownerId, noteId, title),
        admitTurn: conversationAdmission(),
        publishNote: (tx, ownerId, content) =>
            new DrizzleKnowledgeTransactionParticipant(tx).publish(
                ownerId,
                content,
                new Date(),
            ),
        settleInterrupted: settleInterruptedConversationCalls,
    });
    const worker = new ConversationWorkerService({
        store,
        ...(input.prepareListeningRecording && {
            prepareListeningRecording: input.prepareListeningRecording,
        }),
        createRunner(turn) {
            const execution =
                turn.execution as unknown as TextAiAdmissionExecution;

            if (!execution.snapshot) {
                throw new Error(
                    'Conversation execution snapshot is unavailable.',
                );
            }

            const snapshot = execution.snapshot;

            return {
                run: async (runInput) => {
                    const publication = fenceTutorPublications(runInput);
                    // Routing to a second pinned model is still the same admitted stage.
                    const stageDeadline = Date.now() + tutorStageTimeLimitMs;

                    return runPinnedFallback({
                        snapshot,
                        signal: runInput.signal,
                        hasPublished: publication.hasPublished,
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
                            const accounting = createConversationAccounting({
                                database: input.database,
                                withOperation: (work) =>
                                    store.withOperation(turn, work),
                                ownerId: turn.ownerId,
                                turnId: turn.id,
                                leaseToken: turn.leaseToken,
                                execution: selectedExecution,
                            });
                            const runner = createContextualTutorRunner({
                                model: provider.model,
                                stageDeadline,
                                providerId: snapshot.providerId,
                                accounting,
                                attemptWitness: {
                                    jobId: turn.id,
                                    leaseToken: turn.leaseToken,
                                },
                                maxInputTokens:
                                    typeof turn.execution
                                        .admittedMaxInputTokens === 'number'
                                        ? Math.min(
                                              snapshot.perCallMaxInputTokens,
                                              turn.execution
                                                  .admittedMaxInputTokens,
                                          )
                                        : snapshot.perCallMaxInputTokens,
                            });

                            return runner.run(publication.input);
                        },
                    }).catch((error: unknown) => {
                        // Routing must finish deciding whether a request was conclusively
                        // rejected before the conversation exposes its safe failure category.
                        if (error instanceof ProviderExecutionError) {
                            throw new GenerationExecutionFailure({
                                code: error.rateLimited
                                    ? 'rate-limited'
                                    : error.executionOutcome === 'rejected'
                                      ? 'provider-rejected'
                                      : 'provider-outcome-unknown',
                            });
                        }

                        throw error;
                    });
                },
            };
        },
    });

    return {
        processNext: (signal: AbortSignal) => worker.processNext(signal),
        maintainAccounting: () => store.maintainAccounting(),
        // Active calls observe shutdown through processNext's signal and settle there.
        // An unresponsive process is conservatively finalized by the durable lease recovery.
        releaseWorkerLeases: async (_signal: AbortSignal) => undefined,
    };
}
