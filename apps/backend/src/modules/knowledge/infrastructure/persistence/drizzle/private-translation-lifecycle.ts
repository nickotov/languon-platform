import { and, eq, inArray, sql } from 'drizzle-orm';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { knowledgeTextJobSourcesTable as sources } from './private-translation-schema';
import { textsAiJobsTable as jobs } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-schema';
import { settleTextsAttempt } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-accounting';
import { clearLease } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-persistence-support';

/** Caller holds global admission, then source deletion locks. Private actors never own the source. */
export async function eraseKnowledgeTranslationJobs(
    tx: KnowledgeTransaction,
    noteId: string,
    now: Date,
) {
    await tx.execute(
        sql`select set_config('languon.ai_credit_settlement_revision','1',true),set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true)`,
    );

    const linked = await tx
        .select({ id: sources.jobId })
        .from(sources)
        .where(eq(sources.noteId, noteId));

    if (!linked.length) return;
    const rows = await tx
        .select()
        .from(jobs)
        .where(
            inArray(
                jobs.id,
                linked.map((row) => row.id),
            ),
        )
        .orderBy(jobs.id)
        .for('update');

    for (const job of rows) {
        if (
            job.executionState === 'queued' ||
            job.executionState === 'running'
        ) {
            await settleTextsAttempt(tx, job, now, undefined, 'failure');
            await tx
                .update(jobs)
                .set({
                    ...clearLease,
                    executionState: 'cancelled',
                    cancellationRequestedAt: now,
                    failureCategory: 'access_revoked',
                    completedAt: now,
                    updatedAt: now,
                    inputPayload: null,
                    resultPayload: null,
                })
                .where(
                    and(
                        eq(jobs.id, job.id),
                        eq(jobs.externalSourceKind, 'knowledge-block'),
                    ),
                );
        } else {
            await tx
                .update(jobs)
                .set({
                    inputPayload: null,
                    resultPayload: null,
                    updatedAt: now,
                })
                .where(eq(jobs.id, job.id));
        }
    }
}
