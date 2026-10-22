import { Form, Input } from 'antd';
import { useTranslate } from '@refinedev/core';

export function PaymentFields() {
    const t = useTranslate();
    return (
        <>
            <Form.Item
                name='ownerId'
                label={t('accounting.owner')}
                rules={[{ required: true }]}
            >
                <Input />
            </Form.Item>
            <Form.Item
                name='credits'
                label={t('accounting.credits')}
                rules={[{ required: true }]}
            >
                <Input inputMode='decimal' />
            </Form.Item>
            <Form.Item
                name='originalCurrency'
                label={t('accounting.originalCurrency')}
            >
                <Input />
            </Form.Item>
            <Form.Item
                name='originalAmount'
                label={t('accounting.originalAmount')}
            >
                <Input inputMode='decimal' />
            </Form.Item>
            <Form.Item
                name='feeUsd'
                label={t('accounting.fees')}
                rules={[{ required: true }]}
            >
                <Input inputMode='decimal' />
            </Form.Item>
        </>
    );
}
