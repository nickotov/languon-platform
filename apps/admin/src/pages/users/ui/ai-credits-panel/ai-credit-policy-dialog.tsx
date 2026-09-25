import type {
    AdminAiCreditAccount,
    AdminAiCreditPolicyMutationRequest,
} from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Checkbox,
    Form,
    Input,
    Modal,
    Radio,
    Space,
} from 'antd';
import type { ReactNode } from 'react';

type PolicyFields = {
    expires: boolean;
    mode: 'limited' | 'unlimited';
    reason: string;
    unlimitedUntil?: string;
};

type Props = {
    account: AdminAiCreditAccount;
    error: Error | null;
    errorAction: ReactNode;
    loading: boolean;
    onCancel: () => void;
    onSubmit: (request: AdminAiCreditPolicyMutationRequest) => Promise<void>;
    open: boolean;
};

export function AiCreditPolicyDialog({
    account,
    error,
    errorAction,
    loading,
    onCancel,
    onSubmit,
    open,
}: Props) {
    const translate = useTranslate();
    const [form] = Form.useForm<PolicyFields>();
    const mode = Form.useWatch('mode', form);
    const expires = Form.useWatch('expires', form);

    const handleOpenChange = (visible: boolean) => {
        if (!visible) return;
        const initialValues: PolicyFields = {
            expires: account.unlimitedUntil !== null,
            mode: account.configuredMode,
            reason: '',
        };
        const unlimitedUntil = toLocalDateTime(account.unlimitedUntil);
        if (unlimitedUntil) initialValues.unlimitedUntil = unlimitedUntil;
        form.setFieldsValue(initialValues);
    };
    const handleFinish = async (values: PolicyFields) => {
        await onSubmit({
            expectedVersion: account.managementVersion,
            mode: values.mode,
            reason: values.reason.trim(),
            unlimitedUntil:
                values.mode === 'unlimited' && values.expires
                    ? new Date(values.unlimitedUntil ?? '').toISOString()
                    : null,
        });
    };

    return (
        <Modal
            afterOpenChange={handleOpenChange}
            destroyOnHidden
            footer={null}
            onCancel={onCancel}
            open={open}
            title={translate('aiCredits.policyTitle')}
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
                    label={translate('aiCredits.policyMode')}
                    name='mode'
                >
                    <Radio.Group>
                        <Radio value='limited'>
                            {translate('aiCredits.limited')}
                        </Radio>
                        <Radio value='unlimited'>
                            {translate('aiCredits.unlimited')}
                        </Radio>
                    </Radio.Group>
                </Form.Item>
                {mode === 'unlimited' ? (
                    <>
                        <Form.Item name='expires' valuePropName='checked'>
                            <Checkbox>
                                {translate('aiCredits.expiring')}
                            </Checkbox>
                        </Form.Item>
                        {expires ? (
                            <Form.Item
                                label={translate('aiCredits.unlimitedUntil')}
                                name='unlimitedUntil'
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
                    <Button htmlType='submit' loading={loading} type='primary'>
                        {translate('aiCredits.savePolicy')}
                    </Button>
                </Space>
            </Form>
        </Modal>
    );
}

function toLocalDateTime(value: string | null) {
    if (!value) return undefined;
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
