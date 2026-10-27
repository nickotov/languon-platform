import { useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Descriptions, Table, Typography } from 'antd';
import type { AdminMcpAuditEvent } from '@languon/contracts';
import { useAdminMcpAudit } from '../../hooks/use-admin-mcp-audit';
import styles from './token-audit.module.css';

export function TokenAudit() {
    const t = useTranslate();
    const audit = useAdminMcpAudit();
    const columns = [
        {
            key: 'occurredAt',
            dataIndex: 'occurredAt',
            title: t('mcp.occurredAt'),
        },
        { key: 'actor', dataIndex: 'actorUserId', title: t('mcp.actor') },
        { key: 'token', dataIndex: 'tokenId', title: t('mcp.token') },
        { key: 'action', dataIndex: 'action', title: t('mcp.action') },
        { key: 'target', dataIndex: 'target', title: t('mcp.target') },
        { key: 'outcome', title: t('mcp.outcome'), render: renderOutcome },
        {
            key: 'correlation',
            dataIndex: 'correlationId',
            title: t('mcp.correlation'),
        },
    ];
    const pagination = {
        current: audit.page,
        pageSize: 25,
        total: audit.result?.total ?? 0,
        onChange: audit.changePage,
        showSizeChanger: false,
    };
    const expandable = { expandedRowRender: renderDetails };
    const events = audit.result?.events ?? [];

    function renderOutcome(_: unknown, event: AdminMcpAuditEvent) {
        return t(`audit.${event.outcome}`);
    }

    function renderDetails(event: AdminMcpAuditEvent) {
        return <AuditDetails event={event} />;
    }

    return (
        <Card
            title={t('mcp.activity')}
            extra={
                <Button onClick={audit.reload}>{t('actions.refresh')}</Button>
            }
        >
            <Typography.Paragraph>{t('mcp.activityHelp')}</Typography.Paragraph>
            {audit.error ? (
                <Alert
                    type='error'
                    message={audit.error.message}
                    action={
                        <Button onClick={audit.reload}>
                            {t('actions.retry')}
                        </Button>
                    }
                />
            ) : null}
            <Table<AdminMcpAuditEvent>
                rowKey='id'
                loading={audit.loading}
                columns={columns}
                dataSource={events}
                pagination={pagination}
                expandable={expandable}
                scroll={{ x: 1250 }}
            />
        </Card>
    );
}

function AuditDetails({ event }: { event: AdminMcpAuditEvent }) {
    const t = useTranslate();
    const metadata = JSON.stringify(event.metadata, null, 2);
    const items = [
        { key: 'reason', label: t('mcp.reason'), children: event.reason },
        {
            key: 'details',
            label: t('mcp.details'),
            children: <pre className={styles.metadata ?? ''}>{metadata}</pre>,
        },
    ];
    return <Descriptions column={1} size='small' items={items} />;
}
