import { useTranslate } from '@refinedev/core';
import { Card, Form, Radio, Space, Typography } from 'antd';

import type { AiSettingsResponse } from '../../types';

export function SavedConfiguration({
    response,
    updatedText,
}: {
    response: AiSettingsResponse;
    updatedText: string;
}) {
    const translate = useTranslate();
    return (
        <Card title={translate('aiSettings.savedConfiguration')}>
            <Typography.Paragraph type='secondary'>
                {translate('aiSettings.savedDescription')}
            </Typography.Paragraph>
            <Space wrap>
                <Typography.Text strong>
                    {translate('aiSettings.version', {
                        version: response.settings.version,
                    })}
                </Typography.Text>
                <Typography.Text type='secondary'>
                    {updatedText}
                </Typography.Text>
            </Space>
        </Card>
    );
}

export function ProviderField({
    onChange,
    response,
}: {
    onChange(providerId: string): void;
    response: AiSettingsResponse;
}) {
    const translate = useTranslate();
    return (
        <Form.Item
            extra={translate('aiSettings.providerHelp')}
            label={translate('aiSettings.provider')}
            name='activeProvider'
            rules={[
                {
                    message: translate('aiSettings.validation.provider'),
                    required: true,
                },
            ]}
        >
            <Radio.Group
                onChange={(event) => onChange(String(event.target.value))}
            >
                <Space wrap>
                    {response.providers.map((provider) => (
                        <Radio.Button
                            disabled={provider.credentialStatus === 'missing'}
                            key={provider.id}
                            value={provider.id}
                        >
                            {provider.label}
                        </Radio.Button>
                    ))}
                </Space>
            </Radio.Group>
        </Form.Item>
    );
}
