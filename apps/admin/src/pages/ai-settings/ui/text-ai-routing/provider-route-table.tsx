import { useTranslate } from '@refinedev/core';
import { Button, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import type { TextAiProbe } from '@languon/contracts';
import type { AiSettingsResponse } from '../../types';
import type { RoutingCatalog } from '../../lib/text-ai-routing-form';
import { probeEvidenceAge } from '../../lib/text-ai-routing-form';

type RouteRow = {
    id: string;
    label: string;
    credential: string;
    enabled: boolean;
    health: string;
    checkedAt: string | null;
    evidence: string;
    processing: string;
    checkedFlow: string | null;
    runtimeFailure: string | null;
    runtimeObservedAt: string | null;
};

export function ProviderRouteTable({
    providers,
    catalog,
    enabledRouteIds,
    probes,
    pending,
    onDisable,
}: {
    providers: AiSettingsResponse['providers'];
    catalog: RoutingCatalog;
    enabledRouteIds: string[];
    probes: TextAiProbe[];
    pending: boolean;
    onDisable(routeId: string): void;
}) {
    const t = useTranslate();
    const rows: RouteRow[] = catalog.map((route) => {
        const provider = providers.find((item) => item.id === route.providerId);
        const evidence = probes.find(
            (probe) =>
                probe.routeId === route.routeId &&
                probe.kind === 'flow' &&
                probe.state === 'passed',
        );
        let processing = t('routing.processingEligible');
        if (route.retired) processing = t('routing.retired');
        else if (!route.processingEligible)
            processing = t('routing.processingBlocked');
        return {
            id: route.routeId,
            label: `${route.providerId} · ${route.label}`,
            credential: route.configured ? 'configured' : 'missing',
            enabled: enabledRouteIds.includes(route.routeId),
            health: provider?.health.status ?? 'unverified',
            checkedAt: evidence?.completedAt ?? null,
            evidence: probeEvidenceAge(evidence?.evidenceExpiresAt ?? null),
            processing,
            checkedFlow: evidence?.flowId ?? null,
            runtimeFailure: route.runtimeHealth?.reason ?? null,
            runtimeObservedAt: route.runtimeHealth?.observedAt ?? null,
        };
    });
    const columns: TableColumnsType<RouteRow> = [
        { title: t('routing.route'), dataIndex: 'label' },
        { title: t('routing.processing'), dataIndex: 'processing' },
        {
            title: t('aiSettings.providerCredential'),
            dataIndex: 'credential',
            render: (value: string) => t(`aiSettings.credential.${value}`),
        },
        {
            title: t('routing.configured'),
            dataIndex: 'enabled',
            render: (value: boolean) => (
                <Tag>
                    {value
                        ? t('routing.enabledState')
                        : t('routing.disabledState')}
                </Tag>
            ),
        },
        {
            title: t('routing.runtimeHealth'),
            dataIndex: 'health',
            render: (value: string) => t(`aiSettings.health.${value}`),
        },
        {
            title: t('routing.runtimeFailure'),
            dataIndex: 'runtimeFailure',
            render: (value: string | null) =>
                value
                    ? t(`routing.failure.${value}`)
                    : t('routing.noRuntimeObservation'),
        },
        {
            title: t('routing.runtimeObservedAt'),
            dataIndex: 'runtimeObservedAt',
            render: (value: string | null) =>
                value ? new Date(value).toLocaleString() : '—',
        },
        {
            title: t('routing.evidence'),
            dataIndex: 'evidence',
            render: (value: string) => t(`routing.evidence.${value}`),
        },
        { title: t('routing.flow'), dataIndex: 'checkedFlow' },
        {
            title: t('routing.checked'),
            dataIndex: 'checkedAt',
            render: (value: string | null) =>
                value ? new Date(value).toLocaleString() : '—',
        },
        {
            title: t('routing.actions'),
            render: (_, row) => (
                <DisableRouteButton
                    route={row}
                    pending={pending}
                    onDisable={onDisable}
                />
            ),
        },
    ];

    return (
        <>
            <Typography.Paragraph type='secondary'>
                {t('routing.separateStates')}
            </Typography.Paragraph>
            <Table
                columns={columns}
                dataSource={rows}
                rowKey='id'
                pagination={false}
                scroll={{ x: 900 }}
            />
        </>
    );
}

function DisableRouteButton({
    route,
    pending,
    onDisable,
}: {
    route: RouteRow;
    pending: boolean;
    onDisable(routeId: string): void;
}) {
    const t = useTranslate();
    const handleDisable = () => onDisable(route.id);
    return (
        <Button
            danger
            disabled={!route.enabled || pending}
            onClick={handleDisable}
        >
            {t('routing.disable')}
        </Button>
    );
}
