import { and, eq } from 'drizzle-orm';
import {
    KnowledgeExerciseEvaluationJobSchema,
    RequestKnowledgeExerciseEvaluationSchema,
    type RequestKnowledgeExerciseEvaluation,
    type WorkbookLearningShareAccess,
} from '@languon/contracts';
import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { enqueueKnowledgeTextAction } from '../../../../texts/infrastructure/persistence/drizzle/knowledge-action-admission';
import {
    find,
    terminal,
    transaction,
} from '../../../../texts/infrastructure/persistence/drizzle/texts-job-admission';
import { textsAiJobsTable as jobs } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-schema';
import type { TextsJobStoreContext } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-persistence-support';
import type {
    TextsJobRow,
    TextsTransaction,
} from '../../../../texts/infrastructure/persistence/drizzle/texts-job-support';
import type { TextJobContext } from '../../../../texts/application/ports/texts-job-store';
import { TextsAiError } from '../../../../texts/application/ports/texts-ai-provider';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { knowledgeExerciseEvaluationJobSourcesTable as sources } from './exercise-evaluation-source-schema';
import {
    pinKnowledgeExerciseEvaluation,
    authorizeKnowledgeExerciseJobSource,
} from './exercise-evaluation-source';
import { readLearnerNote } from './learner-access';

async function view(tx: TextsTransaction, job: TextsJobRow) {
    const [source] = await tx
        .select()
        .from(sources)
        .where(
            and(eq(sources.jobId, job.id), eq(sources.actorId, job.ownerId)),
        );

    if (!source) throw new TextsAiError('generation_job_not_found');
    const state =
        job.executionState === 'completed' && job.cancellationRequestedAt
            ? 'cancelled'
            : job.executionState;

    return withActionBilling(
        tx,
        KnowledgeExerciseEvaluationJobSchema.parse({
            id: job.id,
            noteId: source.noteId,
            attemptId: source.attemptId,
            exerciseId: source.input.exerciseId,
            exerciseRevision: source.input.exerciseRevision,
            status: state,
            result: state === 'completed' ? job.resultPayload : null,
            attempt: state === 'completed' ? source.attemptResult : null,
            failureCode: state === 'failed' ? job.failureCategory : null,
            createdAt: job.createdAt.toISOString(),
            completedAt: job.completedAt?.toISOString() ?? null,
        }),
        job.id,
        job.ownerId,
    );
}

export class DrizzleKnowledgeExerciseEvaluationStore {
    constructor(
        private readonly persistence: TextsJobStoreContext,
        private readonly crypto: KnowledgeShareCrypto,
    ) {}

    async request(
        actorId: string,
        noteId: string,
        raw: RequestKnowledgeExerciseEvaluation,
        context: TextJobContext,
        access?: WorkbookLearningShareAccess,
    ) {
        const request = RequestKnowledgeExerciseEvaluationSchema.parse(raw);
        const pinned = await transaction(this.persistence, async (tx) => {
            await readLearnerNote(tx, this.crypto, actorId, noteId, access);
            const [previous] = await tx
                .select({ source: sources })
                .from(sources)
                .innerJoin(jobs, eq(jobs.id, sources.jobId))
                .where(
                    and(
                        eq(jobs.ownerId, actorId),
                        eq(jobs.operationId, request.operationId),
                    ),
                );

            if (previous) {
                if (
                    previous.source.noteId !== noteId ||
                    previous.source.attemptId !== request.attemptId ||
                    previous.source.input.replyLanguage !==
                        (request.replyLanguage ?? 'en')
                )
                    throw new TextsAiError('idempotency_conflict');
                await authorizeKnowledgeExerciseJobSource(tx, {
                    ownerId: actorId,
                    knowledgeExerciseEvaluation: previous.source.input,
                });

                return previous.source.input;
            }

            return pinKnowledgeExerciseEvaluation(
                tx,
                this.crypto,
                actorId,
                noteId,
                request,
                access,
            );
        });
        const job = await enqueueKnowledgeTextAction(
            this.persistence,
            actorId,
            {
                purpose: 'exercise-evaluation',
                operationId: request.operationId,
                payload: {
                    kind: 'text-translation',
                    operationId: request.operationId,
                    folderId: null,
                    sourceText: pinned.exercise.question,
                    sourceLanguage: 'en',
                    targetLanguage: pinned.replyLanguage,
                    segments: [],
                    knowledgeExerciseEvaluation: pinned,
                },
                authorize: (tx) =>
                    authorizeKnowledgeExerciseJobSource(tx, {
                        ownerId: actorId,
                        knowledgeExerciseEvaluation: pinned,
                    }),
                attach: async (tx, jobId) => {
                    await tx.insert(sources).values({
                        jobId,
                        actorId,
                        noteId,
                        attemptId: pinned.attemptId,
                        input: pinned,
                        createdAt: context.now,
                    });
                },
            },
            context,
        );

        return transaction(this.persistence, async (tx) => {
            await this.authorize(tx, actorId, noteId, job.id, access);

            return view(tx, job);
        });
    }

    async get(
        actorId: string,
        noteId: string,
        jobId: string,
        context: TextJobContext,
        access?: WorkbookLearningShareAccess,
    ) {
        return transaction(this.persistence, async (tx) => {
            await this.authorize(tx, actorId, noteId, jobId, access);
            const job = await find(this.persistence, tx, actorId, jobId);
            if (job.expiresAt <= context.now)
                throw new TextsAiError('generation_proposal_expired');

            return view(tx, job);
        });
    }

    async cancel(
        actorId: string,
        noteId: string,
        jobId: string,
        context: TextJobContext,
        access?: WorkbookLearningShareAccess,
    ) {
        return transaction(this.persistence, async (tx) => {
            await this.authorize(tx, actorId, noteId, jobId, access);
            const job = await find(this.persistence, tx, actorId, jobId);
            if (
                job.executionState === 'queued' ||
                job.executionState === 'running'
            ) {
                await terminal(this.persistence, tx, job, context.now, null);
                const [updated] = await tx
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, jobId));

                return view(tx, updated!);
            }

            return view(tx, job);
        });
    }

    private async authorize(
        tx: TextsTransaction,
        actorId: string,
        noteId: string,
        jobId: string,
        access?: WorkbookLearningShareAccess,
    ) {
        await readLearnerNote(tx, this.crypto, actorId, noteId, access);
        const [source] = await tx
            .select()
            .from(sources)
            .where(
                and(
                    eq(sources.jobId, jobId),
                    eq(sources.actorId, actorId),
                    eq(sources.noteId, noteId),
                ),
            );

        if (!source) throw new TextsAiError('generation_job_not_found');
        await authorizeKnowledgeExerciseJobSource(tx, {
            ownerId: actorId,
            id: jobId,
            externalSourceKind: 'knowledge-exercise',
        });

        return source;
    }
}
