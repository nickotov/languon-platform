import { useState } from 'react';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Card,
    Form,
    Input,
    Space,
    Spin,
    Table,
    Typography,
} from 'antd';
import type { AccountingRecord } from '@languon/contracts';
import { useAccounting } from '../../hooks/use-accounting';
import { AccountingReportPanel } from '../accounting-report/accounting-report';
import { AccountingRecordDialog } from '../accounting-record-dialog/accounting-record-dialog';
import { ProviderPrices } from '../provider-prices/provider-prices';
import { AccountingSettings } from '../accounting-settings/accounting-settings';
import { CapabilityPolicies } from '../capability-policies/capability-policies';
import styles from '../../../shared/page.module.css';

export function AccountingPage() {
    const t = useTranslate();
    const accounting = useAccounting();
    const [open, setOpen] = useState(false);
    const handleOpen = () => setOpen(true);
    const handleClose = () => setOpen(false);
    const [periodError, setPeriodError] = useState(false);
    const handlePeriod = (values: { from: string; to: string }) => {
        const from = new Date(`${values.from}T00:00:00.000Z`);
        const to = new Date(`${values.to}T00:00:00.000Z`);
        if (
            !Number.isFinite(from.getTime()) ||
            !Number.isFinite(to.getTime()) ||
            to <= from ||
            to.getTime() - from.getTime() > 366 * 86_400_000
        ) {
            setPeriodError(true);
            return;
        }
        setPeriodError(false);
        accounting.setPeriod({
            from: from.toISOString(),
            to: to.toISOString(),
        });
    };
    const initialPeriod = {
        from: accounting.period.from.slice(0, 10),
        to: accounting.period.to.slice(0, 10),
    };
    const columns = [
        {
            title: t('accounting.kind'),
            render: (_: unknown, record: AccountingRecord) =>
                t(`accounting.kind.${record.data.kind}`),
        },
        {
            title: t('accounting.amount'),
            render: (_: unknown, record: AccountingRecord) =>
                record.data.amountUsd,
        },
        {
            title: t('accounting.reference'),
            render: (_: unknown, record: AccountingRecord) =>
                record.data.reference,
        },
        {
            title: t('accounting.occurredAt'),
            render: (_: unknown, record: AccountingRecord) =>
                record.data.occurredAt,
        },
        { title: t('accounting.id'), dataIndex: 'id' },
    ];
    return (
        <div className={styles.stack}>
            <Typography.Title>{t('accounting.title')}</Typography.Title>
            <Typography.Paragraph>
                {t('accounting.description')}
            </Typography.Paragraph>
            <Form
                name='accounting-report-period'
                layout='inline'
                initialValues={initialPeriod}
                onFinish={handlePeriod}
            >
                <Form.Item
                    label={t('accounting.from')}
                    name='from'
                    rules={[{ required: true }]}
                >
                    <Input type='date' />
                </Form.Item>
                <Form.Item
                    label={t('accounting.to')}
                    name='to'
                    rules={[{ required: true }]}
                >
                    <Input type='date' />
                </Form.Item>
                <Button htmlType='submit'>{t('accounting.apply')}</Button>
            </Form>
            {periodError ? (
                <Alert type='error' message={t('accounting.periodError')} />
            ) : null}
            {accounting.error ? (
                <Alert
                    type='error'
                    message={accounting.error.message}
                    action={
                        <Button onClick={accounting.reload}>
                            {t('actions.retry')}
                        </Button>
                    }
                />
            ) : null}
            {accounting.loading ? (
                <Typography.Paragraph>
                    {t('accounting.preparing')}
                </Typography.Paragraph>
            ) : null}
            <Spin spinning={accounting.loading}>
                {accounting.report ? (
                    <AccountingReportPanel report={accounting.report} />
                ) : null}
            </Spin>
            <Card
                title={t('accounting.records')}
                extra={
                    <Space>
                        <Button onClick={accounting.reload}>
                            {t('actions.refresh')}
                        </Button>
                        <Button type='primary' onClick={handleOpen}>
                            {t('accounting.add')}
                        </Button>
                    </Space>
                }
            >
                <Typography.Paragraph>
                    {t('accounting.recordsHelp')}
                </Typography.Paragraph>
                <Table
                    rowKey='id'
                    dataSource={accounting.records}
                    columns={columns}
                    scroll={{ x: 950 }}
                />
            </Card>
            <ProviderPrices />
            <CapabilityPolicies />
            <AccountingSettings />
            {open ? (
                <AccountingRecordDialog
                    records={accounting.records}
                    pending={accounting.pending}
                    onSubmit={accounting.record}
                    onClose={handleClose}
                />
            ) : null}
        </div>
    );
}
