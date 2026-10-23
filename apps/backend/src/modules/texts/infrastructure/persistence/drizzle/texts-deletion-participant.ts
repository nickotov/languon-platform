import { and, eq, inArray, sql } from 'drizzle-orm';
import { dictionaryTextSelectionJobsTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/selection-card-schema';
import {
    textFoldersTable,
    textIdempotencyTable,
    textRevisionsTable,
    textSharesTable,
    textsTable,
} from './schema';
import { textsAiJobsTable } from './texts-job-schema';
import type { TextsContentTransaction } from './text-content-support';

/** Cancellation only flags work. Workers retain leases and settle dispatched or
 * ambiguous attempts through the normal accounting path before purge can proceed. */
export async function requestTextsCancellation(
    tx: TextsContentTransaction,
    ownerId: string,
    now: Date,
): Promise<void> {
    await tx
        .update(textsAiJobsTable)
        .set({
            cancellationRequestedAt: now,
            failureCategory: 'access_revoked',
            updatedAt: now,
        })
        .where(
            and(
                eq(textsAiJobsTable.ownerId, ownerId),
                inArray(textsAiJobsTable.executionState, ['queued', 'running']),
            ),
        );

    await tx.execute(
        sql`update dictionary_text_selection_jobs set failure_code='access_revoked',cancellation_requested_at=${now.toISOString()}::timestamptz,updated_at=${now.toISOString()}::timestamptz where (owner_id=${ownerId}::uuid or source_owner_id=${ownerId}::uuid) and execution_state in ('queued','running')`,
    );
}

/** Read only opaque lifecycle/accounting metadata, never copied text or authority
 * payloads. A terminal row with an unsettled reservation is still not deletable. */
export async function textsDeletionBusy(
    tx: TextsContentTransaction,
    ownerId: string,
): Promise<boolean> {
    const [busy] = await tx.execute(sql`select 1 from (
        select execution_state, provider_reservation_state, ai_credit_reservation_id, lease_deadline from texts_ai_jobs where owner_id=${ownerId}::uuid
        union all
        select execution_state, provider_reservation_state, ai_credit_reservation_id, lease_deadline from dictionary_text_selection_jobs where owner_id=${ownerId}::uuid or source_owner_id=${ownerId}::uuid
    ) work where execution_state in ('queued','running') or provider_reservation_state='active' or lease_deadline>now() or exists(select 1 from ai_credit_reservations r where r.id=work.ai_credit_reservation_id and r.state='active') limit 1`);

    return !!busy;
}

async function archiveOwnedUsage(
    tx: TextsContentTransaction,
    ownerId: string,
    now: Date,
): Promise<void> {
    // Tables are a fixed internal allowlist; IDs and dates remain bound parameters.
    for (const table of [textsAiJobsTable, dictionaryTextSelectionJobsTable]) {
        await tx.execute(sql`insert into dictionary_generation_provider_usage_archive (
            id, job_kind, owner_id, actual_cost_micros, actual_input_tokens, actual_output_tokens,
            input_cost_micros_per_million_tokens, output_cost_micros_per_million_tokens,
            max_cost_micros_per_attempt, max_input_tokens_per_attempt, max_output_tokens_per_attempt, settled_at, archived_at
        ) select id,job_kind,owner_id,provider_actual_cost_micros,provider_actual_input_tokens,provider_actual_output_tokens,
            provider_input_cost_micros_per_million_tokens,provider_output_cost_micros_per_million_tokens,
            provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt,provider_reservation_settled_at,${now.toISOString()}::timestamptz
          from ${table} where owner_id=${ownerId}::uuid and provider_reservation_state='settled'
            and provider_reservation_settled_at>${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz
          on conflict (id) do nothing`);
    }
}

/** Caller holds the owner's deletion fence. Independent foreign cards/copies are
 * never erased: terminal foreign job receipts remain, with source identity removed. */
export async function eraseTextsOwnedContent(
    tx: TextsContentTransaction,
    ownerId: string,
    now: Date,
): Promise<void> {
    if (await textsDeletionBusy(tx, ownerId))
        throw new Error('Text work is not quiescent');
    await archiveOwnedUsage(tx, ownerId, now);
    await tx
        .delete(dictionaryTextSelectionJobsTable)
        .where(eq(dictionaryTextSelectionJobsTable.ownerId, ownerId));

    await tx.execute(
        sql`update dictionary_text_selection_jobs set source_owner_id=null where source_owner_id=${ownerId}::uuid`,
    );

    await tx
        .delete(textsAiJobsTable)
        .where(eq(textsAiJobsTable.ownerId, ownerId));

    await tx
        .delete(textIdempotencyTable)
        .where(eq(textIdempotencyTable.ownerId, ownerId));

    await tx
        .delete(textSharesTable)
        .where(eq(textSharesTable.ownerId, ownerId));

    await tx
        .delete(textRevisionsTable)
        .where(eq(textRevisionsTable.ownerId, ownerId));

    await tx.delete(textsTable).where(eq(textsTable.ownerId, ownerId));
    await tx
        .delete(textFoldersTable)
        .where(eq(textFoldersTable.ownerId, ownerId));
}
