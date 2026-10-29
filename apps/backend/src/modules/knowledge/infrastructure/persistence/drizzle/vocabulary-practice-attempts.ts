import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type {
    FlashcardAttemptRequest,
    FlashcardUndoRequest,
} from '@languon/contracts';
import type { VocabularyPracticeActor } from '../../../application/vocabulary-practice-store';
import {
    LearningConflictError,
    LearningEntryUnavailableError,
    LearningInvalidRequestError,
} from '../../../../learning/domain/errors';
import {
    sameFlashcardAttempt,
    canUndoFlashcardAttempt,
} from '../../../../learning/domain/flashcard-attempt-policy';
import type { KnowledgeTransaction } from './knowledge-transaction';
import type { VocabularyPracticeContent } from './vocabulary-practice-source';
import {
    knowledgeVocabularyAttemptsTable as attempts,
    knowledgeVocabularyProgressTable as progress,
} from './vocabulary-practice-schema';
const scope = (source: VocabularyPracticeActor) =>
    and(
        eq(attempts.actorId, source.actorId),
        eq(attempts.noteId, source.noteId),
        eq(attempts.blockId, source.blockId),
    );
const result = (row: typeof attempts.$inferSelect) => ({
    attemptId: row.id,
    entryId: row.entryId,
    learningVersion: row.learningVersion,
    rating: row.rating,
});
const undoResult = (row: typeof attempts.$inferSelect) => ({
    attemptId: row.id,
    entryId: row.entryId,
    learningVersion: row.learningVersion,
    rating: row.undoRating,
});

async function operation(
    tx: KnowledgeTransaction,
    actorId: string,
    operationId: string,
) {
    const [row] = await tx
        .select()
        .from(attempts)
        .where(
            and(
                eq(attempts.actorId, actorId),
                or(
                    eq(attempts.operationId, operationId),
                    eq(attempts.undoOperationId, operationId),
                ),
            ),
        );

    return row;
}

export async function rateVocabularyEntry(
    tx: KnowledgeTransaction,
    source: VocabularyPracticeActor,
    material: VocabularyPracticeContent,
    input: FlashcardAttemptRequest,
) {
    const entry = material.entries.find((entry) => entry.id === input.entryId);
    if (!entry) throw new LearningEntryUnavailableError();
    const replay = await operation(tx, source.actorId, input.operationId);
    if (replay) {
        if (
            replay.noteId !== source.noteId ||
            replay.blockId !== source.blockId ||
            replay.operationId !== input.operationId ||
            !sameFlashcardAttempt(replay, input)
        )
            throw new LearningConflictError('operation_conflict');

        return result(replay);
    }

    if (entry.learningVersion !== input.expectedLearningVersion)
        throw new LearningConflictError('stale_content');
    if (!material.project(entry, input.configuration))
        throw new LearningInvalidRequestError();
    const [row] = await tx
        .insert(attempts)
        .values({
            id: randomUUID(),
            actorId: source.actorId,
            noteId: source.noteId,
            blockId: source.blockId,
            entryId: entry.id,
            operationId: input.operationId,
            sessionId: input.sessionId,
            round: input.round,
            learningVersion: entry.learningVersion,
            rating: input.rating,
            configuration: input.configuration,
        })
        .returning();

    if (!row) throw new Error('Vocabulary attempt insertion failed');
    await tx
        .insert(progress)
        .values({
            actorId: source.actorId,
            noteId: source.noteId,
            blockId: source.blockId,
            entryId: entry.id,
            learningVersion: entry.learningVersion,
            rating: input.rating,
            latestAttemptId: row.id,
        })
        .onConflictDoUpdate({
            target: [
                progress.actorId,
                progress.noteId,
                progress.blockId,
                progress.entryId,
            ],
            set: {
                learningVersion: entry.learningVersion,
                rating: input.rating,
                latestAttemptId: row.id,
            },
        });

    return result(row);
}

export async function undoVocabularyEntry(
    tx: KnowledgeTransaction,
    source: VocabularyPracticeActor,
    material: VocabularyPracticeContent,
    attemptId: string,
    input: FlashcardUndoRequest,
) {
    const [target] = await tx
        .select()
        .from(attempts)
        .where(and(scope(source), eq(attempts.id, attemptId)));

    if (!target) throw new LearningEntryUnavailableError();
    const entry = material.entries.find((entry) => entry.id === target.entryId);
    if (!entry) throw new LearningEntryUnavailableError();
    if (entry.learningVersion !== target.learningVersion)
        throw new LearningConflictError('stale_content');
    const reuse = await operation(tx, source.actorId, input.operationId);
    if (reuse) {
        if (
            reuse.id !== target.id ||
            reuse.undoOperationId !== input.operationId
        )
            throw new LearningConflictError('operation_conflict');

        return undoResult(reuse);
    }

    const [latestSession] = await tx
        .select({ id: attempts.id })
        .from(attempts)
        .where(
            and(
                eq(attempts.actorId, source.actorId),
                eq(attempts.sessionId, target.sessionId),
            ),
        )
        .orderBy(desc(attempts.sequence))
        .limit(1);
    const condition = and(
        eq(progress.actorId, source.actorId),
        eq(progress.noteId, source.noteId),
        eq(progress.blockId, source.blockId),
        eq(progress.entryId, entry.id),
    );
    const [current] = await tx.select().from(progress).where(condition);
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
                scope(source),
                eq(attempts.entryId, entry.id),
                eq(attempts.learningVersion, entry.learningVersion),
                isNull(attempts.voidedAt),
                sql`${attempts.sequence}<${target.sequence}`,
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

    if (!voided) throw new Error('Vocabulary undo failed');
    if (prior)
        await tx
            .update(progress)
            .set({
                latestAttemptId: prior.id,
                rating: prior.rating,
                learningVersion: entry.learningVersion,
            })
            .where(condition);
    else await tx.delete(progress).where(condition);

    return undoResult(voided);
}
