import { useTranslate } from '@refinedev/core';
import { Collapse, Form, InputNumber, Space, Typography } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import {
    textAiFlows,
    type RoutingCatalog,
} from '../../lib/text-ai-routing-form';
import { RoutePolicyFields } from './route-policy-fields';

export function FlowRoutingFields({
    options,
    catalog,
}: {
    options: DefaultOptionType[];
    catalog: RoutingCatalog;
}) {
    const t = useTranslate();
    const items = textAiFlows.map((flow) => {
        const compatibleOptions = options.filter((option) =>
            catalog
                .find((route) => route.routeId === option.value)
                ?.supportedFlows.includes(flow),
        );
        const isFreeInterview = flow === 'portrait-interview';
        return {
            key: flow,
            forceRender: true,
            label: flow,
            children: (
                <>
                    <Typography.Paragraph>
                        {t('routing.inherit')}
                    </Typography.Paragraph>
                    <RoutePolicyFields
                        path={['overrides', flow]}
                        options={compatibleOptions}
                    />
                    {isFreeInterview ? (
                        <Typography.Paragraph>
                            {t('routing.freeInterview')}
                        </Typography.Paragraph>
                    ) : (
                        <Space wrap align='start'>
                            <Form.Item
                                label={t('routing.inputRate')}
                                name={[
                                    'flowTariffs',
                                    flow,
                                    'inputCreditsPerMillionTokens',
                                ]}
                            >
                                <InputNumber min={0} step={0.001} />
                            </Form.Item>
                            <Form.Item
                                label={t('routing.outputRate')}
                                name={[
                                    'flowTariffs',
                                    flow,
                                    'outputCreditsPerMillionTokens',
                                ]}
                            >
                                <InputNumber min={0} step={0.001} />
                            </Form.Item>
                            <Form.Item
                                label={t('routing.cacheRate')}
                                name={[
                                    'flowTariffs',
                                    flow,
                                    'cachedInputCreditsPerMillionTokens',
                                ]}
                            >
                                <InputNumber min={0} step={0.001} />
                            </Form.Item>
                        </Space>
                    )}
                </>
            ),
        };
    });

    return <Collapse items={items} />;
}
