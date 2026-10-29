import { currentKnowledgeSentenceCondition } from './knowledge-sentence-free-selection';
import { sentenceAiJobsTable as jobs } from '../../../../learning/infrastructure/persistence/drizzle/sentence-schema';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
    SentenceAttemptSchema,
    SentenceManualReviewSchema,
    type SentenceAttemptsQuery,
    type SentenceProgressQuery,
    type SentenceReferenceRevealRequest,
} from '@languon/contracts';
import type { VocabularyPracticeActor } from '../../../application/vocabulary-practice-store';
import type { SentenceContext } from '../../../../learning/application/ports/sentence-practice-store';
import {
    LearningEntryUnavailableError,
    LearningInvalidRequestError,
} from '../../../../learning/domain/errors';
import { SentenceConflictError } from '../../../../learning/domain/sentence-errors';
import type { KnowledgeTransaction } from './knowledge-transaction';
import type { VocabularyPracticeContent } from './vocabulary-practice-source';
import {
    currentKnowledgeSentence,
    referenceFingerprint,
} from './knowledge-sentence-context';
import {
    knowledgeSentenceExercisesTable as exercises,
    knowledgeSentenceAttemptsTable as attempts,
    knowledgeSentenceReviewsTable as reviews,
    knowledgeSentenceExposuresTable as exposures,
} from './knowledge-sentence-schema';
import { knowledgeSentenceNextReceiptsTable as receipts } from './knowledge-sentence-next-schema';

const sourceWhere = (
    table: typeof reviews | typeof attempts,
    source: VocabularyPracticeActor,
) =>
    and(
        eq(table.actorId, source.actorId),
        eq(table.noteId, source.noteId),
        eq(table.blockId, source.blockId),
    );
const cursorSchema = z
    .object({
        kind: z.enum(['attempts', 'reviews']),
        actorId: z.uuid(),
        noteId: z.uuid(),
        blockId: z.uuid(),
        direction: z.string().nullable(),
        exerciseId: z.uuid().nullable(),
        date: z.iso.datetime(),
        id: z.uuid(),
    })
    .strict();

function cursorFor(
    kind: 'attempts' | 'reviews',
    source: VocabularyPracticeActor,
    query: SentenceAttemptsQuery,
) {
    if (!query.cursor) return null;
    try {
        const cursor = cursorSchema.parse(
            JSON.parse(Buffer.from(query.cursor, 'base64url').toString()),
        );

        if (
            cursor.kind !== kind ||
            cursor.actorId !== source.actorId ||
            cursor.noteId !== source.noteId ||
            cursor.blockId !== source.blockId ||
            cursor.direction !== (query.direction ?? null) ||
            cursor.exerciseId !== (query.exerciseId ?? null)
        )
            throw new Error();

        return cursor;
    } catch {
        throw new LearningInvalidRequestError();
    }
}

function nextCursor(
    kind: 'attempts' | 'reviews',
    source: VocabularyPracticeActor,
    query: SentenceAttemptsQuery,
    row: { id: string; createdAt: Date } | undefined,
    hasNext: boolean,
) {
    return hasNext && row
        ? Buffer.from(
              JSON.stringify({
                  kind,
                  ...source,
                  access: undefined,
                  direction: query.direction ?? null,
                  exerciseId: query.exerciseId ?? null,
                  date: row.createdAt.toISOString(),
                  id: row.id,
              }),
          ).toString('base64url')
        : null;
}

function presentReview(
    row: typeof reviews.$inferSelect,
    exercise: typeof exercises.$inferSelect,
    material: VocabularyPracticeContent,
) {
    return SentenceManualReviewSchema.parse({
        id: row.id,
        exercise: exercise.publicContent,
        contentState: currentKnowledgeSentence(exercise, material)
            ? 'current'
            : 'outdated',
        sessionId: row.sessionId,
        referenceTranslation: exercise.referenceTranslation,
        createdAt: row.createdAt.toISOString(),
    });
}

export async function knowledgeSentenceReveal(
    tx: KnowledgeTransaction,
    source: VocabularyPracticeActor,
    material: VocabularyPracticeContent,
    exerciseId: string,
    input: SentenceReferenceRevealRequest,
    context: SentenceContext,
) {
    const [exercise] = await tx
        .select()
        .from(exercises)
        .where(
            and(
                eq(exercises.id, exerciseId),
                eq(exercises.actorId, source.actorId),
                eq(exercises.noteId, source.noteId),
                eq(exercises.blockId, source.blockId),
            ),
        );

    if (!exercise) throw new LearningEntryUnavailableError();
    const hash = referenceFingerprint(
        source.noteId,
        source.blockId,
        exerciseId,
        input,
    );
    const [receipt] = await tx
        .select()
        .from(receipts)
        .where(
            and(
                eq(receipts.actorId, source.actorId),
                eq(receipts.operationId, input.operationId),
            ),
        );

    if (receipt) throw new SentenceConflictError('operation_conflict');
    const [paid] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
            and(
                eq(jobs.learnerId, source.actorId),
                eq(jobs.operationId, input.operationId),
            ),
        );

    if (paid) throw new SentenceConflictError('operation_conflict');
    const [prior] = await tx
        .select()
        .from(reviews)
        .where(
            and(
                eq(reviews.actorId, source.actorId),
                eq(reviews.operationId, input.operationId),
            ),
        );

    if (prior) {
        if (prior.requestFingerprint !== hash)
            throw new SentenceConflictError('operation_conflict');

        return { review: presentReview(prior, exercise, material) };
    }

    if (!currentKnowledgeSentence(exercise, material))
        throw new SentenceConflictError('stale_content');
    await tx
        .insert(exposures)
        .values({
            actorId: source.actorId,
            noteId: source.noteId,
            blockId: source.blockId,
            exerciseId,
            createdAt: context.now,
        })
        .onConflictDoNothing();

    const [review] = await tx
        .insert(reviews)
        .values({
            id: randomUUID(),
            actorId: source.actorId,
            noteId: source.noteId,
            blockId: source.blockId,
            exerciseId,
            operationId: input.operationId,
            sessionId: input.sessionId,
            requestFingerprint: hash,
            createdAt: context.now,
        })
        .returning();

    return { review: presentReview(review!, exercise, material) };
}

export async function knowledgeSentenceAttempts(
    tx: KnowledgeTransaction,
    source: VocabularyPracticeActor,
    material: VocabularyPracticeContent,
    query: SentenceAttemptsQuery,
) {
    const cursor = cursorFor('attempts', source, query);
    const rows = await tx
        .select({ row: attempts, exercise: exercises })
        .from(attempts)
        .innerJoin(exercises, eq(exercises.id, attempts.exerciseId))
        .where(
            and(
                sourceWhere(attempts, source),
                query.direction
                    ? sql`${exercises.publicContent}->>'direction'=${query.direction}`
                    : undefined,
                query.exerciseId
                    ? eq(attempts.exerciseId, query.exerciseId)
                    : undefined,
                cursor
                    ? sql`(${attempts.createdAt},${attempts.id}) < (${cursor.date}::timestamptz,${cursor.id}::uuid)`
                    : undefined,
            ),
        )
        .orderBy(desc(attempts.createdAt), desc(attempts.id))
        .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);

    return {
        attempts: page.map(({ row, exercise }) =>
            SentenceAttemptSchema.parse({
                id: row.id,
                exercise: exercise.publicContent,
                contentState: currentKnowledgeSentence(exercise, material)
                    ? 'current'
                    : 'outdated',
                sessionId: row.sessionId,
                answer: row.answer,
                explanationLanguage: row.explanationLanguage,
                revealedHintIds: row.revealedHintIds,
                assisted:
                    row.referenceRevealed || row.revealedHintIds.length > 0,
                referenceRevealed: row.referenceRevealed,
                feedback: row.feedback,
                createdAt: row.createdAt.toISOString(),
            }),
        ),
        nextCursor: nextCursor(
            'attempts',
            source,
            query,
            page.at(-1)?.row,
            rows.length > query.limit,
        ),
    };
}

export async function knowledgeSentenceReviews(
    tx: KnowledgeTransaction,
    source: VocabularyPracticeActor,
    material: VocabularyPracticeContent,
    query: SentenceAttemptsQuery,
) {
    const cursor = cursorFor('reviews', source, query);
    const rows = await tx
        .select({ row: reviews, exercise: exercises })
        .from(reviews)
        .innerJoin(exercises, eq(exercises.id, reviews.exerciseId))
        .where(
            and(
                sourceWhere(reviews, source),
                query.direction
                    ? sql`${exercises.publicContent}->>'direction'=${query.direction}`
                    : undefined,
                query.exerciseId
                    ? eq(reviews.exerciseId, query.exerciseId)
                    : undefined,
                cursor
                    ? sql`(${reviews.createdAt},${reviews.id}) < (${cursor.date}::timestamptz,${cursor.id}::uuid)`
                    : undefined,
            ),
        )
        .orderBy(desc(reviews.createdAt), desc(reviews.id))
        .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);

    return {
        reviews: page.map(({ row, exercise }) =>
            presentReview(row, exercise, material),
        ),
        nextCursor: nextCursor(
            'reviews',
            source,
            query,
            page.at(-1)?.row,
            rows.length > query.limit,
        ),
    };
}

export async function knowledgeSentenceProgress(
    tx: KnowledgeTransaction,
    source: VocabularyPracticeActor,
    material: VocabularyPracticeContent,
    query: SentenceProgressQuery,
    eligibleCount: number,
    usedCount: number,
) {
    const [checks] = await tx
        .select({
            total: sql<number>`count(*)::integer`,
            assisted: sql<number>`count(*) filter(where ${attempts.referenceRevealed} or jsonb_array_length(${attempts.revealedHintIds})>0)::integer`,
            perfect: sql<number>`count(*) filter(where ${attempts.feedback}->>'rating'='perfect')::integer`,
            good: sql<number>`count(*) filter(where ${attempts.feedback}->>'rating'='good')::integer`,
            notBad: sql<number>`count(*) filter(where ${attempts.feedback}->>'rating'='not-bad')::integer`,
            later: sql<number>`count(*) filter(where ${attempts.feedback}->>'rating'='practise-again-later')::integer`,
        })
        .from(attempts)
        .innerJoin(exercises, eq(exercises.id, attempts.exerciseId))
        .where(
            and(
                sourceWhere(attempts, source),
                sql`${exercises.publicContent}->>'direction'=${query.direction}`,
                currentKnowledgeSentenceCondition(material),
            ),
        );
    const [manual] = await tx
        .select({ total: sql<number>`count(*)::integer` })
        .from(reviews)
        .innerJoin(exercises, eq(exercises.id, reviews.exerciseId))
        .where(
            and(
                sourceWhere(reviews, source),
                sql`${exercises.publicContent}->>'direction'=${query.direction}`,
                currentKnowledgeSentenceCondition(material),
            ),
        );

    return {
        direction: query.direction,
        eligibleCount,
        usedCount,
        remainingCount: eligibleCount - usedCount,
        completedCheckCount: checks?.total ?? 0,
        manualReviewCount: manual?.total ?? 0,
        assistedCheckCount: checks?.assisted ?? 0,
        ratings: {
            perfect: checks?.perfect ?? 0,
            good: checks?.good ?? 0,
            notBad: checks?.notBad ?? 0,
            practiseAgainLater: checks?.later ?? 0,
        },
    };
}
