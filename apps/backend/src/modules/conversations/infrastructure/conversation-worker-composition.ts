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
import { createContextualTutorRunner } from './ai/contextual-tutor-runner';

/** Shares the existing worker slot pool. Every executable instance is bound to a claimed turn. */
export function createConversationWorkerComposition(input: {
    database: ConversationsDatabase;
    dictionaryHmacSecret: string;
    credentials: Partial<Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>>;
}) {
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
        createRunner(turn) {
            const execution =
                turn.execution as unknown as TextAiAdmissionExecution;
            if (!execution.snapshot)
                throw new Error(
                    'Conversation execution snapshot is unavailable.',
                );
            const provider = resolveTextAiProviderOptions({
                snapshot: execution.snapshot,
                budget: execution.budget,
                credentials: input.credentials,
            });
            const accounting = createConversationAccounting({
                database: input.database,
                withOperation: (work) => store.withOperation(turn, work),
                ownerId: turn.ownerId,
                turnId: turn.id,
                leaseToken: turn.leaseToken,
                execution,
            });
            return createContextualTutorRunner({
                model: provider.model,
                accounting,
                maxInputTokens:
                    typeof turn.execution.admittedMaxInputTokens === 'number'
                        ? Math.min(
                              execution.snapshot.perCallMaxInputTokens,
                              turn.execution.admittedMaxInputTokens,
                          )
                        : execution.snapshot.perCallMaxInputTokens,
            });
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
