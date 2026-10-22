import type { AccountingReport } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Alert, Card, Descriptions, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import styles from './accounting-report.module.css';

export function AccountingReportPanel({
    report,
}: {
    report: AccountingReport;
}) {
    const t = useTranslate();
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 10_000);
        return () => window.clearInterval(timer);
    }, []);
    const stale = now - Date.parse(report.generatedAt) > 60_000;
    const freshnessColor = stale ? 'orange' : 'green';
    const freshnessLabel = stale
        ? t('accounting.stale')
        : t('accounting.fresh');
    const expenseLabel = report.usage.complete
        ? t('accounting.expense')
        : t('accounting.knownExpense');
    const amounts = [
        {
            key: 'payments',
            label: t('accounting.payments'),
            children: report.cash.paymentsUsd,
        },
        {
            key: 'refunds',
            label: t('accounting.refunds'),
            children: report.cash.refundsUsd,
        },
        {
            key: 'fees',
            label: t('accounting.fees'),
            children: report.cash.feesUsd,
        },
        {
            key: 'net',
            label: t('accounting.net'),
            children: report.cash.netReceiptsUsd,
        },
        {
            key: 'expense',
            label: expenseLabel,
            children: report.usage.calculatedExpenseUsd,
        },
        {
            key: 'allocated',
            label: t('accounting.allocated'),
            children: report.usage.allocatedPurchaseValueUsd,
        },
        {
            key: 'unused',
            label: t('accounting.unused'),
            children: report.usage.unusedPurchaseValueUsd,
        },
        {
            key: 'loss',
            label: t('accounting.loss'),
            children: report.usage.refundedConsumedValueUsd,
        },
        {
            key: 'adjustment',
            label: t('accounting.adjustment'),
            children: report.usage.manualUnallocatedAdjustmentUsd,
        },
        {
            key: 'margin',
            label: t('accounting.margin'),
            children: report.usage.complete
                ? report.usage.operationalMarginUsd
                : t('accounting.unknown'),
        },
    ];
    const items = amounts.map((item) => ({
        ...item,
        children: <span className={styles.amount}>{item.children}</span>,
    }));
    const columns = [
        { title: t('speech.provider'), dataIndex: 'providerId' },
        { title: t('accounting.deposits'), dataIndex: 'depositsUsd' },
        { title: t('accounting.expense'), dataIndex: 'calculatedExpenseUsd' },
        {
            title: t('accounting.latestBalance'),
            render: (_: unknown, row: AccountingReport['providers'][number]) =>
                row.latestBalanceUsd ?? t('accounting.unknown'),
        },
        { title: t('accounting.observed'), dataIndex: 'balanceObservedAt' },
        {
            title: t('accounting.estimatedRemaining'),
            dataIndex: 'estimatedRemainingUsd',
        },
    ];
    return (
        <Space direction='vertical' size='large' style={{ width: '100%' }}>
            <Card title={t('accounting.summary')}>
                <Space wrap>
                    <Tag color={freshnessColor}>{freshnessLabel}</Tag>
                    <Typography.Text>
                        {t('accounting.generated', {
                            time: report.generatedAt,
                        })}
                    </Typography.Text>
                </Space>
                {!report.usage.complete ? (
                    <Alert
                        type='warning'
                        message={t('accounting.incomplete')}
                    />
                ) : null}
                <Typography.Paragraph>
                    {t('accounting.quality', {
                        measured: report.usage.measuredCount,
                        estimated: report.usage.estimatedCount,
                        unknown: report.usage.unknownCount,
                    })}
                </Typography.Paragraph>
                <Descriptions
                    bordered
                    column={{ xs: 1, sm: 2, xl: 3 }}
                    items={items}
                />
            </Card>
            <Card title={t('accounting.providers')}>
                <Typography.Paragraph>
                    {t('accounting.providerHelp')}
                </Typography.Paragraph>
                <Table
                    rowKey='providerId'
                    columns={columns}
                    dataSource={report.providers}
                    pagination={false}
                    scroll={{ x: 1050 }}
                />
                {report.providers.map((provider) => (
                    <ProviderBills
                        key={provider.providerId}
                        provider={provider}
                    />
                ))}
            </Card>
        </Space>
    );
}
function ProviderBills({
    provider,
}: {
    provider: AccountingReport['providers'][number];
}) {
    const t = useTranslate();
    if (provider.bills.length === 0) return null;
    const columns = [
        { title: t('accounting.reference'), dataIndex: 'id' },
        { title: t('accounting.periodStart'), dataIndex: 'periodStart' },
        { title: t('accounting.periodEnd'), dataIndex: 'periodEnd' },
        { title: t('accounting.invoice'), dataIndex: 'invoiceUsd' },
        { title: t('accounting.expense'), dataIndex: 'calculatedExpenseUsd' },
        {
            title: t('accounting.adjustment'),
            dataIndex: 'unallocatedAdjustmentUsd',
        },
        { title: t('accounting.unknown'), dataIndex: 'unknownCount' },
    ];
    return (
        <>
            <Typography.Title level={4}>
                {t('accounting.bills', { provider: provider.providerId })}
            </Typography.Title>
            <Table
                rowKey='id'
                dataSource={provider.bills}
                columns={columns}
                pagination={false}
                scroll={{ x: 1050 }}
            />
        </>
    );
}
