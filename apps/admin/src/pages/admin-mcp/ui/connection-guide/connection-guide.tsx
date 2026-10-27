import { useState } from 'react';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Card,
    Collapse,
    Form,
    InputNumber,
    Space,
    Tabs,
    Typography,
    type TabsProps,
} from 'antd';
import {
    buildClientConfigurations,
    defaultMcpPort,
    environmentSetup,
} from '../../lib/client-configurations';
import styles from './connection-guide.module.css';

export function ConnectionGuide() {
    const t = useTranslate();
    const [port, setPort] = useState<number | null>(defaultMcpPort);
    const validPort =
        typeof port === 'number' &&
        Number.isInteger(port) &&
        port >= 1024 &&
        port <= 65535;
    const configurations =
        validPort && port !== null ? buildClientConfigurations(port) : null;
    const handlePortChange = (value: number | null) => setPort(value);
    const portStatus = validPort ? '' : 'error';
    const portHelp = validPort ? t('mcp.portHelp') : t('mcp.portInvalid');
    const tabs: TabsProps['items'] = [];
    if (configurations)
        tabs.push(
            {
                key: 'codex',
                label: 'Codex',
                children: (
                    <ClientConfiguration
                        help={t('mcp.codexPath')}
                        configuration={configurations.codex}
                        source='https://developers.openai.com/codex/mcp/'
                    />
                ),
            },
            {
                key: 'claude',
                label: 'Claude Code',
                children: (
                    <ClientConfiguration
                        help={t('mcp.claudePath')}
                        configuration={configurations.claude}
                        source='https://code.claude.com/docs/en/mcp'
                    />
                ),
            },
            {
                key: 'opencode',
                label: 'OpenCode',
                children: (
                    <ClientConfiguration
                        help={t('mcp.opencodePath')}
                        configuration={configurations.opencode}
                        source='https://docs.opencode.ai/docs/mcp-servers/'
                    />
                ),
            },
        );
    const troubleshooting = [
        {
            key: 'troubleshooting',
            label: t('mcp.troubleshoot'),
            children: (
                <Typography.Paragraph>
                    {t('mcp.troubleshootHelp')}
                </Typography.Paragraph>
            ),
        },
    ];

    return (
        <Card title={t('mcp.guide')}>
            <Typography.Paragraph>{t('mcp.guideIntro')}</Typography.Paragraph>
            <Typography.Title level={4}>{t('mcp.start')}</Typography.Title>
            <CodeBlock text='pnpm dev:admin-mcp' />
            <Typography.Title level={4}>
                {t('mcp.environment')}
            </Typography.Title>
            <Typography.Paragraph>
                {t('mcp.environmentHelp')}
            </Typography.Paragraph>
            <CodeBlock text={environmentSetup} />
            <Typography.Title level={4}>{t('mcp.config')}</Typography.Title>
            <Form.Item
                label={t('mcp.port')}
                htmlFor='admin-mcp-listener-port'
                validateStatus={portStatus}
                help={portHelp}
            >
                <InputNumber
                    id='admin-mcp-listener-port'
                    value={port}
                    onChange={handlePortChange}
                    min={1024}
                    max={65535}
                    precision={0}
                />
            </Form.Item>
            {validPort ? <Tabs items={tabs} /> : null}
            <Typography.Title level={4}>{t('mcp.test')}</Typography.Title>
            <Typography.Paragraph>{t('mcp.testHelp')}</Typography.Paragraph>
            <Alert type='info' showIcon message={t('mcp.localOnly')} />
            <Collapse items={troubleshooting} />
        </Card>
    );
}

function ClientConfiguration({
    help,
    configuration,
    source,
}: {
    help: string;
    configuration: string;
    source: string;
}) {
    const t = useTranslate();
    return (
        <Space
            direction='vertical'
            size='middle'
            className={styles.content ?? ''}
        >
            <Typography.Paragraph>{help}</Typography.Paragraph>
            <CodeBlock text={configuration} />
            <Typography.Link
                href={source}
                target='_blank'
                rel='noopener noreferrer'
            >
                {t('mcp.sources')}
            </Typography.Link>
        </Space>
    );
}

function CodeBlock({ text }: { text: string }) {
    return (
        <Typography.Paragraph copyable={{ text }} className={styles.code ?? ''}>
            <code>{text}</code>
        </Typography.Paragraph>
    );
}
