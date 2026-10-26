import { useTranslate } from '@refinedev/core';
import { Alert, Form, Input, Modal, Typography } from 'antd';
import type {
    TextAiRoutingDisableRequest,
    TextAiRoutingRevision,
} from '@languon/contracts';

export function EmergencyDisableDialog({
    routeId,
    revision,
    pending,
    error,
    onClose,
    onPublish,
}: {
    routeId: string;
    revision: TextAiRoutingRevision;
    pending: boolean;
    error: Error | null;
    onClose(): void;
    onPublish(request: TextAiRoutingDisableRequest): Promise<void>;
}) {
    const t = useTranslate();
    const [form] = Form.useForm<{ reason: string }>();
    const handleConfirm = () => form.submit();
    const handleFinish = async ({ reason }: { reason: string }) => {
        await onPublish({
            expectedVersion: revision.version,
            reason,
            routeId,
        });
    };

    return (
        <Modal
            open
            title={t('routing.disableTitle')}
            onCancel={onClose}
            onOk={handleConfirm}
            okText={t('routing.disableConfirm')}
            okButtonProps={{ danger: true }}
            confirmLoading={pending}
            cancelButtonProps={{ disabled: pending }}
            closable={!pending}
            maskClosable={!pending}
        >
            <Typography.Paragraph>{routeId}</Typography.Paragraph>
            <Typography.Paragraph>
                {t('routing.disableHelp')}
            </Typography.Paragraph>
            {error ? (
                <Alert
                    type='error'
                    showIcon
                    message={error.message}
                    description={t('routing.errorHelp')}
                />
            ) : null}
            <Form
                name='text-ai-emergency-disable'
                form={form}
                layout='vertical'
                onFinish={handleFinish}
            >
                <Form.Item
                    name='reason'
                    label={t('aiSettings.reason')}
                    rules={[{ required: true, min: 3, max: 500 }]}
                >
                    <Input.TextArea rows={3} maxLength={500} showCount />
                </Form.Item>
            </Form>
        </Modal>
    );
}
