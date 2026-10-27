import { useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Typography } from 'antd';
import { useTranslate } from '@refinedev/core';
import {
    adminMcpPermissionSchema,
    type AdminMcpIssueToken,
    type AdminMcpPermission,
} from '@languon/contracts';
import { TokenExpiryField } from '../token-expiry-field/token-expiry-field';
import { TokenLimitsFields } from '../token-limits-fields/token-limits-fields';
import { parseIssueTokenValues } from '../../lib/issue-token-values';

const defaults: AdminMcpIssueToken = {
    name: '',
    reason: '',
    expiresInDays: 30,
    permissions: ['users.read', 'financial-reports.read', 'providers.read'],
    limits: {
        modelChecks: { perCheckUsd: '0.05', perDayUsd: '0.5', concurrency: 1 },
    },
};

export function TokenIssueForm({
    pending,
    onIssue,
}: {
    pending: boolean;
    onIssue: (values: AdminMcpIssueToken) => Promise<boolean>;
}) {
    const t = useTranslate();
    const [form] = Form.useForm<AdminMcpIssueToken>();
    const [invalid, setInvalid] = useState(false);
    const permissions: AdminMcpPermission[] =
        Form.useWatch('permissions', form) ?? defaults.permissions;
    const options = adminMcpPermissionSchema.options.map((value) => ({
        value,
        label: t(`mcp.${value}`),
    }));
    const handleFinish = async (values: AdminMcpIssueToken) => {
        const parsed = parseIssueTokenValues(values);
        setInvalid(!parsed.success);
        if (parsed.success && (await onIssue(parsed.data))) form.resetFields();
    };

    return (
        <Form
            form={form}
            name='issue-admin-mcp-token'
            layout='vertical'
            initialValues={defaults}
            onFinish={handleFinish}
        >
            <Typography.Paragraph>{t('mcp.issueHelp')}</Typography.Paragraph>
            <Form.Item
                name='name'
                label={t('mcp.name')}
                rules={[{ required: true, whitespace: true, max: 80 }]}
            >
                <Input autoComplete='off' maxLength={80} />
            </Form.Item>
            <TokenExpiryField />
            <Form.Item name='permissions' label={t('mcp.permissions')}>
                <Checkbox.Group options={options} />
            </Form.Item>
            <Typography.Paragraph>{t('mcp.authority')}</Typography.Paragraph>
            <Typography.Paragraph type='secondary'>
                {t('mcp.frozen')}
            </Typography.Paragraph>
            <TokenLimitsFields permissions={permissions} />
            <Form.Item
                name='reason'
                label={t('mcp.reason')}
                rules={[{ required: true, whitespace: true, min: 5, max: 500 }]}
            >
                <Input.TextArea rows={2} maxLength={500} showCount />
            </Form.Item>
            {invalid ? <Alert type='error' message={t('mcp.invalid')} /> : null}
            <Button type='primary' htmlType='submit' loading={pending}>
                {t('mcp.issue')}
            </Button>
        </Form>
    );
}
