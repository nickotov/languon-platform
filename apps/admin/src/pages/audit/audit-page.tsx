import type { AdminAuditEvent } from '@languon/contracts';
import { useList, useTranslate } from '@refinedev/core';
import { Card, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';

import { LoadErrorAlert } from '../../shared/ui/load-error-alert';
import styles from '../shared/page.module.css';

export function AuditPage() {
    const translate = useTranslate();
    const [page, setPage] = useState(1);
    const [outcome, setOutcome] = useState<string | undefined>();
    const events = useList<AdminAuditEvent>({
        filters: [{ field: 'outcome', operator: 'eq', value: outcome }],
        pagination: { currentPage: page, pageSize: 25 },
        resource: 'audit-events',
    });
    return (
        <div className={styles.stack}>
            <header className={styles.heading}>
                <div>
                    <Typography.Text className={styles.eyebrow}>
                        {translate('audit.eyebrow')}
                    </Typography.Text>
                    <Typography.Title>
                        {translate('audit.heading')}
                    </Typography.Title>
                </div>
                <Typography.Text type='secondary'>
                    {translate('audit.retention')}
                </Typography.Text>
            </header>
            <Card>
                <label>
                    <Typography.Text>
                        {translate('audit.outcome')}
                    </Typography.Text>
                    <Select
                        allowClear
                        onChange={(value) => {
                            setOutcome(value);
                            setPage(1);
                        }}
                        options={[
                            {
                                label: translate('audit.success'),
                                value: 'success',
                            },
                            {
                                label: translate('audit.rejected'),
                                value: 'rejected',
                            },
                        ]}
                        placeholder={translate('audit.allOutcomes')}
                        style={{ display: 'block', width: 200 }}
                        value={outcome}
                    />
                </label>
            </Card>
            {events.query.isError ? (
                <LoadErrorAlert
                    error={events.query.error}
                    message={translate('audit.error')}
                    offlineDescription={translate('errors.offline')}
                    onRetry={() => void events.query.refetch()}
                    retryDescription={translate('errors.retry')}
                    retryLabel={translate('actions.retry')}
                />
            ) : null}
            <Card
                className={styles.tableCard}
                styles={{ body: { padding: 0 } }}
            >
                <Table<AdminAuditEvent>
                    columns={[
                        {
                            dataIndex: 'occurredAt',
                            key: 'time',
                            title: translate('audit.column.time'),
                            render: (value) => new Date(value).toLocaleString(),
                        },
                        {
                            dataIndex: 'action',
                            key: 'action',
                            title: translate('audit.column.action'),
                            render: (value) =>
                                translate(`audit.action.${value}`),
                        },
                        {
                            dataIndex: 'outcome',
                            key: 'outcome',
                            title: translate('audit.column.outcome'),
                            render: (value) => (
                                <Tag
                                    color={
                                        value === 'success' ? 'green' : 'red'
                                    }
                                >
                                    {translate(`audit.${value}`)}
                                </Tag>
                            ),
                        },
                        {
                            key: 'actor',
                            title: translate('audit.column.actor'),
                            render: (_, event) => (
                                <Space direction='vertical' size={0}>
                                    {event.actorEmail ?? event.actorUserId}
                                    {event.actorEmail ? (
                                        <Link to={`/users/${event.actorUserId}`}>
                                            {translate('actions.viewActor')}
                                        </Link>
                                    ) : null}
                                </Space>
                            ),
                        },
                        {
                            key: 'target',
                            responsive: ['lg'],
                            title: translate('audit.column.target'),
                            render: (_, event) =>
                                event.targetUserId && event.targetEmail ? (
                                    <Link to={`/users/${event.targetUserId}`}>
                                        {event.targetEmail}
                                    </Link>
                                ) : event.targetUserId ?? '—',
                        },
                        {
                            dataIndex: 'reason',
                            key: 'reason',
                            responsive: ['md'],
                            title: translate('audit.column.reason'),
                            render: (value) => value ?? '—',
                        },
                        {
                            dataIndex: 'correlationId',
                            key: 'correlationId',
                            responsive: ['lg'],
                            title: translate('audit.column.correlation'),
                            render: (value) => (
                                <Typography.Text copyable>
                                    {value}
                                </Typography.Text>
                            ),
                        },
                    ]}
                    dataSource={events.result.data as AdminAuditEvent[]}
                    loading={events.query.isLoading || events.query.isFetching}
                    locale={{ emptyText: translate('audit.empty') }}
                    pagination={{
                        current: page,
                        onChange: setPage,
                        pageSize: 25,
                        showSizeChanger: false,
                        total: events.result.total ?? 0,
                    }}
                    rowKey='id'
                    scroll={{ x: 1180 }}
                />
            </Card>
        </div>
    );
}
