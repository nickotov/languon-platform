import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
    SentenceExerciseSchema,
    SentenceAttemptSchema,
} from '@languon/contracts';
import type {
    KnowledgeSentenceIdentity,
    KnowledgeSentenceTransaction,
} from '../../../application/knowledge-sentence-store';
import {
    LearningEntryUnavailableError,
    LearningConflictError,
} from '../../../../learning/domain/errors';
import type { KnowledgeTransaction } from './knowledge-transaction';
import {
    knowledgeSentenceExercisesTable as exercises,
    knowledgeSentenceAttemptsTable as attempts,
} from './knowledge-sentence-schema';
/** Caller must resolve live saved-source authority in the same transaction first. */
export class DrizzleKnowledgeSentenceTransaction implements KnowledgeSentenceTransaction {
    constructor(private readonly tx: KnowledgeTransaction) {}
    async loadExercise(source: KnowledgeSentenceIdentity, exerciseId: string) {
        const [row] = await this.tx
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

        if (!row) throw new LearningEntryUnavailableError();

        return {
            exercise: SentenceExerciseSchema.parse(row.publicContent),
            referenceTranslation: row.referenceTranslation,
            entries: row.provenance,
        };
    }

    async publishGenerated(
        input: Parameters<KnowledgeSentenceTransaction['publishGenerated']>[0],
    ) {
        const [prior] = await this.tx
            .select()
            .from(exercises)
            .where(
                and(
                    eq(exercises.actorId, input.actorId),
                    eq(exercises.operationId, input.jobId),
                ),
            );

        if (prior) {
            if (
                prior.noteId !== input.noteId ||
                prior.blockId !== input.blockId
            )
                throw new LearningConflictError('operation_conflict');

            return SentenceExerciseSchema.parse(prior.publicContent);
        }

        const exercise = SentenceExerciseSchema.parse({
            id: randomUUID(),
            dictionaryId: null,
            knowledgeSource: { noteId: input.noteId, blockId: input.blockId },
            direction: input.direction,
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage,
            sourceText: input.content.sourceText,
            segments: input.content.segments,
            hints: input.content.hints,
            generationPolicyVersion: input.generationPolicyVersion,
            createdAt: input.createdAt.toISOString(),
        });

        await this.tx.insert(exercises).values({
            id: exercise.id,
            actorId: input.actorId,
            noteId: input.noteId,
            blockId: input.blockId,
            operationId: input.jobId,
            publicContent: exercise,
            referenceTranslation: input.content.referenceTranslation,
            provenance: [...input.provenance],
            createdAt: input.createdAt,
        });

        return exercise;
    }

    async publishChecked(
        input: Parameters<KnowledgeSentenceTransaction['publishChecked']>[0],
    ) {
        const snapshot = await this.loadExercise(input, input.exerciseId);
        const [prior] = await this.tx
            .select()
            .from(attempts)
            .where(
                and(
                    eq(attempts.actorId, input.actorId),
                    eq(attempts.operationId, input.jobId),
                ),
            );

        if (
            prior &&
            (prior.exerciseId !== input.exerciseId ||
                prior.noteId !== input.noteId ||
                prior.blockId !== input.blockId)
        )
            throw new LearningConflictError('operation_conflict');
        const values = {
            id: randomUUID(),
            actorId: input.actorId,
            noteId: input.noteId,
            blockId: input.blockId,
            exerciseId: input.exerciseId,
            operationId: input.jobId,
            sessionId: input.sessionId,
            answer: input.request.answer,
            explanationLanguage: input.request.explanationLanguage,
            revealedHintIds: [...input.request.revealedHintIds],
            referenceRevealed: input.referenceRevealed,
            feedback: input.feedback,
            createdAt: input.createdAt,
        };
        const row = prior ?? values;
        if (!prior) await this.tx.insert(attempts).values(values);

        return SentenceAttemptSchema.parse({
            id: row.id,
            exercise: snapshot.exercise,
            contentState: 'current',
            sessionId: row.sessionId,
            answer: row.answer,
            explanationLanguage: row.explanationLanguage,
            revealedHintIds: row.revealedHintIds,
            assisted: row.referenceRevealed || row.revealedHintIds.length > 0,
            referenceRevealed: row.referenceRevealed,
            feedback: row.feedback,
            createdAt: row.createdAt.toISOString(),
        });
    }
}
