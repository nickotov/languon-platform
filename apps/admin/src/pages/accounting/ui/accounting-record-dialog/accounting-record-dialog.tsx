import {
    AccountingRecordRequestSchema,
    type AccountingRecord,
    type AccountingRecordRequest,
} from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    AutoComplete,
    Button,
    Form,
    Input,
    Modal,
    Select,
    Typography,
} from 'antd';
import { useCallback, useState } from 'react';
import { RefundContext } from './refund-context';
import { PaymentFields } from './payment-fields';

export function AccountingRecordDialog({
    records,
    pending,
    onSubmit,
    onClose,
}: {
    records: AccountingRecord[];
    pending: boolean;
    onSubmit(request: AccountingRecordRequest): Promise<void>;
    onClose(): void;
}) {
    const t = useTranslate();
    const [form] = Form.useForm();
    const kind =
        Form.useWatch<AccountingRecordRequest['kind']>('kind', form) ??
        'payment';
    const paymentId = Form.useWatch<string | undefined>('paymentId', form);
    const [contextReady, setContextReady] = useState(false);
    const [creditLotAvailable, setCreditLotAvailable] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [idempotencyKey] = useState(() => crypto.randomUUID());
    const [retryBody, setRetryBody] = useState<AccountingRecordRequest | null>(
        null,
    );
    const updateCreditLotAvailable = useCallback(
        (available: boolean) => {
            setCreditLotAvailable(available);
            if (!available) form.setFieldValue('revokeAvailableCredits', '0');
        },
        [form],
    );
    const initial = {
        kind: 'payment',
        occurredAt: new Date().toISOString(),
        feeUsd: '0',
        revokeAvailableCredits: '0',
    };
    const paymentOptions = records
        .filter((record) => record.data.kind === 'payment')
        .map((record) => ({
            value: record.id,
            label: `${record.data.reference} (${record.id})`,
        }));
    const kindOptions = [
        'payment',
        'refund',
        'provider_deposit',
        'provider_balance',
        'provider_bill',
    ].map((value) => ({ value, label: t(`accounting.kind.${value}`) }));
    const isPayment = kind === 'payment';
    const isRefund = kind === 'refund';
    const isBill = kind === 'provider_bill';
    const isProvider = !isPayment && !isRefund;
    const blocked = isRefund && !contextReady;
    const submit = async (values: Record<string, unknown>) => {
        setError(null);
        try {
            // Once sent, keep the exact operation payload for explicit network retries.
            const body =
                retryBody ??
                AccountingRecordRequestSchema.parse({
                    ...values,
                    ...(kind === 'payment'
                        ? {
                              originalCurrency: values.originalCurrency || null,
                              originalAmount: values.originalAmount || null,
                          }
                        : {}),
                    idempotencyKey,
                    source: 'manual',
                });
            setRetryBody(body);
            await onSubmit(body);
            onClose();
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : t('accounting.saveError'),
            );
        }
    };
    const amountField = (
        <Form.Item
            name='amountUsd'
            label={t('accounting.amount')}
            rules={[
                { required: true, pattern: /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/ },
            ]}
        >
            <Input inputMode='decimal' />
        </Form.Item>
    );
    return (
        <Modal
            open
            title={t('accounting.add')}
            onCancel={onClose}
            closable={!pending}
            maskClosable={!pending}
            keyboard={!pending}
            footer={null}
        >
            <Typography.Paragraph>
                {t('accounting.manualHelp')}
            </Typography.Paragraph>
            {error ? <Alert type='error' message={error} /> : null}
            {retryBody ? (
                <Alert type='info' message={t('accounting.retryExact')} />
            ) : null}
            <Form
                name='accounting-manual-record'
                form={form}
                layout='vertical'
                initialValues={initial}
                onFinish={submit}
                disabled={pending || retryBody !== null}
                preserve={false}
            >
                <Form.Item
                    name='kind'
                    label={t('accounting.kind')}
                    rules={[{ required: true }]}
                >
                    <Select options={kindOptions} />
                </Form.Item>
                <Form.Item
                    name='occurredAt'
                    label={t('accounting.occurredAt')}
                    rules={[{ required: true }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='reference'
                    label={t('accounting.reference')}
                    rules={[{ required: true, max: 200 }]}
                >
                    <Input />
                </Form.Item>
                {amountField}
                {isPayment ? <PaymentFields /> : null}
                {isRefund ? (
                    <>
                        <Typography.Paragraph>
                            {t('accounting.refundHelp')}
                        </Typography.Paragraph>
                        <Form.Item
                            name='paymentId'
                            label={t('accounting.payment')}
                            rules={[{ required: true }]}
                        >
                            <AutoComplete options={paymentOptions} />
                        </Form.Item>
                        <RefundContext
                            paymentId={paymentId}
                            onReady={setContextReady}
                            onCreditLotAvailable={updateCreditLotAvailable}
                        />
                        <Form.Item
                            name='revokeAvailableCredits'
                            label={t('accounting.revoke')}
                            rules={[{ required: true }]}
                        >
                            <Input
                                inputMode='decimal'
                                disabled={
                                    !creditLotAvailable ||
                                    pending ||
                                    retryBody !== null
                                }
                            />
                        </Form.Item>
                    </>
                ) : null}
                {isProvider ? (
                    <Form.Item
                        name='providerId'
                        label={t('speech.provider')}
                        rules={[{ required: true }]}
                    >
                        <Input />
                    </Form.Item>
                ) : null}
                {isBill ? (
                    <>
                        <Form.Item
                            name='periodStart'
                            label={t('accounting.periodStart')}
                            rules={[{ required: true }]}
                        >
                            <Input />
                        </Form.Item>
                        <Form.Item
                            name='periodEnd'
                            label={t('accounting.periodEnd')}
                            rules={[{ required: true }]}
                        >
                            <Input />
                        </Form.Item>
                    </>
                ) : null}
                <Form.Item
                    name='reason'
                    label={t('aiSettings.reason')}
                    rules={[{ required: true, min: 5, max: 500 }]}
                >
                    <Input.TextArea />
                </Form.Item>
                <Button
                    disabled={blocked}
                    htmlType='submit'
                    loading={pending}
                    type='primary'
                >
                    {t('accounting.save')}
                </Button>
            </Form>
            {retryBody ? (
                <Button onClick={form.submit} loading={pending}>
                    {t('actions.retry')}
                </Button>
            ) : null}
        </Modal>
    );
}
