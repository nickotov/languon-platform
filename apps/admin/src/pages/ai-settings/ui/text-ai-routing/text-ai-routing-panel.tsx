import { useEffect, useState } from 'react';
import { useLogout, useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Skeleton, Space } from 'antd';
import type { AiSettingsResponse } from '../../types';
import { useTextAiRouting } from '../../hooks/use-text-ai-routing';
import { EmergencyDisableDialog } from './emergency-disable-dialog';
import { ProviderRouteTable } from './provider-route-table';
import { ProbeControls } from './probe-controls';
import { RoutingConfigurationForm } from './routing-configuration-form';
import { RoutingReadinessNotice } from './routing-readiness-notice';
import styles from '../../ai-settings-page.module.css';

export function TextAiRoutingPanel({
    providers,
}: {
    providers: AiSettingsResponse['providers'];
}) {
    const t = useTranslate();
    const logout = useLogout();
    const routing = useTextAiRouting();
    const snapshot = routing.snapshot;
    const revision = snapshot?.routing.revision ?? null;
    const failure = routing.mutationError ?? routing.error;
    const version = revision?.version ?? 0;
    const busy = routing.pending || routing.loading;
    const [disablingRoute, setDisablingRoute] = useState<string | null>(null);

    useEffect(() => {
        setDisablingRoute(null);
    }, [version]);
    const handleDisable = (routeId: string) => {
        routing.clearMutationError();
        setDisablingRoute(routeId);
    };
    const handleCloseDisable = () => {
        if (!routing.pending) setDisablingRoute(null);
    };

    const handleRefresh = () => {
        void routing.refresh();
    };
    const handleSignIn = () => logout.mutate();

    return (
        <section
            className={styles.configuration}
            aria-label={t('routing.title')}
        >
            {failure ? (
                <Alert
                    type='error'
                    showIcon
                    message={failure.message}
                    description={t('routing.errorHelp')}
                    action={
                        <Space wrap>
                            <Button
                                onClick={handleRefresh}
                                disabled={routing.pending}
                            >
                                {t('aiSettings.reloadConflict')}
                            </Button>
                            <Button onClick={handleSignIn}>
                                {t('aiSettings.signInAgain')}
                            </Button>
                        </Space>
                    }
                />
            ) : null}
            {revision && disablingRoute ? (
                <EmergencyDisableDialog
                    key={disablingRoute}
                    routeId={disablingRoute}
                    revision={revision}
                    pending={routing.pending}
                    error={routing.mutationError}
                    onClose={handleCloseDisable}
                    onPublish={routing.disable}
                />
            ) : null}
            <Skeleton active loading={routing.loading && !snapshot}>
                {snapshot ? (
                    <>
                        <RoutingReadinessNotice />
                        <Card
                            title={t('routing.title')}
                            extra={
                                <Button
                                    aria-label={t('routing.refreshHistory')}
                                    onClick={handleRefresh}
                                    disabled={busy}
                                    loading={routing.loading}
                                >
                                    {t('routing.refreshHistory')}
                                </Button>
                            }
                        >
                            <ProviderRouteTable
                                providers={providers}
                                catalog={snapshot.routing.catalog}
                                enabledRouteIds={
                                    revision?.configuration.enabledRouteIds ??
                                    []
                                }
                                probes={snapshot.checks.probes}
                                pending={busy}
                                onDisable={handleDisable}
                            />
                        </Card>
                        <ProbeControls
                            catalog={snapshot.routing.catalog}
                            probes={snapshot.checks.probes}
                            limits={snapshot.checks.limits}
                            pending={busy}
                            onRun={routing.runProbe}
                            onRecover={routing.recoverProbe}
                        />
                        <RoutingConfigurationForm
                            key={version}
                            revision={revision}
                            catalog={snapshot.routing.catalog}
                            pending={busy}
                            onPublish={routing.publish}
                        />
                    </>
                ) : null}
            </Skeleton>
        </section>
    );
}
