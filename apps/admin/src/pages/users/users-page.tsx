import type { AdminUserSummary } from '@languon/contracts';
import { useList, useTranslate } from '@refinedev/core';
import {
    Button,
    Card,
    Input,
    Select,
    Space,
    Table,
    Tag,
    Typography,
} from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';

import { LoadErrorAlert } from '../../shared/ui/load-error-alert';
import styles from '../shared/page.module.css';

const pageSize = 25;

export function UsersPage() {
    const translate = useTranslate();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<string | undefined>();
    const users = useList<AdminUserSummary>({
        filters: [
            {
                field: 'search',
                operator: 'contains',
                value: search || undefined,
            },
            { field: 'status', operator: 'eq', value: status },
        ],
        pagination: { currentPage: page, pageSize },
        resource: 'users',
    });
    return (
        <div className={styles.stack}>
            <header className={styles.heading}>
                <div>
                    <Typography.Text className={styles.eyebrow}>
                        {translate('users.eyebrow')}
                    </Typography.Text>
                    <Typography.Title>
                        {translate('users.heading')}
                    </Typography.Title>
                </div>
                <Typography.Text type='secondary'>
                    {translate('users.matching', {
                        count: users.result.total ?? 0,
                    })}
                </Typography.Text>
            </header>
            <Card>
                <div className={styles.toolbar}>
                    <label>
                        <Typography.Text>
                            {translate('users.search')}
                        </Typography.Text>
                        <Input.Search
                            allowClear
                            onSearch={(value) => {
                                setSearch(value.trim());
                                setPage(1);
                            }}
                            placeholder={translate('users.searchPlaceholder')}
                            style={{ display: 'block', width: 320 }}
                        />
                    </label>
                    <label>
                        <Typography.Text>
                            {translate('users.status')}
                        </Typography.Text>
                        <Select
                            allowClear
                            onChange={(value) => {
                                setStatus(value);
                                setPage(1);
                            }}
                            options={[
                                {
                                    label: translate('status.active'),
                                    value: 'active',
                                },
                                {
                                    label: translate('status.pending'),
                                    value: 'pending',
                                },
                                {
                                    label: translate('status.disabled'),
                                    value: 'disabled',
                                },
                            ]}
                            placeholder={translate('users.allStatuses')}
                            style={{ display: 'block', width: 180 }}
                            value={status}
                        />
                    </label>
                    <Button onClick={() => void users.query.refetch()}>
                        {translate('actions.refresh')}
                    </Button>
                </div>
            </Card>
            {users.query.isError ? (
                <LoadErrorAlert
                    error={users.query.error}
                    message={translate('users.error')}
                    offlineDescription={translate('errors.offline')}
                    onRetry={() => void users.query.refetch()}
                    retryDescription={translate('errors.retry')}
                    retryLabel={translate('actions.retry')}
                />
            ) : null}
            <Card
                className={styles.tableCard}
                styles={{ body: { padding: 0 } }}
            >
                <Table<AdminUserSummary>
                    columns={[
                        {
                            dataIndex: 'primaryEmail',
                            key: 'email',
                            title: translate('users.column.user'),
                            render: (email, user) => (
                                <Space direction='vertical' size={0}>
                                    <Link to={`/users/${user.id}`}>
                                        {email}
                                    </Link>
                                    <Typography.Text copyable type='secondary'>
                                        {user.id}
                                    </Typography.Text>
                                </Space>
                            ),
                        },
                        {
                            dataIndex: 'status',
                            key: 'status',
                            title: translate('users.column.status'),
                            render: (value) => <StatusTag status={value} />,
                        },
                        {
                            dataIndex: 'emailVerified',
                            key: 'verified',
                            responsive: ['md'],
                            title: translate('users.column.email'),
                            render: (verified) =>
                                verified
                                    ? translate('users.verified')
                                    : translate('users.unverified'),
                        },
                        {
                            dataIndex: 'isOwner',
                            key: 'owner',
                            responsive: ['lg'],
                            title: translate('users.column.access'),
                            render: (owner) =>
                                owner ? (
                                    <Tag color='gold'>
                                        {translate('access.owner')}
                                    </Tag>
                                ) : (
                                    translate('access.user')
                                ),
                        },
                        {
                            dataIndex: 'createdAt',
                            key: 'created',
                            responsive: ['lg'],
                            title: translate('users.column.created'),
                            render: (value) =>
                                new Date(value).toLocaleDateString(),
                        },
                        {
                            key: 'action',
                            title: '',
                            render: (_, user) => (
                                <Link to={`/users/${user.id}`}>
                                    {translate('actions.open')}
                                </Link>
                            ),
                        },
                    ]}
                    dataSource={users.result.data as AdminUserSummary[]}
                    loading={users.query.isLoading || users.query.isFetching}
                    locale={{
                        emptyText:
                            search || status
                                ? translate('users.emptyFiltered')
                                : translate('users.empty'),
                    }}
                    pagination={{
                        current: page,
                        onChange: setPage,
                        pageSize,
                        showSizeChanger: false,
                        total: users.result.total ?? 0,
                    }}
                    rowKey='id'
                    scroll={{ x: 760 }}
                />
            </Card>
        </div>
    );
}

export function StatusTag({ status }: { status: AdminUserSummary['status'] }) {
    const translate = useTranslate();
    return (
        <Tag
            color={
                status === 'active'
                    ? 'green'
                    : status === 'disabled'
                      ? 'red'
                      : 'gold'
            }
        >
            {translate(`status.${status}`)}
        </Tag>
    );
}
