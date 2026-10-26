import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Card,
    Form,
    Input,
    Select,
    Space,
    Typography,
} from 'antd';
import type {
    TextAiRoutingConfiguration,
    TextAiRoutingPublishRequest,
    TextAiRoutingRevision,
} from '@languon/contracts';
import { TextAiRoutingPublishRequestSchema } from '@languon/contracts';
import { useState } from 'react';
import {
    reviewedRouteOptions,
    routingInitialValues,
} from '../../lib/text-ai-routing-form';
import type { RoutingCatalog } from '../../lib/text-ai-routing-form';
import { FlowRoutingFields } from './flow-routing-fields';
import { RoutePolicyFields } from './route-policy-fields';

type Values = TextAiRoutingConfiguration & { reason: string };

export function RoutingConfigurationForm({
    revision,
    catalog,
    pending,
    onPublish,
}: {
    revision: TextAiRoutingRevision | null;
    catalog: RoutingCatalog;
    pending: boolean;
    onPublish(request: TextAiRoutingPublishRequest): Promise<void>;
}) {
    const t = useTranslate();
    const [form] = Form.useForm<Values>();
    const [validation, setValidation] = useState<string | null>(null);
    const allOptions = reviewedRouteOptions(catalog);
    const enabled = Form.useWatch('enabledRouteIds', form) as
        string[] | undefined;
    const enabledOptions = allOptions.filter((option) =>
        enabled?.includes(option.value),
    );
    const initialValues = routingInitialValues(revision);
    const version = revision?.version ?? 0;
    const versionText = t('aiSettings.version', { version });

    const handleFinish = async (values: Values) => {
        const overrides = Object.fromEntries(
            Object.entries(values.overrides ?? {}).filter(
                ([, value]) => value?.primaryRouteId,
            ),
        );
        const parsed = TextAiRoutingPublishRequestSchema.safeParse({
            expectedVersion: version,
            reason: values.reason,
            configuration: {
                default: {
                    ...values.default,
                    fallbackRouteIds: values.default.fallbackRouteIds ?? [],
                },
                enabledRouteIds: values.enabledRouteIds,
                overrides: Object.fromEntries(
                    Object.entries(overrides).map(([flow, policy]) => [
                        flow,
                        {
                            ...policy,
                            fallbackRouteIds: policy.fallbackRouteIds ?? [],
                        },
                    ]),
                ),
                flowTariffs: values.flowTariffs ?? {},
            },
        });
        if (!parsed.success) {
            setValidation(t('routing.invalid'));
            return;
        }
        setValidation(null);
        await onPublish(parsed.data);
    };

    return (
        <Card title={t('routing.configuration')}>
            <Typography.Paragraph type='secondary'>
                {versionText}
            </Typography.Paragraph>
            <Typography.Paragraph>
                {t('routing.activationNotice')}
            </Typography.Paragraph>
            {validation ? (
                <Alert type='error' showIcon message={validation} />
            ) : null}
            <Form
                name='text-ai-routing'
                form={form}
                initialValues={initialValues}
                layout='vertical'
                onFinish={handleFinish}
            >
                <Form.Item
                    name='enabledRouteIds'
                    label={t('routing.enabled')}
                    rules={[{ type: 'array' }]}
                >
                    <Select
                        virtual={false}
                        mode='multiple'
                        options={allOptions}
                        optionFilterProp='label'
                    />
                </Form.Item>
                <RoutePolicyFields
                    path={['default']}
                    options={enabledOptions}
                    required
                />
                <Typography.Title level={4}>
                    {t('routing.flows')}
                </Typography.Title>
                <Typography.Paragraph type='secondary'>
                    {t('routing.tariffHelp')}
                </Typography.Paragraph>
                <FlowRoutingFields options={enabledOptions} catalog={catalog} />
                <Form.Item
                    name='reason'
                    label={t('aiSettings.reason')}
                    rules={[{ required: true, min: 3, max: 500 }]}
                >
                    <Input.TextArea rows={3} maxLength={500} showCount />
                </Form.Item>
                <Space wrap>
                    <Button
                        aria-label={t('routing.publish')}
                        aria-busy={pending}
                        type='primary'
                        htmlType='submit'
                        loading={pending}
                    >
                        {t('routing.publish')}
                    </Button>
                    <Typography.Text type='secondary'>
                        {t('routing.savedPolicy')}
                    </Typography.Text>
                </Space>
            </Form>
        </Card>
    );
}
