import { useTranslate } from '@refinedev/core';
import { Descriptions } from 'antd';
import type { AdminMcpLimits } from '@languon/contracts';

export function TokenLimitSummary({ limits }: { limits: AdminMcpLimits }) {
    const t = useTranslate();
    const items: { key: string; label: string; children: string }[] = [];
    const add = (key: string, value: string | number) =>
        items.push({ key, label: t(`mcp.${key}`), children: String(value) });
    if (limits.modelChecks) {
        add('checkUsd', limits.modelChecks.perCheckUsd);
        add('dailyUsd', limits.modelChecks.perDayUsd);
        add('concurrency', limits.modelChecks.concurrency);
    }
    if (limits.creditGrants) {
        add('grantOperation', limits.creditGrants.perOperation);
        add('grantDay', limits.creditGrants.perDay);
    }
    if (limits.creditRevocations) {
        add('revokeOperation', limits.creditRevocations.perOperation);
        add('revokeDay', limits.creditRevocations.perDay);
    }
    if (limits.spendingLimits) {
        add('actionCredits', limits.spendingLimits.maximumCreditsPerAction);
        add('actionUsd', limits.spendingLimits.maximumProviderUsdPerAction);
        add(
            'accountUsd',
            limits.spendingLimits.maximumProviderUsdPerAccountDay,
        );
        add('globalUsd', limits.spendingLimits.maximumProviderUsdGloballyDay);
    }
    if (items.length === 0) return t('mcp.noLimits');
    return <Descriptions column={1} size='small' items={items} />;
}
