import type {
    TextAiProbe,
    TextAiProbeRecoveryRequest,
} from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Checkbox, Form, Input } from 'antd';

export function ProbeRecovery({
    probe,
    pending,
    onRecover,
}: {
    probe: TextAiProbe;
    pending: boolean;
    onRecover(
        probeId: string,
        request: TextAiProbeRecoveryRequest,
    ): Promise<void>;
}) {
    const t = useTranslate();
    const [form] = Form.useForm<{ reason: string; confirmed: boolean }>();
    const confirmed = Form.useWatch('confirmed', form) === true;
    const handleFinish = async ({
        reason,
        confirmed,
    }: {
        reason: string;
        confirmed: boolean;
    }) => {
        if (!confirmed) return;
        await onRecover(probe.id, { reason, confirmedUpstreamStopped: true });
    };

    return (
        <>
            <Alert
                type='warning'
                showIcon
                message={t('routing.recoveryWarning')}
                description={t('routing.recoveryExpense', {
                    maximum: probe.maximumCostUsd,
                })}
            />
            <Form
                name='text-ai-probe-recovery'
                form={form}
                layout='vertical'
                onFinish={handleFinish}
            >
                <Form.Item
                    name='reason'
                    label={t('routing.recoveryReason')}
                    rules={[{ required: true, min: 10, max: 500 }]}
                >
                    <Input.TextArea rows={3} maxLength={500} />
                </Form.Item>
                <Form.Item name='confirmed' valuePropName='checked'>
                    <Checkbox>{t('routing.recoveryConfirm')}</Checkbox>
                </Form.Item>
                <Button
                    aria-label={t('routing.recover')}
                    aria-busy={pending}
                    htmlType='submit'
                    disabled={!confirmed}
                    loading={pending}
                >
                    {t('routing.recover')}
                </Button>
            </Form>
        </>
    );
}
