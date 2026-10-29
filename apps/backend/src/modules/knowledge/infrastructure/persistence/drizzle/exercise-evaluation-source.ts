import { and, eq, sql } from 'drizzle-orm';
import {
    KnowledgeBodySchema,
    WorkbookLearnerAttemptSchema,
    WorkbookAttemptAnswerSchema,
    type LearningBlock,
    type RequestKnowledgeExerciseEvaluation,
    type WorkbookLearningShareAccess,
} from '@languon/contracts';
import type { KnowledgeExerciseEvaluationInput } from '../../../application/ports/exercise-evaluation-store';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { TextsAiError } from '../../../../texts/application/ports/texts-ai-provider';
import type { TextsTransaction } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-support';
import { knowledgeLearnerAttemptsTable as attempts } from './learner-schema';
import {
    pinKnowledgeNoteSource,
    readPinnedKnowledgeNoteSource,
} from './pinned-note-access';
import {
    readLearningEpochs,
    requireLearningEpoch,
    learningExerciseRevision,
} from './learning-epochs';
import {
    exerciseSemanticDescriptor,
    exerciseSemanticRevision,
} from '../../../domain/workbook-learning';

function currentExercise(all: LearningBlock[], exerciseId: string) {
    const target = all.find((block) => block.id === exerciseId);
    if (!target || target.type !== 'exercise')
        throw new TextsAiError('access_revoked');

    return target;
}

function blocks(body: unknown) {
    return (
        KnowledgeBodySchema.parse(body).document.content?.flatMap((node) =>
            node.attrs?.block ? [node.attrs.block] : [],
        ) ?? []
    );
}

async function privateAttempt(
    tx: TextsTransaction,
    actorId: string,
    noteId: string,
    attemptId: string,
) {
    const [attempt] = await tx
        .select()
        .from(attempts)
        .where(
            and(
                eq(attempts.actorId, actorId),
                eq(attempts.noteId, noteId),
                eq(attempts.id, attemptId),
            ),
        )
        .for('share');

    if (!attempt) throw new TextsAiError('access_revoked');

    return attempt;
}

async function assertCurrentRevision(
    tx: TextsTransaction,
    noteId: string,
    exerciseId: string,
    expected: string,
    all: LearningBlock[],
) {
    const target = currentExercise(all, exerciseId);
    const epoch = requireLearningEpoch(
        await readLearningEpochs(tx, noteId),
        'exercise',
        exerciseId,
        exerciseId,
        exerciseSemanticRevision(target, all),
    );

    if (learningExerciseRevision(noteId, epoch) !== expected)
        throw new TextsAiError('source_changed');

    return { target, epoch };
}

/** Resolve the private answer and reference on the server, pinning only a verified grant digest. */
export async function pinKnowledgeExerciseEvaluation(
    tx: TextsTransaction,
    crypto: KnowledgeShareCrypto,
    actorId: string,
    noteId: string,
    request: RequestKnowledgeExerciseEvaluation,
    access?: WorkbookLearningShareAccess,
): Promise<KnowledgeExerciseEvaluationInput> {
    const { note, grant } = await pinKnowledgeNoteSource(
        tx,
        crypto,
        actorId,
        noteId,
        access,
    );
    const row = await privateAttempt(tx, actorId, noteId, request.attemptId);
    const attempt = WorkbookLearnerAttemptSchema.parse(row.result);
    const all = blocks(note.body);
    const { target: exercise, epoch } = await assertCurrentRevision(
        tx,
        noteId,
        attempt.exerciseId,
        attempt.exerciseRevision,
        all,
    );
    const sourcePassages = JSON.stringify(
        (
            JSON.parse(exerciseSemanticDescriptor(exercise, all)) as {
                source: unknown;
            }
        ).source,
    );

    if (sourcePassages.length > 32_000)
        throw new TextsAiError('model_capacity_exceeded');

    return {
        noteId,
        noteOwnerId: note.ownerId,
        attemptId: attempt.id,
        noteVersion: attempt.noteVersion,
        exerciseId: exercise.id,
        exerciseRevision: attempt.exerciseRevision,
        learningEpoch: epoch.epoch,
        semanticFingerprint: epoch.semanticFingerprint,
        exercise,
        answer: attempt.answer,
        sourcePassages,
        replyLanguage: request.replyLanguage ?? 'en',
        grant,
    };
}

/** Recheck grant, actor-private attempt and material epoch at every dispatch/read/commit. */
export async function authorizeKnowledgeExerciseJobSource(
    tx: TextsTransaction,
    job: {
        ownerId: string;
        id?: string;
        externalSourceKind?: string | null;
        knowledgeExerciseEvaluation?: KnowledgeExerciseEvaluationInput;
    },
) {
    const input = job.knowledgeExerciseEvaluation;
    if (!input) {
        if (job.externalSourceKind !== 'knowledge-exercise') return;
        if (!job.id) throw new TextsAiError('access_revoked');
        try {
            // A denied definer assertion must roll back to a savepoint so the outer
            // worker transaction can still settle/release the unusable action.
            await tx.transaction((sourceTx) =>
                sourceTx.execute(
                    sql`select languon_assert_knowledge_exercise_action_source(${job.id}::uuid, ${job.ownerId}::uuid)`,
                ),
            );
        } catch (error) {
            const cause =
                error && typeof error === 'object' && 'cause' in error
                    ? error.cause
                    : error;

            if (
                cause &&
                typeof cause === 'object' &&
                'code' in cause &&
                cause.code === '23514'
            )
                throw new TextsAiError('access_revoked');

            throw error;
        }

        return;
    }

    const { note } = await readPinnedKnowledgeNoteSource(tx, {
        actorId: job.ownerId,
        noteId: input.noteId,
        noteOwnerId: input.noteOwnerId,
        grant: input.grant,
    });
    const row = await privateAttempt(
        tx,
        job.ownerId,
        input.noteId,
        input.attemptId,
    );
    const attempt = WorkbookLearnerAttemptSchema.parse(row.result);
    if (
        attempt.exerciseId !== input.exerciseId ||
        attempt.exerciseRevision !== input.exerciseRevision ||
        JSON.stringify(attempt.answer) !==
            JSON.stringify(WorkbookAttemptAnswerSchema.parse(input.answer))
    )
        throw new TextsAiError('source_changed');
    await assertCurrentRevision(
        tx,
        note.id,
        input.exerciseId,
        input.exerciseRevision,
        blocks(note.body),
    );
}
