import { useTranslate } from '@refinedev/core';
import { Button, Card, Form, Input, Select, Typography } from 'antd';
import { useState } from 'react';

import styles from '../../ai-settings-page.module.css';
import {
    enabledDefaultModels,
    settingsToFormValues,
    toMutationRequest,
} from '../../lib/ai-settings-form';
import type {
    AiSettingsFormValues,
    AiSettingsMutationRequest,
    AiSettingsResponse,
} from '../../types';
import { EnabledModelsField } from './enabled-models-field';
import { ProviderField, SavedConfiguration } from './form-sections';

interface AiSettingsFormProps {
    onSubmit(request: AiSettingsMutationRequest): Promise<void>;
    response: AiSettingsResponse;
    saving: boolean;
}

export function AiSettingsForm({
    onSubmit,
    response,
    saving,
}: AiSettingsFormProps) {
    const [form] = Form.useForm<AiSettingsFormValues>();
    const translate = useTranslate();
    const [dirty, setDirty] = useState(false);
    const activeProvider = Form.useWatch('activeProvider', form);
    const enabledModels = Form.useWatch('enabledModels', form) ?? [];
    const defaultModel = Form.useWatch('defaultModel', form);
    const defaultModels = enabledDefaultModels(
        response.providers,
        activeProvider,
        enabledModels,
    );
    const updatedText = response.settings.updatedAt
        ? translate('aiSettings.updated', {
              time: new Date(response.settings.updatedAt).toLocaleString(),
          })
        : translate('aiSettings.neverUpdated');

    const handleProviderChange = (providerId: string) => {
        const activeProvider = response.providers.find(
            (provider) => provider.id === providerId,
        );
        const currentDefault = form.getFieldValue('defaultModel');
        const enabledIds = form.getFieldValue('enabledModels');
        const validDefault = activeProvider?.models.some(
            (model) =>
                model.id === currentDefault &&
                model.available &&
                enabledIds.includes(model.id),
        );
        if (!validDefault) form.setFieldValue('defaultModel', undefined);
    };

    const handleFinish = async (values: AiSettingsFormValues) => {
        await onSubmit(toMutationRequest(values, response.settings.version));
    };

    return (
        <Form<AiSettingsFormValues>
            form={form}
            initialValues={settingsToFormValues(response)}
            layout='vertical'
            onFinish={handleFinish}
            onValuesChange={() => setDirty(true)}
            requiredMark='optional'
        >
            <div className={styles.configuration}>
                <SavedConfiguration
                    response={response}
                    updatedText={updatedText}
                />
                <Card>
                    <div className={styles.formGrid}>
                        <ProviderField
                            onChange={handleProviderChange}
                            response={response}
                        />
                        <Form.Item
                            extra={translate('aiSettings.defaultModelHelp')}
                            label={translate('aiSettings.defaultModel')}
                            name='defaultModel'
                            rules={[
                                {
                                    message: translate(
                                        'aiSettings.validation.default',
                                    ),
                                    required: true,
                                },
                            ]}
                        >
                            <Select
                                disabled={
                                    !activeProvider ||
                                    defaultModels.length === 0
                                }
                                notFoundContent={translate(
                                    'aiSettings.noDefaultModels',
                                )}
                                options={defaultModels.map((model) => ({
                                    label: model.label,
                                    value: model.id,
                                }))}
                                placeholder={translate(
                                    'aiSettings.defaultModel',
                                )}
                            />
                        </Form.Item>
                    </div>
                </Card>

                <Form.Item
                    name='enabledModels'
                    rules={[
                        {
                            message: translate('aiSettings.validation.enabled'),
                            min: 1,
                            type: 'array',
                        },
                    ]}
                >
                    <EnabledModelsField
                        defaultModel={defaultModel}
                        onDefaultRemoved={() =>
                            form.setFieldValue('defaultModel', undefined)
                        }
                        providers={response.providers}
                    />
                </Form.Item>

                <Form.Item
                    className={styles.reason}
                    extra={translate('aiSettings.reasonHelp')}
                    label={translate('aiSettings.reason')}
                    name='reason'
                    rules={[
                        {
                            max: 500,
                            message: translate('aiSettings.validation.reason'),
                            min: 5,
                            required: true,
                        },
                    ]}
                >
                    <Input.TextArea
                        maxLength={500}
                        placeholder={translate('aiSettings.reasonPlaceholder')}
                        rows={4}
                        showCount
                    />
                </Form.Item>

                <div className={styles.actions}>
                    <Typography.Text type='secondary'>
                        {translate('aiSettings.savedDescription')}
                    </Typography.Text>
                    <Button
                        disabled={!dirty}
                        htmlType='submit'
                        loading={saving}
                        type='primary'
                    >
                        {translate('aiSettings.save')}
                    </Button>
                </div>
            </div>
        </Form>
    );
}
