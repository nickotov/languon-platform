import type { ActionBilling } from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import type { AiCreditTransaction } from './drizzle-ai-credit-participant';
import { aiCreditActionsTable as actions } from './action-accounting-schema';
import { formatCreditMilli } from '../../../domain/exact-credit-amount';
export async function readActionBilling(
    tx: Pick<AiCreditTransaction, 'select'>,
    actionId: string,
    ownerId: string,
): Promise<ActionBilling | undefined> {
    const [action] = await tx
        .select()
        .from(actions)
        .where(and(eq(actions.id, actionId), eq(actions.ownerId, ownerId)))
        .limit(1);

    if (!action) return undefined;
    const free =
        action.funding !== 'customer' ||
        (action.heldMilli === 0n &&
            Object.values(action.tariff).every((rate) => Number(rate) === 0));

    return {
        state: free
            ? 'free'
            : action.state === 'active'
              ? 'held'
              : action.chargedMilli === 0n
                ? 'released'
                : 'charged',
        heldCredits: formatCreditMilli(action.heldMilli),
        chargedCredits:
            action.chargedMilli === null
                ? null
                : formatCreditMilli(action.chargedMilli),
        measurement: action.measurement,
    };
}

export async function withActionBilling<T extends object>(
    tx: Pick<AiCreditTransaction, 'select'>,
    value: T,
    actionId: string,
    ownerId: string,
): Promise<T & { billing?: ActionBilling }> {
    const billing = await readActionBilling(tx, actionId, ownerId);

    return { ...value, ...(billing ? { billing } : {}) };
}
