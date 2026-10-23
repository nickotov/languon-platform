import type { TextSelectionJob } from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { SelectionLease } from '../../../application/ports/text-selection-store';
import { TextSelectionError } from '../../../domain/text-selection';
import { dictionaryTextSelectionJobsTable as jobs } from './selection-card-schema';
import { settleSelectionAttempt } from './text-selection-accounting';
import { type SelectionTransaction } from './text-selection-target';

export type Row = typeof jobs.$inferSelect;
export const selectionJobView = (j: Row): TextSelectionJob => ({
    id: j.id,
    state: j.executionState,
    failureCode: j.failureCode === 'explicit_stop' ? null : j.failureCode,
    dictionaryId: j.dictionaryId,
    cardId: j.cardId,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
});
const terminalInput = {
    inputPayload: null,
    sourceAuthority: null,
    target: null,
    workerId: null,
    leaseDeadline: null,
    heartbeatAt: null,
};

export async function lockSelectionOwner(
    tx: SelectionTransaction,
    ownerId: string,
    optional = false,
) {
    const [user] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.id, ownerId), eq(usersTable.status, 'active')))
        .for('share');

    if (!user && !optional) throw new TextSelectionError('not_found');

    return !!user;
}

export async function beginSelectionTransaction(tx: SelectionTransaction) {
    await tx.execute(
        sql`select set_config('languon.texts_execution_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
    );

    await lockTextAiCapacity(tx);
}

export function selectionLeaseOwned(
    job: Row | undefined,
    lease: SelectionLease,
    now: Date,
) {
    return (
        !!job &&
        job.executionState === 'running' &&
        job.workerId === lease.workerId &&
        job.fencingToken === lease.fencingToken &&
        job.attemptCount === lease.attempt &&
        !!job.leaseDeadline &&
        job.leaseDeadline > now
    );
}

export async function finishSelectionJob(
    tx: SelectionTransaction,
    job: Row,
    state: 'failed' | 'cancelled' | 'completed',
    failureCode: string | null,
    now: Date,
    usage?: { inputTokens: number; outputTokens: number },
) {
    await settleSelectionAttempt(
        tx,
        job,
        now,
        usage,
        state === 'completed'
            ? 'success'
            : state === 'cancelled' &&
                job.cancellationRequestedAt &&
                job.failureCode !== 'access_revoked'
              ? 'stopped'
              : 'failure',
    );

    await tx
        .update(jobs)
        .set({
            ...terminalInput,
            executionState: state,
            failureCode:
                state === 'cancelled' &&
                job.cancellationRequestedAt &&
                job.failureCode !== 'access_revoked'
                    ? 'explicit_stop'
                    : failureCode,
            cancellationRequestedAt: job.cancellationRequestedAt,
            updatedAt: now,
        })
        .where(eq(jobs.id, job.id));
}
