import { useState } from 'react';
import { Form, InputNumber, Select } from 'antd';
import { useTranslate } from '@refinedev/core';

export function TokenExpiryField() {
    const t = useTranslate();
    const form = Form.useFormInstance();
    const [preset, setPreset] = useState(30);
    const handleChange = (value: number) => {
        setPreset(value);
        if (value !== 0) form.setFieldValue('expiresInDays', value);
    };
    const custom = preset === 0;
    const options = [
        { value: 1, label: t('mcp.oneDay') },
        { value: 7, label: t('mcp.sevenDays') },
        { value: 30, label: t('mcp.thirtyDays') },
        { value: 0, label: t('mcp.customExpiry') },
    ];
    return (
        <>
            <Form.Item label={t('mcp.expiryPreset')}>
                <Select
                    value={preset}
                    options={options}
                    onChange={handleChange}
                />
            </Form.Item>
            <Form.Item
                name='expiresInDays'
                label={t('mcp.expiry')}
                extra={t('mcp.expiryHelp')}
                rules={[{ required: true, type: 'integer', min: 1, max: 90 }]}
            >
                <InputNumber
                    min={1}
                    max={90}
                    precision={0}
                    disabled={!custom}
                />
            </Form.Item>
        </>
    );
}
