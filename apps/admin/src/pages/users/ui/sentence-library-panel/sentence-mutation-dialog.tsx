import type { AdminSentenceLibraryOperation } from '@languon/contracts';
import { useLogout, useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Checkbox,
    Form,
    Input,
    Modal,
    Space,
    Typography,
} from 'antd';
import { useEffect, useState } from 'react';

import { AdminApiError } from '@/shared/api/admin-api';
import type { useSentenceMutation } from '../../hooks/use-sentence-mutation';

type Props = {
    mutation: ReturnType<typeof useSentenceMutation>;
    onReload(): void;
};
export function SentenceMutationDialog({ mutation, onReload }: Props) {
    const t = useTranslate();
    const logout = useLogout();
    const [attempted, setAttempted] = useState(false);
    const confirmation = mutation.confirmation;
    useEffect(() => {
        setAttempted(false);
    }, [confirmation?.operationId]);
    const code =
        mutation.error instanceof AdminApiError
            ? mutation.error.detail.code
            : null;
    const requiresAuth =
        code === 'recent_authentication_required' ||
        code === 'authentication_required';
    const conflict = code === 'sentence_library_conflict';
    const isDelete = confirmation?.operation === 'delete';
    const expired = confirmation?.expiresAt
        ? new Date(confirmation.expiresAt).getTime() <= Date.now()
        : false;
    const title = confirmation ? t(operationKey(confirmation.operation)) : '';
    const message = sentenceErrorMessage(code, mutation.error, t);
    const signIn = () => logout.mutate();
    const refresh = () => {
        mutation.close();
        onReload();
    };
    const submit = async (values: { reason: string; confirmed?: boolean }) => {
        setAttempted(true);
        await mutation.submit(values.reason.trim(), values.confirmed === true);
    };
    const blocked =
        mutation.pending ||
        requiresAuth ||
        conflict ||
        expired ||
        confirmation?.count === 0;
    let errorAction;
    if (requiresAuth)
        errorAction = <Button onClick={signIn}>{t('user.signInAgain')}</Button>;
    if (conflict)
        errorAction = (
            <Button onClick={refresh}>{t('user.refreshConflict')}</Button>
        );
    return (
        <Modal
            destroyOnHidden
            footer={null}
            onCancel={mutation.close}
            open={confirmation !== null}
            title={title}
            closable={!mutation.pending}
            maskClosable={!mutation.pending}
            keyboard={!mutation.pending}
        >
            <Space direction='vertical' size='middle' style={{ width: '100%' }}>
                <Alert
                    message={t(
                        isDelete
                            ? 'sentences.deleteWarning'
                            : 'sentences.mutationNotice',
                    )}
                    showIcon
                    type={isDelete ? 'warning' : 'info'}
                />
                <Typography.Text strong>
                    {t('sentences.matchingCount', {
                        count: confirmation?.count ?? 0,
                    })}
                </Typography.Text>
                {confirmation?.expiresAt ? (
                    <Typography.Text type='secondary'>
                        {t('sentences.snapshotExpiry', {
                            time: new Date(
                                confirmation.expiresAt,
                            ).toLocaleTimeString(),
                        })}
                    </Typography.Text>
                ) : null}
                {expired ? (
                    <Alert
                        message={t('sentences.snapshotExpired')}
                        showIcon
                        type='warning'
                    />
                ) : null}
                {mutation.error ? (
                    <Alert
                        action={errorAction}
                        message={message}
                        showIcon
                        type='error'
                    />
                ) : null}
                <Form
                    key={confirmation?.operationId}
                    layout='vertical'
                    onFinish={submit}
                >
                    <Form.Item
                        label={t('user.reason')}
                        name='reason'
                        rules={[
                            {
                                required: true,
                                min: 5,
                                max: 500,
                                whitespace: true,
                            },
                        ]}
                    >
                        <Input.TextArea
                            autoFocus
                            disabled={attempted}
                            maxLength={500}
                            rows={4}
                            showCount
                        />
                    </Form.Item>
                    {isDelete ? (
                        <Form.Item
                            name='confirmed'
                            valuePropName='checked'
                            rules={[
                                {
                                    validator: async (
                                        _rule,
                                        value: boolean,
                                    ) => {
                                        if (!value)
                                            throw new Error(
                                                t('sentences.confirmRequired'),
                                            );
                                    },
                                },
                            ]}
                        >
                            <Checkbox disabled={attempted}>
                                {t('sentences.deleteConfirm')}
                            </Checkbox>
                        </Form.Item>
                    ) : null}
                    <Space wrap>
                        <Button
                            disabled={mutation.pending}
                            onClick={mutation.close}
                        >
                            {t('actions.cancel')}
                        </Button>
                        <Button
                            danger={
                                isDelete ||
                                confirmation?.operation === 'global-archive'
                            }
                            disabled={blocked}
                            htmlType='submit'
                            loading={mutation.pending}
                            type='primary'
                        >
                            {t(
                                attempted
                                    ? 'actions.retry'
                                    : 'sentences.confirmAction',
                            )}
                        </Button>
                    </Space>
                </Form>
            </Space>
        </Modal>
    );
}

export function operationKey(operation: AdminSentenceLibraryOperation) {
    const keys = {
        archive: 'sentences.archive',
        restore: 'sentences.restore',
        'global-archive': 'sentences.globalArchive',
        'global-restore': 'sentences.globalRestore',
        delete: 'sentences.delete',
    };
    return keys[operation];
}

export function sentenceErrorMessage(
    code: string | null,
    error: Error | null,
    t: ReturnType<typeof useTranslate>,
) {
    if (code === 'sentence_library_deletion_busy') return t('sentences.busy');
    if (code === 'sentence_library_conflict') return t('sentences.conflict');
    if (code === 'recent_authentication_required')
        return t('sentences.reauthenticate');
    if (code === 'sentence_library_unavailable')
        return t('sentences.unavailable');
    return error?.message ?? '';
}
