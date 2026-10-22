import {
    settleInterviewAction,
    usesActionAccounting,
} from '../../interview-action-accounting';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { settleInterruptedInterviewCalls } from '../../interview-accounting';
import {
    learnerPortraitInterviewOperationsTable as operations,
    learnerPortraitInterviewsTable as interviews,
} from './schema';
import { and, eq, lte, sql } from 'drizzle-orm';
import type { PortraitTransaction } from './drizzle-portrait-store';

type PurgeAuthorization = { workerId: string; fencingToken: number };

async function assertPurgeClaim(
    tx: PortraitTransaction,
    ownerId: string,
    authorization: PurgeAuthorization,
): Promise<void> {
    await tx.execute(sql`select public.languon_assert_accounting_purge_claim(
        ${ownerId}::uuid,${authorization.workerId},${authorization.fencingToken}::integer)`);
}

async function recoverPurgeInterviewAction(
    tx: PortraitTransaction,
    ownerId: string,
    operationId: string,
    authorization: PurgeAuthorization,
): Promise<void> {
    await tx.execute(sql`select public.languon_recover_purge_interview_action(
        ${ownerId}::uuid,${authorization.workerId},${authorization.fencingToken}::integer,${operationId}::uuid)`);
}

/** Strip every private input immediately. Keep numerical identities until their
 * already-admitted provider call and reservation have been settled. */
export async function clearLearnerPortraitInterview(
    tx: PortraitTransaction,
    ownerId: string,
    authorization?: PurgeAuthorization,
): Promise<void> {
    if (authorization) await assertPurgeClaim(tx, ownerId, authorization);
    await tx.execute(
        sql`update learner_portrait_interview_operations set lease_token=null where owner_id=${ownerId}::uuid and state='queued'`,
    );
    await tx.execute(sql`update learner_portrait_interview_operations o set cancel_requested=true,
        fingerprint='erased',
        state=case when state='queued'
          and not exists(select 1 from learner_portrait_interview_provider_calls p where p.operation_id=o.id and p.state<>'settled')
          and not exists(select 1 from ai_credit_reservations r where r.job_id=o.id and r.job_kind='portrait-interview' and r.state='active')
          then 'cancelled' else state end,
        lease_until=case when state='queued' then null else lease_until end,
        input='{"kind":"skip","topic":"update"}'::jsonb,
        context='{"locale":"en","approvedItems":null,"draftItems":null,"messages":[],"completedTopics":[]}'::jsonb,
        result=null where owner_id=${ownerId}::uuid`);
    const cancelled = await tx
        .select({
            id: operations.id,
            ownerId: operations.ownerId,
            execution: operations.execution,
            errorCode: authorization
                ? sql<string | null>`null`
                : operations.errorCode,
        })
        .from(operations)
        .where(
            and(
                eq(operations.ownerId, ownerId),
                eq(operations.state, 'cancelled'),
            ),
        );
    for (const operation of cancelled) {
        if (authorization && usesActionAccounting(operation.execution))
            await recoverPurgeInterviewAction(
                tx,
                ownerId,
                operation.id,
                authorization,
            );
        else await settleInterviewAction(tx, operation, 'failure', new Date());
    }
    await tx.execute(
        sql`delete from learner_portrait_interviews where owner_id=${ownerId}::uuid`,
    );
    await eraseTerminalOperations(tx, ownerId, new Date());
}
export async function requestPortraitCancellation(
    tx: PortraitTransaction,
    ownerId: string,
    authorization?: PurgeAuthorization,
): Promise<void> {
    await recoverExpiredPortraitOperations(
        tx,
        ownerId,
        new Date(),
        authorization,
    );
    await clearLearnerPortraitInterview(tx, ownerId, authorization);
}
export async function portraitDeletionBusy(
    tx: PortraitTransaction,
    ownerId: string,
    now = new Date(),
    authorization?: PurgeAuthorization,
): Promise<boolean> {
    await recoverExpiredPortraitOperations(tx, ownerId, now, authorization);
    const rows =
        await tx.execute(sql`select 1 from learner_portrait_interview_operations o where o.owner_id=${ownerId}::uuid and
      (o.state in ('queued','running') or o.lease_until>${now.toISOString()}::timestamptz
      or exists(select 1 from ai_credit_actions a where a.id=o.id and a.state='active')
      or exists(select 1 from ai_credit_reservations r where r.job_kind='portrait-interview' and r.job_id=o.id and r.state='active')
      or exists(select 1 from learner_portrait_interview_provider_calls p where p.operation_id=o.id and p.state<>'settled')) limit 1`);
    return rows.length > 0;
}
async function eraseTerminalOperations(
    tx: PortraitTransaction,
    ownerId: string,
    now: Date,
): Promise<void> {
    const terminal = sql`select o.id from learner_portrait_interview_operations o where o.owner_id=${ownerId}::uuid and o.state not in ('queued','running')
      and not exists(select 1 from ai_credit_reservations r where r.job_kind='portrait-interview' and r.job_id=o.id and r.state='active')
      and not exists(select 1 from learner_portrait_interview_provider_calls p where p.operation_id=o.id and p.state<>'settled')`;
    await tx.execute(sql`insert into dictionary_generation_provider_usage_archive (
      id,job_kind,owner_id,actual_cost_micros,actual_input_tokens,actual_output_tokens,input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens,
      max_cost_micros_per_attempt,max_input_tokens_per_attempt,max_output_tokens_per_attempt,settled_at,archived_at)
      select p.id,'portrait-interview',p.owner_id,p.actual_cost_micros,p.actual_input_tokens,p.actual_output_tokens,p.input_cost_micros_per_million_tokens,p.output_cost_micros_per_million_tokens,
      p.max_cost_micros_per_attempt,p.max_input_tokens_per_attempt,p.max_output_tokens_per_attempt,p.settled_at,${now.toISOString()}::timestamptz
      from learner_portrait_interview_provider_calls p where p.operation_id in (${terminal}) and p.state='settled'
      and p.settled_at>${new Date(now.getTime() - 86400_000).toISOString()}::timestamptz on conflict(id) do nothing`);
    await tx.execute(
        sql`delete from learner_portrait_interview_provider_calls where operation_id in (${terminal})`,
    );
    await tx.execute(
        sql`delete from learner_portrait_interview_operations where id in (${terminal})`,
    );
}
export async function eraseOwnerLearnerPortrait(
    tx: PortraitTransaction,
    ownerId: string,
    now: Date,
    authorization?: PurgeAuthorization,
): Promise<void> {
    if (await portraitDeletionBusy(tx, ownerId, now, authorization))
        throw new Error('Portrait work is not quiescent');
    await eraseTerminalOperations(tx, ownerId, now);
    await tx.execute(
        sql`delete from learner_portrait_interviews where owner_id=${ownerId}::uuid`,
    );
    await tx.execute(
        sql`delete from learner_portraits where owner_id=${ownerId}::uuid`,
    );
}

/** Privacy and account purge do not depend on an interview-capable executor.
 * Only expired leases can be recovered; live provider calls keep their fence. */
export async function recoverExpiredPortraitOperations(
    tx: PortraitTransaction,
    ownerId: string,
    now: Date,
    authorization?: PurgeAuthorization,
): Promise<void> {
    await lockTextAiCapacity(tx);
    if (authorization) await assertPurgeClaim(tx, ownerId, authorization);
    const ownerQuery = tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, ownerId));
    // The checked purge claim already locks the user through its restricted seam.
    const [owner] = authorization
        ? await ownerQuery
        : await ownerQuery.for('update');
    const expired = await tx
        .select({
            id: operations.id,
            ownerId: operations.ownerId,
            interviewId: operations.interviewId,
            state: operations.state,
            execution: operations.execution,
            cancelRequested: operations.cancelRequested,
            leaseUntil: operations.leaseUntil,
        })
        .from(operations)
        .where(
            and(
                eq(operations.ownerId, ownerId),
                eq(operations.state, 'running'),
                lte(operations.leaseUntil, now),
            ),
        )
        .for('update');
    for (const row of expired) {
        const purgeAction =
            authorization && usesActionAccounting(row.execution);
        if (!purgeAction) await settleInterruptedInterviewCalls(tx, row);
        const [session] = await tx
            .select({ expiresAt: interviews.expiresAt })
            .from(interviews)
            .where(eq(interviews.id, row.interviewId));
        if (
            !row.cancelRequested &&
            owner?.status === 'active' &&
            session &&
            session.expiresAt > now
        ) {
            await tx
                .update(operations)
                .set({
                    state: 'failed',
                    errorCode: 'interrupted',
                    leaseUntil: null,
                    leaseToken: null,
                    context: {
                        locale: 'en',
                        approvedItems: null,
                        draftItems: null,
                        messages: [],
                        completedTopics: [],
                    },
                })
                .where(eq(operations.id, row.id));
            if (purgeAction)
                await recoverPurgeInterviewAction(
                    tx,
                    ownerId,
                    row.id,
                    authorization,
                );
            continue;
        }
        await tx.execute(sql`update learner_portrait_interview_operations set state='cancelled',cancel_requested=true,error_code='interrupted',lease_until=null,lease_token=null,
            fingerprint='erased',input='{"kind":"skip","topic":"update"}'::jsonb,
            context='{"locale":"en","approvedItems":null,"draftItems":null,"messages":[],"completedTopics":[]}'::jsonb,result=null
            where id=${row.id}::uuid`);
        if (purgeAction)
            await recoverPurgeInterviewAction(
                tx,
                ownerId,
                row.id,
                authorization,
            );
    }
}
