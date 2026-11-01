import type { ProviderPricePublishRequestSchema } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Form, Input, Typography } from 'antd';

type Request = (typeof ProviderPricePublishRequestSchema)['_input'];
type Fields = Omit<Request, 'expectedVersion' | 'nativeRules'> & {
    nativeRulesJson?: string;
};

export function ProviderPriceFields({ meter }: { meter: Request['meter'] }) {
    const t = useTranslate();

    if (meter === 'audio-duration') {
        return (
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
        );
    }

    if (meter === 'speech-characters') {
        return (
            <UsdRateField
                name='usdPer1000Characters'
                label={t('accounting.usdCharacterField')}
                required
            />
        );
    }

    return (
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
