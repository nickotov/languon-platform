import {
    ProviderNativePricingRulesSchema,
    nativeProviderPricingMatchesMeter,
} from '@languon/contracts';
import type {
    ProviderPrice,
    ProviderPricePublishRequestSchema,
} from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Form, Input, Modal, Select, Typography } from 'antd';

import { NativeProviderPriceDialog } from './native-provider-price-dialog';

type Request = (typeof ProviderPricePublishRequestSchema)['_input'];
type Fields = Omit<Request, 'expectedVersion' | 'nativeRules'> & {
    nativeRulesJson?: string;
};
type Props = {
    price: ProviderPrice | null;
    pending: boolean;
    error: string | null;
    onSubmit(body: Request): Promise<void>;
    onClose(): void;
    onReload(): void;
};

export function ProviderPriceDialog(props: Props) {
    if (props.price?.nativeRules) {
        return (
            <NativeProviderPriceDialog
                price={props.price}
                onClose={props.onClose}
            />
        );
    }
    return <LegacyProviderPriceDialog {...props} />;
}

function LegacyProviderPriceDialog({
    price,
    pending,
    error,
    onSubmit,
    onClose,
    onReload,
}: Props) {
    const t = useTranslate();
    const [form] = Form.useForm<Fields>();
    const meter =
        Form.useWatch<Request['meter']>('meter', form) ??
        price?.meter ??
        'text-tokens';
    const speech = meter === 'speech-characters';
    const duration = meter === 'audio-duration';
    const nativeOnly = speech || duration;
    const editExisting = price !== null;
    const options = [
        { value: 'text-tokens', label: t('accounting.tokenMeter') },
        { value: 'speech-characters', label: t('accounting.characterMeter') },
        {
            value: 'audio-duration',
            label: t('transcription.audioDurationMeter'),
        },
    ];
    const initial = {
        ...price,
        meter: price?.meter ?? 'text-tokens',
        effectiveAt: new Date().toISOString(),
        reason: '',
    };
    const submit = async (values: Fields) => {
        const inputUsdPerMillionTokens = nativeOnly
            ? null
            : values.inputUsdPerMillionTokens;
        const outputUsdPerMillionTokens = nativeOnly
            ? null
            : values.outputUsdPerMillionTokens;
        const cacheReadUsdPerMillionTokens = nativeOnly
            ? null
            : values.cacheReadUsdPerMillionTokens || null;
        const cacheWriteUsdPerMillionTokens = nativeOnly
            ? null
            : values.cacheWriteUsdPerMillionTokens || null;
        const usdPer1000Characters = speech
            ? values.usdPer1000Characters
            : null;
        const { nativeRulesJson, ...fields } = values;
        let nativeRules;
        if (duration) {
            try {
                nativeRules = ProviderNativePricingRulesSchema.parse(
                    JSON.parse(nativeRulesJson ?? ''),
                );
                if (
                    !nativeProviderPricingMatchesMeter(
                        'audio-duration',
                        nativeRules,
                    )
                )
                    throw new Error(
                        'Duration pricing requires a duration component.',
                    );
            } catch {
                form.setFields([
                    {
                        name: 'nativeRulesJson',
                        errors: [t('transcription.nativeRulesInvalid')],
                    },
                ]);
                return;
            }
        }
        await onSubmit({
            ...fields,
            ...(duration ? { nativeRules } : {}),
            expectedVersion: price?.version ?? 0,
            sourceUrl: values.sourceUrl || null,
            inputUsdPerMillionTokens,
            outputUsdPerMillionTokens,
            cacheReadUsdPerMillionTokens,
            cacheWriteUsdPerMillionTokens,
            usdPer1000Characters,
            minimumUsdPerRequest: nativeOnly
                ? null
                : values.minimumUsdPerRequest || null,
        });
    };
    return (
        <Modal
            open
            title={t('accounting.publishProviderPrice')}
            onCancel={onClose}
            closable={!pending}
            maskClosable={!pending}
            keyboard={!pending}
            footer={null}
        >
            <Typography.Paragraph>
                {t('accounting.providerPriceFutureOnly')}
            </Typography.Paragraph>
            {error ? (
                <Alert
                    type='error'
                    message={error}
                    description={t('pricing.reviewRequired')}
                    action={
                        <Button onClick={onReload}>
                            {t('actions.refresh')}
                        </Button>
                    }
                />
            ) : null}
            <Form
                name='accounting-provider-price'
                form={form}
                layout='vertical'
                initialValues={initial}
                onFinish={submit}
                disabled={pending}
                preserve={false}
            >
                <Form.Item
                    name='providerId'
                    label={t('speech.provider')}
                    rules={[{ required: true }]}
                >
                    <Input disabled={editExisting} />
                </Form.Item>
                <Form.Item
                    name='modelId'
                    label={t('speech.model')}
                    rules={[{ required: true }]}
                >
                    <Input disabled={editExisting} />
                </Form.Item>
                <Form.Item
                    name='meter'
                    label={t('pricing.meter')}
                    rules={[{ required: true }]}
                >
                    <Select disabled={editExisting} options={options} />
                </Form.Item>
                {duration ? (
                    <>
                        <Typography.Paragraph>
                            {t('transcription.nativeRulesHelp')}
                        </Typography.Paragraph>
                        <Form.Item
                            name='nativeRulesJson'
                            label={t('transcription.nativeRules')}
                            rules={[{ required: true }]}
                        >
                            <Input.TextArea rows={8} maxLength={80_000} />
                        </Form.Item>
                    </>
                ) : speech ? (
                    <UsdRateField
                        name='usdPer1000Characters'
                        label={t('accounting.usdCharacterField')}
                        required
                    />
                ) : (
                    <>
                        <UsdRateField
                            name='inputUsdPerMillionTokens'
                            label={t('accounting.usdInputField')}
                            required
                        />
                        <UsdRateField
                            name='outputUsdPerMillionTokens'
                            label={t('accounting.usdOutputField')}
                            required
                        />
                        <UsdRateField
                            name='minimumUsdPerRequest'
                            label={t('accounting.usdMinimumRequestField')}
                        />
                        <Typography.Paragraph type='secondary'>
                            {t('accounting.usdMinimumRequestHelp')}
                        </Typography.Paragraph>
                        <UsdRateField
                            name='cacheReadUsdPerMillionTokens'
                            label={t('accounting.usdCacheReadField')}
                        />
                        <UsdRateField
                            name='cacheWriteUsdPerMillionTokens'
                            label={t('accounting.usdCacheWriteField')}
                        />
                    </>
                )}
                <Form.Item
                    name='effectiveAt'
                    label={t('accounting.effectiveAt')}
                    rules={[{ required: true }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='sourceReference'
                    label={t('accounting.sourceReference')}
                    rules={[{ required: true, max: 200 }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='sourceUrl'
                    label={t(
                        duration
                            ? 'transcription.nativePriceSourceUrl'
                            : 'accounting.sourceUrl',
                    )}
                    rules={[{ required: duration, pattern: /^https:\/\// }]}
                >
                    <Input type='url' />
                </Form.Item>
                <Form.Item
                    name='reason'
                    label={t('aiSettings.reason')}
                    rules={[{ required: true, min: 5, max: 500 }]}
                >
                    <Input.TextArea />
                </Form.Item>
                <Button htmlType='submit' type='primary' loading={pending}>
                    {t('accounting.publishProviderPrice')}
                </Button>
            </Form>
        </Modal>
    );
}
function UsdRateField({
    name,
    label,
    required = false,
}: {
    name: keyof Fields;
    label: string;
    required?: boolean;
}) {
    const rules = [{ required, pattern: /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/ }];
    return (
        <Form.Item name={name} label={label} rules={rules}>
            <Input inputMode='decimal' />
        </Form.Item>
    );
}
