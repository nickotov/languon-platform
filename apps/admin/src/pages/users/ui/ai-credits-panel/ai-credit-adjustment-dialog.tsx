import type {
    AdminAiCreditAccount,
    AdminAiCreditAdjustmentRequest,
} from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Checkbox,
    Form,
    Input,
    InputNumber,
    Modal,
    Radio,
    Space,
} from 'antd';
import type { ReactNode } from 'react';

type AdjustmentFields = {
    amount: number;
    expires: boolean;
    expiresAt?: string;
    kind: 'add' | 'remove';
    reason: string;
};

type Props = {
    account: AdminAiCreditAccount;
    error: Error | null;
    errorAction: ReactNode;
    loading: boolean;
    onCancel: () => void;
    onSubmit: (request: AdminAiCreditAdjustmentRequest) => Promise<void>;
    open: boolean;
};

export function AiCreditAdjustmentDialog({
    account,
    error,
    errorAction,
    loading,
    onCancel,
    onSubmit,
    open,
}: Props) {
    const translate = useTranslate();
    const [form] = Form.useForm<AdjustmentFields>();
    const kind = Form.useWatch('kind', form);
    const expires = Form.useWatch('expires', form);

    const handleOpenChange = (visible: boolean) => {
        if (!visible) return;
        form.setFieldsValue({
            amount: 1,
            expires: false,
            kind: 'add',
            reason: '',
        });
        form.setFieldValue('expiresAt', undefined);
    };
    const handleFinish = async (values: AdjustmentFields) => {
        const signedAmount =
            values.kind === 'remove' ? -values.amount : values.amount;
        await onSubmit({
            amountCredits: signedAmount,
            expectedVersion: account.managementVersion,
            expiresAt:
                values.kind === 'add' && values.expires
                    ? new Date(values.expiresAt ?? '').toISOString()
                    : null,
            reason: values.reason.trim(),
        });
    };

    return (
        <Modal
            afterOpenChange={handleOpenChange}
            destroyOnHidden
            footer={null}
            onCancel={onCancel}
            open={open}
            title={translate('aiCredits.adjustTitle')}
        >
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
                onFinish={handleFinish}
                preserve={false}
                requiredMark='optional'
            >
                <Form.Item
                    label={translate('aiCredits.adjustKind')}
                    name='kind'
                >
                    <Radio.Group>
                        <Radio value='add'>{translate('aiCredits.add')}</Radio>
                        <Radio
                            disabled={account.availableCredits === 0}
                            value='remove'
                        >
                            {translate('aiCredits.remove')}
                        </Radio>
                    </Radio.Group>
                </Form.Item>
                <Form.Item
                    label={translate('aiCredits.amount')}
                    name='amount'
                    rules={[{ min: 1, required: true, type: 'number' }]}
                >
                    <InputNumber
                        max={
                            kind === 'remove'
                                ? account.availableCredits
                                : 1_000_000_000_000
                        }
                        min={1}
                        precision={0}
                        style={{ width: '100%' }}
                    />
                </Form.Item>
                {kind === 'add' ? (
                    <>
                        <Form.Item name='expires' valuePropName='checked'>
                            <Checkbox>
                                {translate('aiCredits.grantExpires')}
                            </Checkbox>
                        </Form.Item>
                        {expires ? (
                            <Form.Item
                                label={translate('aiCredits.expiresAt')}
                                name='expiresAt'
                                rules={[{ required: true }]}
                            >
                                <Input type='datetime-local' />
                            </Form.Item>
                        ) : null}
                    </>
                ) : null}
                <Form.Item
                    label={translate('aiCredits.reason')}
                    name='reason'
                    rules={[{ min: 5, max: 500, required: true }]}
                >
                    <Input.TextArea maxLength={500} rows={4} showCount />
                </Form.Item>
                <Space>
                    <Button onClick={onCancel}>
                        {translate('actions.cancel')}
                    </Button>
                    <Button
                        danger={kind === 'remove'}
                        htmlType='submit'
                        loading={loading}
                        type='primary'
                    >
                        {translate('aiCredits.confirmAdjustment')}
                    </Button>
                </Space>
            </Form>
        </Modal>
    );
}
