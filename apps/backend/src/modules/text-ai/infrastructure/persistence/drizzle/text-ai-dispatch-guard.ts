import { and, desc, eq, sql } from 'drizzle-orm';
import type { AiCreditTransaction } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiCreditActionAttemptsTable as attempts } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { TextAiSelectionUnavailableError } from '../../../application/text-ai-admission-participant';
import { textAiRouteDispatchesTable as dispatches } from './route-dispatch-schema';
import { currentTextAiRouting } from './drizzle-text-ai-routing-store';

/** Called only after the owning feature has locked and verified its live lease.
 * Claim reserves a call. Recheck the actual admitted receipt immediately before
 * provider HTTP; this must not try to admit/retry that already reserved call. */
export async function recheckTextAiDispatch(
    tx: AiCreditTransaction,
    input: {
        actionId: string;
        jobId: string;
        now: Date;
    },
) {
    const [receipt] = await tx
        .select({ snapshot: dispatches.snapshot, routeId: dispatches.routeId })
        .from(dispatches)
        .innerJoin(attempts, eq(attempts.id, dispatches.attemptId))
        .where(
            and(
                eq(attempts.actionId, input.actionId),
                eq(attempts.executionJobId, input.jobId),
                eq(attempts.state, 'dispatched'),
            ),
        )
        .orderBy(desc(attempts.ordinal))
        .limit(1);

    if (!receipt) {
        throw new Error('Provider dispatch requires its admitted receipt.');
    }

    const authority = receipt.snapshot.routingAuthority;
    if (!authority) {
        return;
    } // Immutable work admitted before managed routing drains.

    const current = await currentTextAiRouting(tx);
    const candidate = authority.candidates.find(
        (entry) => entry.routeId === receipt.routeId,
    );

    if (
        !current?.configuration.enabledRouteIds.includes(receipt.routeId) ||
        !candidate ||
        !(await isTextAiRuntimeDispatchAllowed(tx, {
            routeId: receipt.routeId,
            flowId: authority.flowId,
            fingerprint: candidate.fingerprint,
            now: input.now,
        }))
    ) {
        throw new TextAiSelectionUnavailableError();
    }
}

/** Runtime observations can impose a bounded cooldown; diagnostic history has no authority. */
export async function isTextAiRuntimeDispatchAllowed(
    tx: AiCreditTransaction,
    input: { routeId: string; flowId: string; now: Date; fingerprint: string },
): Promise<boolean> {
    const rows = await tx.execute(
        sql`select languon_text_ai_route_dispatch_allowed(${input.routeId},${input.flowId},${input.fingerprint},${input.now.toISOString()}::timestamptz) as allowed`,
    );

    return rows[0]?.allowed === true;
}
