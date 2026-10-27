import { Form, Input, InputNumber, Typography } from 'antd';
import { useTranslate } from '@refinedev/core';
import type { AdminMcpPermission } from '@languon/contracts';

export function TokenLimitsFields({
    permissions,
}: {
    permissions: AdminMcpPermission[];
}) {
    const t = useTranslate();
    const hasChecks = permissions.includes('model-checks.run');
    const hasGrants = permissions.includes('credits.grant');
    const hasRevocations = permissions.includes('credits.revoke');
    const hasSpending = permissions.includes('spending-limits.write');
    const fields: { name: string[]; label: string }[] = [];
    if (hasChecks)
        fields.push(
            {
                name: ['limits', 'modelChecks', 'perCheckUsd'],
                label: 'mcp.checkUsd',
            },
            {
                name: ['limits', 'modelChecks', 'perDayUsd'],
                label: 'mcp.dailyUsd',
            },
        );
    if (hasGrants)
        fields.push(
            {
                name: ['limits', 'creditGrants', 'perOperation'],
                label: 'mcp.grantOperation',
            },
            {
                name: ['limits', 'creditGrants', 'perDay'],
                label: 'mcp.grantDay',
            },
        );
    if (hasRevocations)
        fields.push(
            {
                name: ['limits', 'creditRevocations', 'perOperation'],
                label: 'mcp.revokeOperation',
            },
            {
                name: ['limits', 'creditRevocations', 'perDay'],
                label: 'mcp.revokeDay',
            },
        );
    if (hasSpending)
        fields.push(
            {
                name: ['limits', 'spendingLimits', 'maximumCreditsPerAction'],
                label: 'mcp.actionCredits',
            },
            {
                name: [
                    'limits',
                    'spendingLimits',
                    'maximumProviderUsdPerAction',
                ],
                label: 'mcp.actionUsd',
            },
            {
                name: [
                    'limits',
                    'spendingLimits',
                    'maximumProviderUsdPerAccountDay',
                ],
                label: 'mcp.accountUsd',
            },
            {
                name: [
                    'limits',
                    'spendingLimits',
                    'maximumProviderUsdGloballyDay',
                ],
                label: 'mcp.globalUsd',
            },
        );
    return (
        <>
            {fields.map((field) => (
                <Form.Item
                    key={field.label}
                    name={field.name}
                    label={t(field.label)}
                    rules={[{ required: true, message: t('mcp.required') }]}
                >
                    <Input inputMode='decimal' />
                </Form.Item>
            ))}
            {hasChecks ? (
                <Form.Item
                    name={['limits', 'modelChecks', 'concurrency']}
                    label={t('mcp.concurrency')}
                    rules={[{ required: true }]}
                >
                    <InputNumber min={1} max={10} precision={0} />
                </Form.Item>
            ) : null}
            <Typography.Paragraph type='secondary'>
                {t('mcp.budgetHelp')}
            </Typography.Paragraph>
        </>
    );
}
