import {
    AuditOutlined,
    StopOutlined,
    TeamOutlined,
    UserAddOutlined,
} from '@ant-design/icons';
import type { AdminDashboardResponse } from '@languon/contracts';
import { useCustom, useTranslate, type BaseRecord } from '@refinedev/core';
import {
    Card,
    Col,
    List,
    Row,
    Skeleton,
    Statistic,
    Tag,
    Typography,
} from 'antd';
import { Link } from 'react-router';

import { LoadErrorAlert } from '../../shared/ui/load-error-alert';
import styles from '../shared/page.module.css';

export function DashboardPage() {
    const translate = useTranslate();
    const dashboard = useCustom<AdminDashboardResponse & BaseRecord>({
        method: 'get',
        url: 'dashboard',
    });
    const data = dashboard.query.data?.data;
    return (
        <div className={styles.stack}>
            <header className={styles.heading}>
                <div>
                    <Typography.Text className={styles.eyebrow}>
                        {translate('dashboard.eyebrow')}
                    </Typography.Text>
                    <Typography.Title>
                        {translate('dashboard.heading')}
                    </Typography.Title>
                </div>
                <Typography.Text type='secondary'>
                    {translate('dashboard.summary')}
                </Typography.Text>
            </header>
            {dashboard.query.isError ? (
                <LoadErrorAlert
                    error={dashboard.query.error}
                    message={translate('dashboard.error')}
                    offlineDescription={translate('errors.offline')}
                    onRetry={() => void dashboard.query.refetch()}
                    retryDescription={translate('errors.retry')}
                    retryLabel={translate('actions.retry')}
                />
            ) : null}
            <Skeleton active loading={dashboard.query.isLoading}>
                <Row gutter={[16, 16]}>
                    <Metric
                        icon={<TeamOutlined />}
                        label={translate('dashboard.allUsers')}
                        value={data?.counts.users ?? 0}
                    />
                    <Metric
                        icon={<UserAddOutlined />}
                        label={translate('dashboard.pending')}
                        value={data?.counts.pendingUsers ?? 0}
                    />
                    <Metric
                        icon={<StopOutlined />}
                        label={translate('dashboard.disabled')}
                        value={data?.counts.disabledUsers ?? 0}
                    />
                    <Metric
                        icon={<AuditOutlined />}
                        label={translate('dashboard.activeOwners')}
                        value={data?.counts.owners ?? 0}
                    />
                </Row>
                <Card
                    title={translate('dashboard.recentActivity')}
                    extra={
                        <Link to='/audit'>{translate('actions.viewAll')}</Link>
                    }
                >
                    <List
                        dataSource={data?.recentAuditEvents ?? []}
                        locale={{ emptyText: translate('dashboard.empty') }}
                        renderItem={(event) => (
                            <List.Item>
                                <List.Item.Meta
                                    title={
                                        <>
                                            <Tag
                                                color={
                                                    event.outcome === 'success'
                                                        ? 'green'
                                                        : 'red'
                                                }
                                            >
                                                {translate(
                                                    `audit.${event.outcome}`,
                                                )}
                                            </Tag>
                                            {translate(
                                                `audit.action.${event.action}`,
                                            )}
                                        </>
                                    }
                                    description={`${event.actorEmail ?? event.actorUserId} · ${new Date(event.occurredAt).toLocaleString()}`}
                                />
                            </List.Item>
                        )}
                    />
                </Card>
            </Skeleton>
        </div>
    );
}

function Metric({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
}) {
    return (
        <Col xs={24} sm={12} xl={6}>
            <Card>
                <Statistic prefix={icon} title={label} value={value} />
            </Card>
        </Col>
    );
}
