import { useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Empty, Spin, Typography } from 'antd';
import { useAdminMcp } from '../../hooks/use-admin-mcp';
import { TokenIssueForm } from '../token-issue-form/token-issue-form';
import { TokenList } from '../token-list/token-list';
import { TokenAudit } from '../token-audit/token-audit';
import { ConnectionGuide } from '../connection-guide/connection-guide';
import styles from '../../../shared/page.module.css';

export function AdminMcpPage() {
    const t = useTranslate();
    const mcp = useAdminMcp();
    const hasTokens = mcp.tokens.length > 0;
    const canIssue = mcp.secret === null;

    return (
        <div className={styles.stack}>
            <Typography.Title>{t('mcp.title')}</Typography.Title>
            <Typography.Paragraph>{t('mcp.description')}</Typography.Paragraph>
            {mcp.error ? (
                <Alert
                    type='error'
                    showIcon
                    message={mcp.error.message}
                    description={t('mcp.failure')}
                    action={
                        <Button onClick={mcp.reload}>
                            {t('actions.refresh')}
                        </Button>
                    }
                />
            ) : null}
            {mcp.secret ? (
                <Card title={t('mcp.secretTitle')}>
                    <Alert type='warning' message={t('mcp.secretHelp')} />
                    <Typography.Paragraph copyable>
                        {mcp.secret}
                    </Typography.Paragraph>
                    <Button onClick={mcp.dismissSecret}>
                        {t('mcp.dismissSecret')}
                    </Button>
                </Card>
            ) : null}
            {canIssue ? (
                <Card title={t('mcp.issue')}>
                    <TokenIssueForm pending={mcp.pending} onIssue={mcp.issue} />
                </Card>
            ) : null}
            <Card
                title={t('mcp.tokens')}
                extra={
                    <Button onClick={mcp.reload}>{t('actions.refresh')}</Button>
                }
            >
                <Spin spinning={mcp.loading}>
                    {hasTokens ? (
                        <TokenList
                            tokens={mcp.tokens}
                            pending={mcp.pending}
                            onRevoke={mcp.revoke}
                        />
                    ) : (
                        <Empty />
                    )}
                </Spin>
            </Card>
            <TokenAudit />
            <ConnectionGuide />
        </div>
    );
}
