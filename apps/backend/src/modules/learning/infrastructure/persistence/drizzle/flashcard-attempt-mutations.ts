import { canUndoFlashcardAttempt } from '../../../domain/flashcard-attempt-policy';
import type {
    FlashcardAttemptRequest,
    FlashcardUndoRequest,
} from '@languon/contracts';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type {
    LearningAccess,
    LearningContext,
} from '../../../application/ports/learning-store';
import {
    LearningConflictError,
    LearningEntryUnavailableError,
    LearningInvalidRequestError,
} from '../../../domain/errors';
import {
    attemptResult,
    learner,
    present,
    sameAttempt,
    undoResult,
    type FlashcardPersistenceContext,
} from './flashcard-persistence-context';
import { flashcardRun } from './flashcard-transaction';
import {
    flashcardAttemptsTable as attempts,
    flashcardEntryProgressTable as progress,
} from './schema';

export async function flashcardRecordAttempt(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    input: FlashcardAttemptRequest,
    context: LearningContext,
) {
    const learnerId = learner(access);

    return flashcardRun(
        persistence,
        access,
        context,
        async (tx, owned) => {
            const [card] = await tx
                .select()
                .from(cards)
                .where(
                    and(
                        eq(cards.id, input.entryId),
                        eq(cards.dictionaryId, owned.dictionary.id),
                        eq(cards.lifecycle, 'active'),
                    ),
                );

            if (!card) throw new LearningEntryUnavailableError();
            const [replay] = await tx
                .select()
                .from(attempts)
                .where(
                    and(
                        eq(attempts.learnerId, learnerId),
                        or(
                            eq(attempts.operationId, input.operationId),
                            eq(attempts.undoOperationId, input.operationId),
                        ),
                    ),
                );

            if (replay) {
                if (
                    replay.dictionaryId !== owned.dictionary.id ||
                    replay.operationId !== input.operationId ||
                    !sameAttempt(replay, input)
                )
                    throw new LearningConflictError('operation_conflict');

                return attemptResult(replay);
            }

            if (card.learningVersion !== input.expectedLearningVersion)
                throw new LearningConflictError('stale_content');
            if (!present(card, owned, input.configuration))
                throw new LearningInvalidRequestError();
            const [row] = await tx
                .insert(attempts)
                .values({
                    id: randomUUID(),
                    learnerId,
                    dictionaryId: owned.dictionary.id,
                    entryId: card.id,
                    operationId: input.operationId,
                    sessionId: input.sessionId,
                    round: input.round,
                    learningVersion: card.learningVersion,
                    rating: input.rating,
                    configuration: input.configuration,
                })
                .returning();

            if (!row) throw new Error('Attempt insertion failed');
            await tx
                .insert(progress)
                .values({
                    learnerId,
                    dictionaryId: owned.dictionary.id,
                    entryId: card.id,
                    learningVersion: card.learningVersion,
                    rating: input.rating,
                    latestAttemptId: row.id,
                })
                .onConflictDoUpdate({
                    target: [progress.learnerId, progress.entryId],
                    set: {
                        learningVersion: card.learningVersion,
                        rating: input.rating,
                        latestAttemptId: row.id,
                    },
                });

            return attemptResult(row);
        },
        true,
    );
}

export async function flashcardUndo(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    attemptId: string,
    input: FlashcardUndoRequest,
    context: LearningContext,
) {
    const learnerId = learner(access);

    return flashcardRun(
        persistence,
        access,
        context,
        async (tx, owned) => {
            const [target] = await tx
                .select()
                .from(attempts)
                .where(
                    and(
                        eq(attempts.id, attemptId),
                        eq(attempts.learnerId, learnerId),
                        eq(attempts.dictionaryId, owned.dictionary.id),
                    ),
                );

            if (!target) throw new LearningEntryUnavailableError();
            const [card] = await tx
                .select()
                .from(cards)
                .where(
                    and(
                        eq(cards.id, target.entryId),
                        eq(cards.dictionaryId, owned.dictionary.id),
                        eq(cards.lifecycle, 'active'),
                    ),
                );

            if (!card) throw new LearningEntryUnavailableError();
            if (card.learningVersion !== target.learningVersion)
                throw new LearningConflictError('stale_content');
            const [reuse] = await tx
                .select()
                .from(attempts)
                .where(
                    and(
                        eq(attempts.learnerId, learnerId),
                        or(
                            eq(attempts.operationId, input.operationId),
                            eq(attempts.undoOperationId, input.operationId),
                        ),
                    ),
                );

            if (reuse) {
                if (
                    reuse.id !== target.id ||
                    reuse.undoOperationId !== input.operationId
                )
                    throw new LearningConflictError('operation_conflict');

                return undoResult(reuse);
            }

            const [latestSession] = await tx
                .select()
                .from(attempts)
                .where(
                    and(
                        eq(attempts.learnerId, learnerId),
                        eq(attempts.sessionId, target.sessionId),
                    ),
                )
                .orderBy(desc(attempts.sequence))
                .limit(1);
            const [current] = await tx
                .select()
                .from(progress)
                .where(
                    and(
                        eq(progress.learnerId, learnerId),
                        eq(progress.entryId, card.id),
                    ),
                );

            if (
                !canUndoFlashcardAttempt({
                    targetId: target.id,
                    voided: !!target.voidedAt,
                    latestSessionId: latestSession?.id,
                    latestEntryId: current?.latestAttemptId,
                })
            )
                throw new LearningConflictError('undo_conflict');
            const [prior] = await tx
                .select()
                .from(attempts)
                .where(
                    and(
                        eq(attempts.learnerId, learnerId),
                        eq(attempts.entryId, card.id),
                        eq(attempts.learningVersion, card.learningVersion),
                        isNull(attempts.voidedAt),
                        sql`${attempts.sequence} < ${target.sequence}`,
                    ),
                )
                .orderBy(desc(attempts.sequence))
                .limit(1);
            const [voided] = await tx
                .update(attempts)
                .set({
                    voidedAt: new Date(),
                    undoOperationId: input.operationId,
                    undoRating: prior?.rating ?? null,
                })
                .where(eq(attempts.id, target.id))
                .returning();

            if (!voided) throw new Error('Undo mutation failed');
            const condition = and(
                eq(progress.learnerId, learnerId),
                eq(progress.entryId, card.id),
            );

            if (prior)
                await tx
                    .update(progress)
                    .set({
                        latestAttemptId: prior.id,
                        rating: prior.rating,
                        learningVersion: card.learningVersion,
                    })
                    .where(condition);
            else await tx.delete(progress).where(condition);

            return undoResult(voided);
        },
        true,
    );
}
