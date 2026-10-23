import { sql } from 'drizzle-orm';
import { DictionaryNotFoundError } from '../../../../dictionaries/application/dictionary-errors';
import {
    authorizeLearningDictionary,
    type LearningDictionary,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/dictionary-learning-participant';
import type {
    LearningAccess,
    LearningContext,
} from '../../../application/ports/learning-store';
import { LearningUnavailableError } from '../../../domain/errors';
import type { Transaction } from './flashcard-persistence-context';
import {
    learner,
    type FlashcardPersistenceContext,
} from './flashcard-persistence-context';

export function flashcardRun<T>(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    context: LearningContext,
    work: (tx: Transaction, owned: LearningDictionary) => Promise<T>,
    write = false,
): Promise<T> {
    context.signal.throwIfAborted();

    return persistence.database.transaction(async (tx) => {
        const owned = await authorizeLearningDictionary(tx, access).catch(
            (error) => {
                if (error instanceof DictionaryNotFoundError)
                    throw new LearningUnavailableError();

                throw error;
            },
        );

        if (write) {
            // One learner lock covers global operation IDs, session-last and entry-last checks atomically.
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${learner(access)}`}, 0))`,
            );
        }

        context.signal.throwIfAborted();
        const result = await work(tx, owned);
        context.signal.throwIfAborted();

        return result;
    });
}
