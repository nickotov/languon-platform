import { useCustom, useTranslate, type BaseRecord } from '@refinedev/core';
import { Card, Empty, Skeleton, Typography } from 'antd';
import { LoadErrorAlert } from '@/shared/ui/load-error-alert';
import sharedStyles from '../shared/page.module.css';
import type { AiSettingsResponse } from './types';
import { ModelPricesPanel } from './ui/model-prices/model-prices-panel';
import { TextAiRoutingPanel } from './ui/text-ai-routing/text-ai-routing-panel';

export function AiSettingsPage() {
    const translate = useTranslate();
    const settingsQuery = useCustom<AiSettingsResponse & BaseRecord>({
        method: 'get',
        url: 'ai-settings',
    });
    const response = settingsQuery.query.data?.data;
    const hasProviders = (response?.providers.length ?? 0) > 0;
    const handleReload = () => {
        void settingsQuery.query.refetch();
    };

    return (
        <main className={sharedStyles.stack}>
            <header className={sharedStyles.heading}>
                <div>
                    <Typography.Text className={sharedStyles.eyebrow}>
                        {translate('aiSettings.eyebrow')}
                    </Typography.Text>
                    <Typography.Title>
                        {translate('aiSettings.heading')}
                    </Typography.Title>
                </div>
                <Typography.Text type='secondary'>
                    {translate('routing.summary')}
                </Typography.Text>
            </header>
            {settingsQuery.query.isError ? (
                <LoadErrorAlert
                    error={settingsQuery.query.error}
                    message={translate('aiSettings.error')}
                    offlineDescription={translate('errors.offline')}
                    onRetry={handleReload}
                    retryDescription={translate('errors.retry')}
                    retryLabel={translate('actions.retry')}
                />
            ) : null}
            <Skeleton active loading={settingsQuery.query.isLoading}>
                {response && !hasProviders ? (
                    <Card>
                        <Empty description={translate('aiSettings.empty')} />
                    </Card>
                ) : null}
                {response && hasProviders ? (
                    <TextAiRoutingPanel providers={response.providers} />
                ) : null}
            </Skeleton>
            <ModelPricesPanel />
        </main>
    );
}
