import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { AiCreditTransaction } from './drizzle-ai-credit-participant';
import {
    aiCreditActionsTable as actions,
    aiCreditActionQuotesTable as quotes,
} from './action-accounting-schema';

function batchLimit(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 100)
        throw new Error('Invalid accounting maintenance batch.');

    return value;
}

/** Bounded maintenance only. Feature owners acquire their operation fence, then persist terminal outcomes in the same transaction. */
export async function overdueAccountingActions(
    tx: AiCreditTransaction,
    capability: string,
    now: Date,
    limit = 20,
) {
    return tx
        .select()
        .from(actions)
        .where(
            and(
                eq(actions.capability, capability),
                eq(actions.state, 'active'),
                lte(actions.deadlineAt, now),
            ),
        )
        .orderBy(asc(actions.deadlineAt), asc(actions.id))
        .limit(batchLimit(limit));
}

export async function removeExpiredActionQuotes(
    tx: AiCreditTransaction,
    now: Date,
    limit = 100,
) {
    const removed = await tx
        .delete(quotes)
        .where(
            sql`${quotes.id} in (select id from ai_credit_action_quotes where expires_at <= ${now.toISOString()}::timestamptz order by expires_at, id limit ${batchLimit(limit)} for update skip locked)`,
        )
        .returning({ id: quotes.id });

    return removed.length;
}
