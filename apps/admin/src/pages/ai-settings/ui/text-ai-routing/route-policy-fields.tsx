import { useTranslate } from '@refinedev/core';
import { Form, Select, Typography } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';

type Path = (string | number)[];

export function RoutePolicyFields({
    path,
    options,
    required = false,
}: {
    path: Path;
    options: DefaultOptionType[];
    required?: boolean;
}) {
    const t = useTranslate();
    const primaryName = [...path, 'primaryRouteId'];
    const fallbackName = [...path, 'fallbackRouteIds'];
    const primaryRules = [{ required, message: t('routing.selectPrimary') }];

    return (
        <>
            <Form.Item
                label={t('routing.primary')}
                name={primaryName}
                rules={primaryRules}
            >
                <Select
                    virtual={false}
                    allowClear={!required}
                    options={options}
                    showSearch
                    optionFilterProp='label'
                />
            </Form.Item>
            <Form.Item
                label={t('routing.fallbacks')}
                name={fallbackName}
                extra={t('routing.fallbackHelp')}
            >
                <Select
                    virtual={false}
                    mode='multiple'
                    options={options}
                    maxCount={4}
                    showSearch
                    optionFilterProp='label'
                />
            </Form.Item>
            <Typography.Paragraph type='secondary'>
                {t('routing.fallbackOrder')}
            </Typography.Paragraph>
        </>
    );
}
