import type { adminApi } from '@/shared/api/admin-api';
import {
    TextAiFlowIdSchema,
    type TextAiRoutingConfiguration,
    type TextAiRoutingRevision,
    type TextAiProbe,
} from '@languon/contracts';

export const textAiFlows = TextAiFlowIdSchema.options;

export type RoutingCatalog = Awaited<
    ReturnType<typeof adminApi.textAiRouting>
>['catalog'];

export function reviewedRouteOptions(
    catalog: RoutingCatalog,
    requireProcessingApproval = true,
) {
    return catalog.map((route) => ({
        value: route.routeId,
        label: `${route.providerId} · ${route.label}`,
        disabled:
            !route.configured ||
            route.retired ||
            (requireProcessingApproval && !route.processingEligible),
    }));
}

export function routingInitialValues(
    revision: TextAiRoutingRevision | null,
): Partial<TextAiRoutingConfiguration> & { reason: string } {
    if (revision) return { ...revision.configuration, reason: '' };
    return {
        enabledRouteIds: [],
        default: { primaryRouteId: '', fallbackRouteIds: [] },
        overrides: {},
        flowTariffs: {},
        reason: '',
    };
}

export function probeEvidenceAge(expiresAt: string | null, now = Date.now()) {
    if (!expiresAt) return 'none';
    return new Date(expiresAt).getTime() > now ? 'fresh' : 'stale';
}

export function latestRouteProbe(
    probes: TextAiProbe[],
    routeId: string | undefined,
    selection?: { kind: TextAiProbe['kind']; flowId?: string | undefined },
) {
    return probes.reduce<TextAiProbe | undefined>((latest, probe) => {
        if (probe.routeId !== routeId) return latest;
        if (selection && probe.kind !== selection.kind) return latest;
        if (selection?.kind === 'flow' && probe.flowId !== selection.flowId)
            return latest;
        return !latest ||
            Date.parse(probe.startedAt) > Date.parse(latest.startedAt)
            ? probe
            : latest;
    }, undefined);
}
