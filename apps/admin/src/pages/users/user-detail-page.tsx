import {
    ArrowLeftOutlined,
    CheckCircleOutlined,
    StopOutlined,
} from '@ant-design/icons';
import type { AdminUserDetail } from '@languon/contracts';
import { useLogout, useOne, useTranslate, useUpdate } from '@refinedev/core';
import {
    Alert,
    Button,
    Card,
    Descriptions,
    Form,
    Input,
    Modal,
    Space,
    Statistic,
    Typography,
} from 'antd';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { AdminApiError } from '@/shared/api/admin-api';
import styles from '../shared/page.module.css';
import { StatusTag } from './users-page';

type Operation = 'disable' | 'restore';

export function UserDetailPage() {
    const translate = useTranslate();
    const { id = '' } = useParams();
    const user = useOne<AdminUserDetail>({ id, resource: 'users' });
    const update = useUpdate<
        AdminUserDetail,
        AdminApiError,
        { expectedVersion: number; operation: Operation; reason: string }
    >();
    const logout = useLogout();
    const [operation, setOperation] = useState<Operation | null>(null);
    const [error, setError] = useState<AdminApiError | Error | null>(null);
    const [form] = Form.useForm<{ reason: string }>();
    const detail = user.result;
    const closeOperation = () => {
        setOperation(null);
        setError(null);
        form.resetFields();
    };
    const mutate = async ({ reason }: { reason: string }) => {
        if (!detail || !operation) return;
        setError(null);
        try {
            await update.mutateAsync({
                id: detail.id,
                resource: 'users',
                values: { expectedVersion: detail.version, operation, reason },
            });
            closeOperation();
            await user.query.refetch();
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught
                    : new Error(translate('user.operationFailed')),
            );
        }
    };
    if (user.query.isError)
        return (
            <Alert
                action={
                    <Button onClick={() => void user.query.refetch()}>
                        {translate('actions.retry')}
                    </Button>
                }
                message={translate('user.error')}
                showIcon
                type='error'
            />
        );
    return (
        <div className={styles.stack}>
            <Link to='/users'>
                <ArrowLeftOutlined /> {translate('user.back')}
            </Link>
            <header className={styles.heading}>
                <div>
                    <Typography.Text className={styles.eyebrow}>
                        {translate('user.eyebrow')}
                    </Typography.Text>
                    <Typography.Title>
                        {detail?.primaryEmail ?? translate('user.loading')}
                    </Typography.Title>
                </div>
                {detail ? <StatusTag status={detail.status} /> : null}
            </header>
            <div className={styles.details}>
                <Card
                    loading={user.query.isLoading}
                    title={translate('user.account')}
                >
                    {detail ? (
                        <Descriptions
                            column={1}
                            items={[
                                {
                                    key: 'id',
                                    label: translate('user.id'),
                                    children: (
                                        <Typography.Text copyable>
                                            {detail.id}
                                        </Typography.Text>
                                    ),
                                },
                                {
                                    key: 'status',
                                    label: translate('users.column.status'),
                                    children: (
                                        <StatusTag status={detail.status} />
                                    ),
                                },
                                {
                                    key: 'verified',
                                    label: translate('user.email'),
                                    children: detail.emailVerified
                                        ? translate('users.verified')
                                        : translate('users.unverified'),
                                },
                                {
                                    key: 'access',
                                    label: translate('user.administration'),
                                    children: detail.isOwner
                                        ? translate('access.owner')
                                        : translate('user.noMembership'),
                                },
                                {
                                    key: 'created',
                                    label: translate('user.created'),
                                    children: new Date(
                                        detail.createdAt,
                                    ).toLocaleString(),
                                },
                                {
                                    key: 'updated',
                                    label: translate('user.changed'),
                                    children: new Date(
                                        detail.updatedAt,
                                    ).toLocaleString(),
                                },
                                {
                                    key: 'version',
                                    label: translate('user.version'),
                                    children: detail.version,
                                },
                            ]}
                        />
                    ) : null}
                </Card>
                <Space
                    direction='vertical'
                    size='middle'
                    style={{ width: '100%' }}
                >
                    <Card>
                        <Space size='large'>
                            <Statistic
                                title={translate('user.sessions')}
                                value={detail?.activeSessionCount ?? 0}
                            />
                            <Statistic
                                title={translate('user.passkeys')}
                                value={detail?.passkeyCount ?? 0}
                            />
                        </Space>
                    </Card>
                    <Card
                        className={styles.danger}
                        title={translate('user.availability')}
                    >
                        <Typography.Paragraph type='secondary'>
                            {translate('user.availabilityDescription')}
                        </Typography.Paragraph>
                        <Button
                            danger={detail?.status !== 'disabled'}
                            disabled={!detail}
                            icon={
                                detail?.status === 'disabled' ? (
                                    <CheckCircleOutlined />
                                ) : (
                                    <StopOutlined />
                                )
                            }
                            onClick={() =>
                                setOperation(
                                    detail?.status === 'disabled'
                                        ? 'restore'
                                        : 'disable',
                                )
                            }
                            type={
                                detail?.status === 'disabled'
                                    ? 'primary'
                                    : 'default'
                            }
                        >
                            {detail?.status === 'disabled'
                                ? translate('user.restore')
                                : translate('user.disable')}
                        </Button>
                    </Card>
                </Space>
            </div>
            <Modal
                destroyOnHidden
                footer={null}
                onCancel={closeOperation}
                open={operation !== null}
                title={
                    operation === 'disable'
                        ? translate('user.disableTitle')
                        : translate('user.restoreTitle')
                }
            >
                <Typography.Paragraph>
                    {translate('user.auditDescription')}
                </Typography.Paragraph>
                {error ? (
                    <Alert
                        action={
                            error instanceof AdminApiError &&
                            error.detail.code ===
                                'recent_authentication_required' ? (
                                <Button onClick={() => logout.mutate()}>
                                    {translate('user.signInAgain')}
                                </Button>
                            ) : error instanceof AdminApiError &&
                              error.detail.code === 'user_state_conflict' ? (
                                <Button
                                    onClick={() =>
                                        void user.query
                                            .refetch()
                                            .then(() => setError(null))
                                    }
                                >
                                    {translate('user.refreshConflict')}
                                </Button>
                            ) : undefined
                        }
                        message={error.message}
                        showIcon
                        type='error'
                    />
                ) : null}
                <Form
                    form={form}
                    layout='vertical'
                    onFinish={mutate}
                    requiredMark='optional'
                >
                    <Form.Item
                        label={translate('user.reason')}
                        name='reason'
                        rules={[{ min: 5, max: 500, required: true }]}
                    >
                        <Input.TextArea
                            autoFocus
                            maxLength={500}
                            rows={4}
                            showCount
                        />
                    </Form.Item>
                    <Space>
                        <Button onClick={closeOperation}>
                            {translate('actions.cancel')}
                        </Button>
                        <Button
                            danger={operation === 'disable'}
                            htmlType='submit'
                            loading={update.mutation.isPending}
                            type='primary'
                        >
                            {operation === 'disable'
                                ? translate('user.confirmDisable')
                                : translate('user.confirmRestore')}
                        </Button>
                    </Space>
                </Form>
            </Modal>
        </div>
    );
}
