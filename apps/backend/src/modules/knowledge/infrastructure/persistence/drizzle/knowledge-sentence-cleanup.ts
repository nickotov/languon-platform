import { and, eq, inArray } from 'drizzle-orm';
import { sentenceAiJobsTable as jobs } from '../../../../learning/infrastructure/persistence/drizzle/sentence-schema';
import { settleSentenceAttempt } from '../../../../learning/infrastructure/persistence/drizzle/sentence-job-accounting';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import type { KnowledgeTransaction } from './knowledge-transaction';

/** Called before deleting a note. Invalidated worker fences cannot publish private source content. */
export async function eraseKnowledgeSentenceJobs(
    tx: KnowledgeTransaction,
    noteId: string,
    now: Date,
) {
    await lockTextAiCapacity(tx);
    const active = await tx
        .select()
        .from(jobs)
        .where(
            and(
                eq(jobs.sourceKind, 'knowledge-vocabulary'),
                eq(jobs.sourceNoteId, noteId),
                inArray(jobs.executionState, ['queued', 'running']),
            ),
        )
        .orderBy(jobs.learnerId, jobs.id)
        .for('update');

    for (const job of active) {
        await settleSentenceAttempt(tx, job, now, undefined, 'failure');
        await tx
            .update(jobs)
            .set({
                executionState: 'cancelled',
                workerId: null,
                leaseDeadline: null,
                heartbeatAt: null,
                cancellationRequestedAt: now,
                failureCategory: 'access_revoked',
                completedAt: now,
                updatedAt: now,
                fencingToken: job.fencingToken + 1n,
            })
            .where(eq(jobs.id, job.id));
    }
}
