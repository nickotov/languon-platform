import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { withActionQuotePersistence } from '../../../../ai-credits/infrastructure/action-allowance-consent';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    authorizeSentence,
    lockSentenceLearner,
    sentenceLearner,
    type SentenceTransaction,
} from './sentence-persistence-support';
import { type SentencePracticePersistenceContext } from './sentence-practice-context';

export async function sentencePracticeRun<T>(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    context: SentenceContext,
    work: (
        tx: SentenceTransaction,
        owned: Awaited<ReturnType<typeof authorizeSentence>>,
        id: string,
    ) => Promise<T>,
    write = false,
) {
    context.signal.throwIfAborted();

    return withActionQuotePersistence(persistence.database, () =>
        persistence.database.transaction(async (tx) => {
            if (write) await lockTextAiCapacity(tx);
            const owned = await authorizeSentence(tx, access, write);
            const id = sentenceLearner(access);
            if (write) await lockSentenceLearner(tx, id);
            const result = await work(tx, owned, id);
            context.signal.throwIfAborted();

            return result;
        }),
    );
}
