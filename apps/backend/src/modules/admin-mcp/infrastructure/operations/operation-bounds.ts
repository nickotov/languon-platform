import {
    AdminMcpError,
    amountUnits,
    type AdminMcpActor,
} from '../../domain/admin-mcp';

export function assertCreditBounds(
    actor: AdminMcpActor,
    operation: 'credits.grant' | 'credits.revoke',
    amount: string,
) {
    const bounds =
        operation === 'credits.grant'
            ? actor.limits.creditGrants
            : actor.limits.creditRevocations;
    if (!bounds || amountUnits(amount) > amountUnits(bounds.perOperation))
        throw new AdminMcpError(
            'quota_exceeded',
            'Credit adjustment exceeds the delegated limit.',
        );
}
export function assertUserBudgetBounds(actor: AdminMcpActor, amount: string) {
    const maximum = actor.limits.spendingLimits?.maximumCreditsPerAction;
    if (!maximum || amountUnits(amount) > amountUnits(maximum))
        throw new AdminMcpError(
            'quota_exceeded',
            'Learner action budget exceeds the delegated finite ceiling.',
        );
}
export function assertSpendingBounds(
    actor: AdminMcpActor,
    input: {
        defaultMaxCreditsPerAction: string | null;
        maxProviderCostUsdPerAction: string | null;
        maxProviderCostUsdPerAccountDay: string | null;
        maxProviderCostUsdPerDay: string | null;
    },
) {
    const bounds = actor.limits.spendingLimits;
    if (!bounds)
        throw new AdminMcpError(
            'permission_denied',
            'Spending-limit authority is not configured.',
        );
    const pairs = [
        [input.defaultMaxCreditsPerAction, bounds.maximumCreditsPerAction],
        [input.maxProviderCostUsdPerAction, bounds.maximumProviderUsdPerAction],
        [
            input.maxProviderCostUsdPerAccountDay,
            bounds.maximumProviderUsdPerAccountDay,
        ],
        [input.maxProviderCostUsdPerDay, bounds.maximumProviderUsdGloballyDay],
    ] as const;
    if (
        pairs.some(
            ([value, maximum]) =>
                value === null || amountUnits(value) > amountUnits(maximum),
        )
    )
        throw new AdminMcpError(
            'quota_exceeded',
            'All application budgets must remain within the delegated finite ceilings.',
        );
}
