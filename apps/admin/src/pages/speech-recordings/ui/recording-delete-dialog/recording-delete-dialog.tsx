import { Alert, Button, Form, Input, Modal, Typography } from 'antd';
import { useTranslate } from '@refinedev/core';
import type { AdminSpeechRecording } from '@languon/contracts';

export function RecordingDeleteDialog({
    recordings,
    pending,
    error,
    blocked,
    onClose,
    onSubmit,
    onReview,
    onSignIn,
}: {
    recordings: AdminSpeechRecording[] | null;
    pending: boolean;
    error: Error | null;
    blocked: boolean;
    onClose(): void;
    onSubmit(reason: string): Promise<void>;
    onReview(): void;
    onSignIn(): void;
}) {
    const t = useTranslate();
    const count = recordings?.length ?? 0;
    const links =
        recordings?.reduce((sum, item) => sum + item.bindingCount, 0) ?? 0;
    const handleFinish = async (values: { reason: string }) =>
        onSubmit(values.reason.trim());
    return (
        <Modal
            title={t('speech.deleteTitle')}
            open={recordings !== null}
            onCancel={onClose}
            closable={!pending}
            maskClosable={!pending}
            footer={null}
            destroyOnHidden
        >
            <Typography.Paragraph>
                {t('speech.deleteImpact', { count, links })}
            </Typography.Paragraph>
            <Alert
                type='warning'
                showIcon
                message={t('speech.deleteWarning')}
            />
            {error ? (
                <Alert
                    type='error'
                    showIcon
                    message={error.message}
                    description={t('speech.reviewRequired')}
                    action={
                        <Button onClick={onReview}>
                            {t('speech.reviewAgain')}
                        </Button>
                    }
                />
            ) : null}
            {blocked ? (
                <Button onClick={onSignIn}>{t('user.signInAgain')}</Button>
            ) : null}
            <Form
                name='speech-recording-removal'
                layout='vertical'
                onFinish={handleFinish}
                disabled={pending || blocked}
            >
                <Form.Item
                    name='reason'
                    label={t('user.reason')}
                    rules={[
                        { required: true, whitespace: true, min: 5, max: 500 },
                    ]}
                >
                    <Input.TextArea rows={3} maxLength={500} />
                </Form.Item>
                <Button
                    danger
                    type='primary'
                    htmlType='submit'
                    loading={pending}
                    disabled={blocked}
                >
                    {t('speech.confirmDelete')}
                </Button>
            </Form>
        </Modal>
    );
}
