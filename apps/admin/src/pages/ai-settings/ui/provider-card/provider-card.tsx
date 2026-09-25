import {
    Alert,
    Card,
    Checkbox,
    Descriptions,
    Space,
    Tag,
    Typography,
} from 'antd';
import { useTranslate } from '@refinedev/core';

import type { AiProviderOption } from '../../types';
import styles from './provider-card.module.css';

interface ProviderCardProps {
    enabledModelIds: string[];
    onEnabledModelsChange(modelIds: string[]): void;
    provider: AiProviderOption;
}

export function ProviderCard({
    enabledModelIds,
    onEnabledModelsChange,
    provider,
}: ProviderCardProps) {
    const translate = useTranslate();
    const credentialConfigured = provider.credentialStatus === 'configured';
    const healthColor =
        provider.health.status === 'available'
            ? 'green'
            : provider.health.status === 'unavailable'
              ? 'red'
              : 'gold';
    const statusDescription = providerStatusDescription(provider, translate);
    const observedText = provider.health.checkedAt
        ? translate('aiSettings.healthObserved', {
              time: new Date(provider.health.checkedAt).toLocaleString(),
          })
        : translate('aiSettings.healthNotObserved');

    const handleModelChange = (values: Array<string | number>) => {
        const providerModelIds = new Set(
            provider.models.map((model) => model.id),
        );
        const otherProviderModels = enabledModelIds.filter(
            (modelId) => !providerModelIds.has(modelId),
        );
        onEnabledModelsChange([...otherProviderModels, ...values.map(String)]);
    };

    return (
        <Card className={styles.card} title={provider.label}>
            <Space
                direction='vertical'
                size='middle'
                className={styles.content}
            >
                <Descriptions column={{ xs: 1, sm: 2 }} size='small'>
                    <Descriptions.Item
                        label={translate('aiSettings.providerCredential')}
                    >
                        <Tag color={credentialConfigured ? 'green' : 'red'}>
                            {translate(
                                `aiSettings.credential.${provider.credentialStatus}`,
                            )}
                        </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item
                        label={translate('aiSettings.providerHealth')}
                    >
                        <Space direction='vertical' size={0}>
                            <Tag color={healthColor}>
                                {translate(
                                    `aiSettings.health.${provider.health.status}`,
                                )}
                            </Tag>
                            <Typography.Text type='secondary'>
                                {observedText}
                            </Typography.Text>
                        </Space>
                    </Descriptions.Item>
                </Descriptions>
                {statusDescription ? (
                    <Alert
                        description={provider.health.message ?? undefined}
                        message={statusDescription}
                        showIcon
                        type={
                            provider.credentialStatus === 'missing' ||
                            provider.health.status === 'unavailable'
                                ? 'warning'
                                : 'info'
                        }
                    />
                ) : null}
                <div>
                    <Typography.Title level={5}>
                        {translate('aiSettings.enabledModels')}
                    </Typography.Title>
                    <Typography.Paragraph type='secondary'>
                        {translate('aiSettings.enabledModelsHelp')}
                    </Typography.Paragraph>
                    {provider.models.length === 0 ? (
                        <Typography.Text type='secondary'>
                            {translate('aiSettings.noModels')}
                        </Typography.Text>
                    ) : (
                        <Checkbox.Group
                            aria-label={`${provider.label} ${translate('aiSettings.enabledModels')}`}
                            className={styles.models}
                            onChange={handleModelChange}
                            value={enabledModelIds}
                        >
                            {provider.models.map((model) => (
                                <Checkbox
                                    disabled={!model.available}
                                    key={model.id}
                                    value={model.id}
                                >
                                    <Space direction='vertical' size={0}>
                                        <Typography.Text>
                                            {model.label}
                                        </Typography.Text>
                                        <Typography.Text
                                            className={styles.modelId}
                                            type='secondary'
                                        >
                                            {model.id}
                                        </Typography.Text>
                                        <Typography.Text type='secondary'>
                                            {model.supportedFormats.join(', ')}
                                        </Typography.Text>
                                        <Typography.Text type='secondary'>
                                            {translate(
                                                'aiSettings.creditPricing',
                                                {
                                                    input: model.creditPricing.inputCreditsPerMillionTokens.toLocaleString(),
                                                    maximum:
                                                        model.creditPricing.maxCreditsPerAttempt.toLocaleString(),
                                                    output: model.creditPricing.outputCreditsPerMillionTokens.toLocaleString(),
                                                },
                                            )}
                                        </Typography.Text>
                                        {!model.available ? (
                                            <Typography.Text type='danger'>
                                                {model.unavailableReason ||
                                                    translate(
                                                        'aiSettings.modelUnavailable',
                                                    )}
                                            </Typography.Text>
                                        ) : null}
                                    </Space>
                                </Checkbox>
                            ))}
                        </Checkbox.Group>
                    )}
                </div>
            </Space>
        </Card>
    );
}

function providerStatusDescription(
    provider: AiProviderOption,
    translate: (key: string, options?: Record<string, unknown>) => string,
) {
    if (provider.credentialStatus === 'missing') {
        return translate('aiSettings.missingCredential');
    }
    if (provider.health.status === 'unverified') {
        return translate('aiSettings.unverified');
    }
    if (provider.health.status === 'unavailable') {
        return translate('aiSettings.unavailable');
    }
    return null;
}
