import { useState } from 'react';
import { useTranslate } from '@refinedev/core';
import {
    Button,
    Card,
    Descriptions,
    Form,
    Input,
    Modal,
    Space,
    Tag,
    Typography,
} from 'antd';
import type { AdminMcpTokenMetadata } from '@languon/contracts';
import { TokenLimitSummary } from './token-limit-summary';
import styles from './token-list.module.css';

export function TokenList({
    tokens,
    pending,
    onRevoke,
}: {
    tokens: AdminMcpTokenMetadata[];
    pending: boolean;
    onRevoke: (id: string, reason: string) => Promise<boolean>;
}) {
    return (
        <Space direction='vertical' size='middle' style={{ width: '100%' }}>
            {tokens.map((token) => (
                <TokenCard
                    key={token.id}
                    token={token}
                    pending={pending}
                    onRevoke={onRevoke}
                />
            ))}
        </Space>
    );
}

function TokenCard({
    token,
    pending,
    onRevoke,
}: {
    token: AdminMcpTokenMetadata;
    pending: boolean;
    onRevoke: (id: string, reason: string) => Promise<boolean>;
}) {
    const t = useTranslate();
    const [open, setOpen] = useState(false);
    const [form] = Form.useForm<{ reason: string }>();
    let status = 'mcp.active';
    if (token.revokedAt) status = 'mcp.revoked';
    else if (Date.parse(token.expiresAt) <= Date.now()) status = 'mcp.expired';
    const canRevoke = token.revokedAt === null;
    const handleOpen = () => setOpen(true);
    const handleClose = () => setOpen(false);
    const handleFinish = async ({ reason }: { reason: string }) => {
        if (await onRevoke(token.id, reason)) setOpen(false);
    };
    const items = [
        { key: 'owner', label: t('mcp.owner'), children: token.ownerUserId },
        { key: 'created', label: t('mcp.created'), children: token.createdAt },
        { key: 'expires', label: t('mcp.expires'), children: token.expiresAt },
        {
            key: 'lastUsed',
            label: t('mcp.lastUsed'),
            children: token.lastUsedAt ?? t('mcp.never'),
        },
        { key: 'status', label: t('mcp.status'), children: t(status) },
        {
            key: 'permissions',
            label: t('mcp.permissions'),
            children: (
                <div className={styles.permissions}>
                    {token.permissions.map((permission) => (
                        <Tag
                            key={permission}
                            className={styles.permission ?? ''}
                        >
                            {t(`mcp.${permission}`)}
                        </Tag>
                    ))}
                </div>
            ),
        },
        {
            key: 'limits',
            label: t('mcp.limits'),
            children: <TokenLimitSummary limits={token.limits} />,
        },
    ];
    return (
        <>
            <Card
                title={token.name}
                extra={
                    canRevoke ? (
                        <Button danger onClick={handleOpen}>
                            {t('mcp.revoke')}
                        </Button>
                    ) : null
                }
            >
                <Descriptions column={1} size='small' items={items} />
            </Card>
            <Modal
                title={t('mcp.revokeTitle')}
                open={open}
                onCancel={handleClose}
                footer={null}
                destroyOnHidden
            >
                <Typography.Paragraph>
                    {t('mcp.revokeHelp')}
                </Typography.Paragraph>
                <Form form={form} layout='vertical' onFinish={handleFinish}>
                    <Form.Item
                        name='reason'
                        label={t('mcp.reason')}
                        rules={[
                            {
                                required: true,
                                whitespace: true,
                                min: 5,
                                max: 500,
                            },
                        ]}
                    >
                        <Input.TextArea maxLength={500} rows={3} />
                    </Form.Item>
                    <Button htmlType='submit' danger loading={pending}>
                        {t('mcp.revoke')}
                    </Button>
                </Form>
            </Modal>
        </>
    );
}
