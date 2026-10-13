import {
    Alert,
    Button,
    Checkbox,
    Form,
    Input,
    InputNumber,
    Modal,
    Typography,
} from 'antd';
import { useTranslate } from '@refinedev/core';
import type { ModelPrice } from '@languon/contracts';
import type { useModelPrices } from '../../hooks/use-model-prices';

type Publish = ReturnType<typeof useModelPrices>['publish'];
export function ModelPriceDialog({
    price,
    pending,
    blocked,
    error,
    onSubmit,
    onClose,
    onReload,
    onSignIn,
}: {
    price: ModelPrice;
    pending: boolean;
    blocked: boolean;
    error: Error | null;
    onSubmit: Publish;
    onClose(): void;
    onReload(): void;
    onSignIn(): void;
}) {
    const t = useTranslate();
    const speech = price.meter === 'speech-characters';
    const initialValues = { ...price, reason: '' };
    const numberRules = [
        { required: true, type: 'integer' as const, min: 0, max: 1000000000 },
    ];
    return (
        <Modal
            title={t('pricing.editTitle')}
            open
            onCancel={onClose}
            closable={!pending}
            maskClosable={!pending}
            footer={null}
            destroyOnHidden
        >
            <Typography.Paragraph>
                {price.providerId} / {price.modelId} —{' '}
                {t('pricing.version', { version: price.version })}
            </Typography.Paragraph>
            <Typography.Paragraph>
                {t('pricing.futureOnly')}
            </Typography.Paragraph>
            {error ? (
                <Alert
                    type='error'
                    showIcon
                    message={error.message}
                    description={t('pricing.reviewRequired')}
                    action={
                        <Button onClick={onReload}>
                            {t('actions.refresh')}
                        </Button>
                    }
                />
            ) : null}
            {blocked ? (
                <Button onClick={onSignIn}>{t('user.signInAgain')}</Button>
            ) : null}
            <Form
                name='model-price-publication'
                layout='vertical'
                initialValues={initialValues}
                onFinish={onSubmit}
                disabled={pending || blocked}
            >
                {speech ? (
                    <>
                        <Form.Item
                            name='creditsPer1000Characters'
                            label={t('pricing.characterRate')}
                            rules={numberRules}
                        >
                            <InputNumber
                                min={0}
                                max={1000000000}
                                precision={0}
                            />
                        </Form.Item>
                        <Form.Item
                            name='minimumCredits'
                            label={t('pricing.minimum')}
                            rules={numberRules}
                        >
                            <InputNumber
                                min={0}
                                max={1000000000}
                                precision={0}
                            />
                        </Form.Item>
                    </>
                ) : (
                    <>
                        <Form.Item
                            name='inputCreditsPerMillionTokens'
                            label={t('pricing.inputRate')}
                            rules={numberRules}
                        >
                            <InputNumber
                                min={0}
                                max={1000000000}
                                precision={0}
                            />
                        </Form.Item>
                        <Form.Item
                            name='outputCreditsPerMillionTokens'
                            label={t('pricing.outputRate')}
                            rules={numberRules}
                        >
                            <InputNumber
                                min={0}
                                max={1000000000}
                                precision={0}
                            />
                        </Form.Item>
                    </>
                )}
                <Form.Item name='provisional' valuePropName='checked'>
                    <Checkbox>{t('pricing.provisional')}</Checkbox>
                </Form.Item>
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
                    type='primary'
                    htmlType='submit'
                    loading={pending}
                    disabled={blocked}
                >
                    {t('pricing.publish')}
                </Button>
            </Form>
        </Modal>
    );
}
