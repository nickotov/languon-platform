import { Button, Form, Input, Select, Space } from 'antd';
import { useTranslate } from '@refinedev/core';
import type { RecordingFilters } from '../../hooks/use-recordings';

export function RecordingFiltersForm({
    onApply,
}: {
    onApply(filters: RecordingFilters): void;
}) {
    const t = useTranslate();
    const handleFinish = (values: Record<string, string | undefined>) => {
        const filters: RecordingFilters = {};
        for (const key of [
            'search',
            'language',
            'provider',
            'model',
            'linked',
            'state',
        ] as const) {
            const value = values[key]?.trim();
            if (value) Object.assign(filters, { [key]: value });
        }
        if (values.createdFrom)
            filters.createdFrom = new Date(
                `${values.createdFrom}T00:00:00.000Z`,
            ).toISOString();
        if (values.createdTo)
            filters.createdTo = new Date(
                `${values.createdTo}T23:59:59.999Z`,
            ).toISOString();
        onApply(filters);
    };
    const linkedOptions = [
        { value: 'true', label: t('speech.linked') },
        { value: 'false', label: t('speech.unlinked') },
    ];
    const stateOptions = ['pending', 'ready', 'deleting', 'failed'].map(
        (value) => ({ value, label: t(`speech.status.${value}`) }),
    );
    return (
        <Form layout='vertical' onFinish={handleFinish}>
            <Space align='start' wrap>
                <Form.Item name='search' label={t('speech.search')}>
                    <Input maxLength={200} />
                </Form.Item>
                <Form.Item name='language' label={t('speech.language')}>
                    <Input maxLength={32} />
                </Form.Item>
                <Form.Item name='provider' label={t('speech.provider')}>
                    <Input maxLength={128} />
                </Form.Item>
                <Form.Item name='model' label={t('speech.model')}>
                    <Input maxLength={128} />
                </Form.Item>
                <Form.Item name='linked' label={t('speech.links')}>
                    <Select
                        allowClear
                        options={linkedOptions}
                        style={{ width: 160 }}
                    />
                </Form.Item>
                <Form.Item name='state' label={t('speech.status')}>
                    <Select
                        allowClear
                        options={stateOptions}
                        style={{ width: 180 }}
                    />
                </Form.Item>
                <Form.Item name='createdFrom' label={t('speech.createdFrom')}>
                    <Input type='date' />
                </Form.Item>
                <Form.Item name='createdTo' label={t('speech.createdTo')}>
                    <Input type='date' />
                </Form.Item>
            </Space>
            <Button htmlType='submit'>{t('speech.applyFilters')}</Button>
        </Form>
    );
}
