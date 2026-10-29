import { and, eq } from 'drizzle-orm';
import {
    KnowledgeBlockFieldActionJobSchema,
    RequestKnowledgeBlockFieldActionSchema,
    type RequestKnowledgeBlockFieldAction,
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
import { authorizeKnowledgeFieldDraft } from './block-field-source';
import { knowledgeFieldJobSourcesTable as sources } from './block-field-source-schema';

async function view(tx: TextsTransaction, job: TextsJobRow) {
    const stopped =
        job.executionState === 'completed' && job.cancellationRequestedAt;
    const state = stopped ? 'cancelled' : job.executionState;

    return withActionBilling(
        tx,
        KnowledgeBlockFieldActionJobSchema.parse({
            id: job.id,
            status: state,
            result: state === 'completed' ? job.resultPayload : null,
            failureCode: state === 'failed' ? job.failureCategory : null,
            createdAt: job.createdAt.toISOString(),
            completedAt: job.completedAt?.toISOString() ?? null,
        }),
        job.id,
        job.ownerId,
    );
}

export class DrizzleKnowledgeBlockFieldStore {
    constructor(private readonly persistence: TextsJobStoreContext) {}

    async request(
        ownerId: string,
        noteId: string,
        raw: RequestKnowledgeBlockFieldAction,
        context: TextJobContext,
    ) {
        const request = RequestKnowledgeBlockFieldActionSchema.parse(raw);
        const job = await enqueueKnowledgeTextAction(
            this.persistence,
            ownerId,
            {
                purpose: 'field',
                operationId: request.operationId,
                payload: {
                    kind: 'text-translation',
                    operationId: request.operationId,
                    folderId: null,
                    sourceText: request.field.sourceText,
                    sourceLanguage: request.field.sourceLanguage,
                    targetLanguage: request.field.targetLanguage,
                    segments: [],
                    knowledgeFieldAction: { ...request, noteId },
                },
                authorize: (tx) =>
                    authorizeKnowledgeFieldDraft(tx, ownerId, {
                        noteId,
                        branchId: request.branchId,
                    }),
                attach: async (tx, jobId) => {
                    await tx.insert(sources).values({
                        jobId,
                        actorId: ownerId,
                        noteId,
                        branchId: request.branchId,
                        blockId: request.blockId,
                    });
                },
            },
            context,
        );

        return transaction(this.persistence, async (tx) => {
            await this.authorize(tx, ownerId, noteId, job.id);

            return view(tx, job);
        });
    }

    async get(
        ownerId: string,
        noteId: string,
        jobId: string,
        context: TextJobContext,
    ) {
        return transaction(this.persistence, async (tx) => {
            await this.authorize(tx, ownerId, noteId, jobId);
            const job = await find(this.persistence, tx, ownerId, jobId);
            if (job.expiresAt <= context.now)
                throw new TextsAiError('generation_proposal_expired');

            return view(tx, job);
        });
    }

    async cancel(
        ownerId: string,
        noteId: string,
        jobId: string,
        context: TextJobContext,
    ) {
        return transaction(this.persistence, async (tx) => {
            await this.authorize(tx, ownerId, noteId, jobId);
            const job = await find(this.persistence, tx, ownerId, jobId);
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
        ownerId: string,
        noteId: string,
        jobId: string,
    ) {
        const [source] = await tx
            .select()
            .from(sources)
            .where(
                and(
                    eq(sources.jobId, jobId),
                    eq(sources.actorId, ownerId),
                    eq(sources.noteId, noteId),
                ),
            );

        if (!source) throw new TextsAiError('generation_job_not_found');
        await authorizeKnowledgeFieldDraft(tx, ownerId, source);
    }
}
