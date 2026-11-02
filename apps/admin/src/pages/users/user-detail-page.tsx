import { ArrowLeftOutlined } from '@ant-design/icons';
import type { AdminUserDetail } from '@languon/contracts';
import { useLogout, useOne, useTranslate, useUpdate } from '@refinedev/core';
import {
    Alert,
    Button,
    Card,
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
import { AiCreditsPanel } from './ui/ai-credits-panel/ai-credits-panel';
import { StatusTag } from './users-page';
import { SentenceLibraryPanel } from './ui/sentence-library-panel/sentence-library-panel';
import { UserAccountSummary } from './ui/user-account-summary/user-account-summary';
import { UserAvailability } from './ui/user-availability/user-availability';

type Operation = 'disable' | 'restore' | 'deletion/cancel';

const operationLabels = {
    disable: { title: 'user.disableTitle', confirm: 'user.confirmDisable' },
    restore: { title: 'user.restoreTitle', confirm: 'user.confirmRestore' },
    'deletion/cancel': {
        title: 'user.cancelDeletionTitle',
        confirm: 'user.confirmCancelDeletion',
    },
};

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
    const detail = user.result?.id === id ? user.result : undefined;
    const closeOperation = () => {
        setOperation(null);
        setError(null);
        form.resetFields();
    };
    const mutate = async ({ reason }: { reason: string }) => {
        if (!detail || !operation) {
            return;
        }

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

    const operationText = operationLabels[operation ?? 'deletion/cancel'];
    const handleSignIn = () => logout.mutate();
    const handleConflictRefresh = () => {
        void user.query.refetch().then(() => setError(null));
    };
    let errorAction;
    if (error instanceof AdminApiError) {
        if (error.detail.code === 'recent_authentication_required') {
            errorAction = (
                <Button onClick={handleSignIn}>
                    {translate('user.signInAgain')}
                </Button>
            );
        } else if (error.detail.code === 'user_state_conflict') {
            errorAction = (
                <Button onClick={handleConflictRefresh}>
                    {translate('user.refreshConflict')}
                </Button>
            );
        }
    }

    if (user.query.isError) {
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
    }

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
                <UserAccountSummary
                    detail={detail}
                    loading={user.query.isLoading}
                />
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
                    <UserAvailability
                        detail={detail}
                        onOperation={setOperation}
                    />
                </Space>
            </div>
            {detail ? (
                <AiCreditsPanel
                    key={detail.id}
                    mutable={['active', 'disabled', 'pending'].includes(
                        detail.status,
                    )}
                    userId={detail.id}
                />
            ) : null}
            {detail &&
            ['active', 'disabled', 'pending'].includes(detail.status) ? (
                <SentenceLibraryPanel
                    key={`sentences-${detail.id}`}
                    mutable={['active', 'disabled', 'pending'].includes(
                        detail.status,
                    )}
                    userId={detail.id}
                />
            ) : null}
            <Modal
                destroyOnHidden
                footer={null}
                onCancel={closeOperation}
                open={operation !== null}
                title={translate(operationText.title)}
            >
                <Typography.Paragraph>
                    {translate(
                        operation === 'deletion/cancel'
                            ? 'user.cancelDeletionDescription'
                            : 'user.auditDescription',
                    )}
                </Typography.Paragraph>
                {error ? (
                    <Alert
                        action={errorAction}
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
                            {translate(operationText.confirm)}
                        </Button>
                    </Space>
                </Form>
            </Modal>
        </div>
    );
}
