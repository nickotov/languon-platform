import { OperatorUsdBudgetSchema } from '@languon/contracts';

export type OperatorBudgetFields = {
    maxProviderCostUsdPerAction: string;
    maxProviderCostUsdPerAccountDay: string;
    maxProviderCostUsdPerDay: string;
};
export function operatorBudgetOrderValid(
    values: OperatorBudgetFields,
): boolean {
    const action = usdMicros(values.maxProviderCostUsdPerAction);
    const accountDay = usdMicros(values.maxProviderCostUsdPerAccountDay);
    const day = usdMicros(values.maxProviderCostUsdPerDay);
    if (action !== null && accountDay !== null && action > accountDay)
        return false;
    if (accountDay !== null && day !== null && accountDay > day) return false;
    if (action !== null && day !== null && action > day) return false;
    return true;
}
function usdMicros(value: string): bigint | null {
    const normalized = value.trim();
    if (!normalized) return null;
    OperatorUsdBudgetSchema.parse(normalized);
    const [whole = '0', fraction = ''] = normalized.split('.');
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
