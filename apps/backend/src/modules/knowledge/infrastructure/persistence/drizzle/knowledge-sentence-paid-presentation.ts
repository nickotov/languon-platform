import { eq } from 'drizzle-orm';
import { SentenceAttemptSchema, SentenceJobSchema } from '@languon/contracts';
import { readActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import type {
    SentenceJobRow,
    SentenceTransaction,
} from '../../../../learning/infrastructure/persistence/drizzle/sentence-persistence-support';
import { SentenceUnavailableError } from '../../../../learning/domain/sentence-errors';
import {
    knowledgeSentenceExercisesTable as exercises,
    knowledgeSentenceAttemptsTable as attempts,
} from './knowledge-sentence-schema';

/** Caller has rechecked the live note grant; no private result is readable by its author. */
export async function presentKnowledgeSentenceJob(
    tx: SentenceTransaction,
    row: SentenceJobRow,
) {
    let result = null;
    if (row.executionState === 'completed') {
        if (row.resultKnowledgeExerciseId) {
            const [exercise] = await tx
                .select()
                .from(exercises)
                .where(eq(exercises.id, row.resultKnowledgeExerciseId));

            if (exercise && exercise.actorId === row.learnerId)
                result = {
                    kind: 'exercise' as const,
                    exercise: exercise.publicContent,
                };
        } else if (row.resultKnowledgeAttemptId) {
            const [attempt] = await tx
                .select()
                .from(attempts)
                .where(eq(attempts.id, row.resultKnowledgeAttemptId));
            const [exercise] = attempt
                ? await tx
                      .select()
                      .from(exercises)
                      .where(eq(exercises.id, attempt.exerciseId))
                : [];

            if (attempt && exercise && attempt.actorId === row.learnerId)
                result = {
                    kind: 'attempt' as const,
                    attempt: SentenceAttemptSchema.parse({
                        id: attempt.id,
                        exercise: exercise.publicContent,
                        contentState: 'current',
                        sessionId: attempt.sessionId,
                        answer: attempt.answer,
                        explanationLanguage: attempt.explanationLanguage,
                        revealedHintIds: attempt.revealedHintIds,
                        referenceRevealed: attempt.referenceRevealed,
                        assisted:
                            attempt.referenceRevealed ||
                            attempt.revealedHintIds.length > 0,
                        feedback: attempt.feedback,
                        createdAt: attempt.createdAt.toISOString(),
                    }),
                };
        }

        if (!result) throw new SentenceUnavailableError();
    }

    const billing = await readActionBilling(tx, row.id, row.learnerId);

    return SentenceJobSchema.parse({
        ...(billing ? { billing } : {}),
        id: row.id,
        kind: row.jobKind,
        state: row.executionState,
        cancellationRequested: row.cancellationRequestedAt !== null,
        attemptCount: row.attemptCount,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        failureCode:
            row.executionState === 'failed' ? row.failureCategory : null,
        result,
    });
}
