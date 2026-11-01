import { and, eq } from 'drizzle-orm';
import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import {
    TextsAiError,
    type TextsTokenUsage,
} from '../../../application/ports/texts-ai-provider';
import type {
    TextJobContext,
    TextsLease,
} from '../../../application/ports/texts-job-store';
import { settleTextsAttempt } from './texts-job-accounting';
import {
    clearLease,
    owned,
    type TextsJobStoreContext,
} from './texts-job-persistence-support';
import { textsAiJobsTable as jobs } from './texts-job-schema';
import {
    authorizeTextsJob,
    exposeOwnedTextsJob,
    type TextsJobRow,
    type TextsTransaction,
} from './texts-job-support';
import { transaction } from './texts-job-transaction';

export async function find(
    persistence: TextsJobStoreContext,
    tx: TextsTransaction,
    ownerId: string,
    jobId: string,
) {
    const [candidate] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.ownerId, ownerId)));

    if (!candidate) {
        throw new TextsAiError('generation_job_not_found');
    }

    // Reading or stopping an existing job must survive edits to its destination
    // Text. Knowledge-backed jobs still require their current source grant.
    await authorizeTextsJob(tx, {
        ownerId,
        folderId: candidate.folderId,
        id: candidate.id,
        externalSourceKind: candidate.externalSourceKind,
    });

    const [job] = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .for('update');

    return job!;
}

export async function get(
    persistence: TextsJobStoreContext,
    ownerId: string,
    jobId: string,
    context: TextJobContext,
) {
    context.signal.throwIfAborted();

    return transaction(persistence, async (tx) => {
        const job = await find(persistence, tx, ownerId, jobId);
        if (job.format === 'text-translation:v4') {
            throw new TextsAiError('generation_job_not_found');
        }

        if (job.expiresAt <= context.now) {
            throw new TextsAiError('generation_proposal_expired');
        }

        return withActionBilling(
            tx,
            await exposeOwnedTextsJob(tx, job),
            job.id,
            job.ownerId,
        );
    });
}

export async function cancel(
    persistence: TextsJobStoreContext,
    ownerId: string,
    jobId: string,
    context: TextJobContext,
) {
    context.signal.throwIfAborted();

    return transaction(persistence, async (tx) => {
        const job = await find(persistence, tx, ownerId, jobId);
        if (job.format === 'text-translation:v4') {
            throw new TextsAiError('generation_job_not_found');
        }

        if (
            job.expiresAt <= context.now &&
            job.executionState === 'completed'
        ) {
            throw new TextsAiError('generation_proposal_expired');
        }

        if (
            job.executionState === 'queued' ||
            job.executionState === 'running'
        ) {
            await terminal(persistence, tx, job, context.now, null);
            const [updated] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));

            return withActionBilling(
                tx,
                await exposeOwnedTextsJob(tx, updated!),
                updated!.id,
                updated!.ownerId,
            );
        }

        if (
            job.executionState === 'completed' &&
            job.jobKind === 'text-translation' &&
            !job.appliedTextId
        ) {
            const [discarded] = await tx
                .update(jobs)
                .set({
                    cancellationRequestedAt: context.now,
                    resultPayload: null,
                    updatedAt: context.now,
                })
                .where(eq(jobs.id, job.id))
                .returning();

            return withActionBilling(
                tx,
                await exposeOwnedTextsJob(tx, discarded!),
                discarded!.id,
                discarded!.ownerId,
            );
        }

        return withActionBilling(
            tx,
            await exposeOwnedTextsJob(tx, job),
            job.id,
            job.ownerId,
        );
    });
}

export async function valid(
    persistence: TextsJobStoreContext,
    tx: TextsTransaction,
    job: TextsJobRow,
    now: Date,
) {
    if (job.expiresAt <= now) {
        return 'generation_proposal_expired';
    }

    if (!job.inputPayload) {
        return 'stale_content';
    }

    try {
        await authorizeTextsJob(tx, job);

        return null;
    } catch (error) {
        if (error instanceof TextsAiError) {
            return error.code === 'version_conflict'
                ? 'stale_content'
                : 'access_revoked';
        }

        throw error;
    }
}

export async function terminal(
    persistence: TextsJobStoreContext,
    tx: TextsTransaction,
    job: TextsJobRow,
    now: Date,
    failure: string | null,
    usage?: TextsTokenUsage,
) {
    await settleTextsAttempt(
        tx,
        job,
        now,
        usage,
        failure || job.failureCategory === 'access_revoked'
            ? 'failure'
            : 'stopped',
    );

    await tx
        .update(jobs)
        .set({
            ...clearLease,
            executionState: failure ? 'failed' : 'cancelled',
            failureCategory:
                failure ??
                (job.failureCategory === 'access_revoked'
                    ? 'access_revoked'
                    : 'explicit_stop'),
            cancellationRequestedAt: failure
                ? job.cancellationRequestedAt
                : (job.cancellationRequestedAt ?? now),
            completedAt: now,
            updatedAt: now,
            inputPayload: null,
            resultPayload: null,
        })
        .where(eq(jobs.id, job.id));
}

export async function lockJob(
    persistence: TextsJobStoreContext,
    tx: TextsTransaction,
    lease: TextsLease,
    now: Date,
) {
    const [candidate] = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, lease.jobId));

    if (!candidate) {
        return null;
    }

    const invalid = await valid(persistence, tx, candidate, now);
    const [job] = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, lease.jobId))
        .for('update');

    if (!job || !owned(job, lease, now)) {
        return null;
    }

    return { job, invalid };
}
