import type { adminApi } from '@/shared/api/admin-api';
import {
    TextAiFlowIdSchema,
    type TextAiRoutingConfiguration,
    type TextAiRoutingRevision,
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
