import type { AccountingRecord, ProviderPrice } from '@languon/contracts';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type {
    AccountingCredits,
    ProviderExpenseFact,
} from '../../../application/accounting-store';
import {
    AccountingInvalidRecordError,
    formatFixed,
} from '../../../domain/accounting';
import type { aiAccountingRecordsTable as records } from './accounting-schema';

export type Database = PostgresJsDatabase<typeof databaseSchema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type RecordRow = typeof records.$inferSelect;

export const usd = (value: bigint) => formatFixed(value, 6);

export const dto = (row: RecordRow): AccountingRecord => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    grantId: row.grantId,
    data: row.data,
});

// Both existing capability attempts and newer whole-action holds retain purchase-lot attribution.
export const purchaseAllocations = sql`select x.grant_id, x.allocated_credits, x.settled_credits, q.created_at, q.settled_at, q.state::text as state from ai_credit_reservation_allocations x join ai_credit_reservations q on q.id=x.reservation_id union all select x.grant_id, x.allocated_milli as allocated_credits, x.settled_milli as settled_credits, q.created_at, q.settled_at, q.state from ai_credit_action_allocations x join ai_credit_actions q on q.id=x.action_id`;

export const canonical = (value: unknown): string =>
    JSON.stringify(value, Object.keys(value as object).sort());

/** Call in the owning settlement transaction, including failed and free provider attempts. */
export async function recordProviderExpense(
    tx: Transaction,
    fact: ProviderExpenseFact,
    options?: { nativePrice?: ProviderPrice | null | undefined },
): Promise<void> {
    if (!fact.attemptId)
        throw new AccountingInvalidRecordError(
            'Provider expense requires its authoritative text attempt.',
        );
    const assertion = {
        ...fact,
        amountUsdMicros: fact.amountUsdMicros?.toString() ?? null,
        occurredAt: fact.occurredAt.toISOString(),
    };

    await tx.execute(
        // Native expense comes from immutable per-call DB checkpoints, including
        // reported money when the SDK omitted aggregate token counters.
        sql`select languon_record_text_provider_expense(${fact.attemptId}::uuid, ${options?.nativePrice?.nativeRules ? null : JSON.stringify(assertion)}::jsonb)`,
    );
}

/** Existing owner purge calls this in the same transaction before deleting the owner. */
export async function anonymizeAccountingOwner(
    tx: Transaction,
    ownerId: string,
): Promise<void> {
    await tx.execute(
        sql`select languon_anonymize_accounting_owner(${ownerId}::uuid)`,
    );
}

/** Terminal changes only; fixed lock order across <=64 registrations prevents deadlocks. */
export async function markAccountingReportsDirty(
    tx: Transaction,
): Promise<void> {
    await tx.execute(sql`select languon_mark_accounting_reports_dirty()`);
}

export interface AccountingStoreContext {
    readonly database: Database;
    readonly credits: (tx: Transaction) => AccountingCredits;
}
