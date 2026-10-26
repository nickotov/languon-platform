import type {
    CapabilityPolicy,
    TextAiFlowId,
    TextAiRoutingConfiguration,
} from '@languon/contracts';

export class TextAiRoutingUnavailableError extends Error {}
export class TextAiRoutingConflictError extends Error {}
export class TextAiRoutingInvalidError extends Error {}

/** Operation versions share one commercial and routing policy. */
export function textAiFlowForFormat(format: string): TextAiFlowId {
    const flow = format.split(':')[0];
    const flows: readonly string[] = [
        'single-card',
        'card-authoring',
        'pasted-terms',
        'import-pairs',
        'document-terms',
        'sentence-generation',
        'sentence-check',
        'text-detection',
        'text-translation',
        'text-selection-card',
        'conversation',
        'portrait-interview',
    ];
    if (!flow || !flows.includes(flow))
        throw new TextAiRoutingUnavailableError('Unregistered AI flow.');
    return flow as TextAiFlowId;
}

export function effectiveTextAiRouteIds(
    configuration: TextAiRoutingConfiguration,
    flow: TextAiFlowId,
): string[] {
    const policy = configuration.overrides[flow] ?? configuration.default;
    return [policy.primaryRouteId, ...policy.fallbackRouteIds];
}

export function validateTextAiRouting(
    configuration: TextAiRoutingConfiguration,
    routes: readonly {
        routeId: string;
        formats: readonly string[];
        retired?: boolean;
    }[],
) {
    const enabled = new Set(configuration.enabledRouteIds);
    if (enabled.size !== configuration.enabledRouteIds.length)
        throw new TextAiRoutingInvalidError('Enabled routes must be unique.');
    for (const routeId of enabled) {
        const route = routes.find((candidate) => candidate.routeId === routeId);
        if (!route || route.retired)
            throw new TextAiRoutingInvalidError(
                'A route is not reviewed or has retired.',
            );
    }
    const flows = [
        ...new Set(
            routes.flatMap((route) => route.formats.map(textAiFlowForFormat)),
        ),
    ];
    for (const flow of flows) {
        const ids = effectiveTextAiRouteIds(configuration, flow);
        for (const routeId of ids) {
            const route = routes.find(
                (candidate) => candidate.routeId === routeId,
            );
            if (
                !enabled.has(routeId) ||
                !route ||
                !route.formats.some(
                    (format) => textAiFlowForFormat(format) === flow,
                )
            )
                throw new TextAiRoutingInvalidError(
                    `Route is incompatible with ${flow}.`,
                );
        }
        // Free capabilities may omit a tariff; paid admission checks separately.
    }
}

export function textAiCapabilityForFlow(
    flow: TextAiFlowId,
): CapabilityPolicy['capability'] {
    if (flow === 'portrait-interview' || flow === 'conversation') return flow;
    if (flow.startsWith('sentence-')) return 'sentence-generation';
    if (flow.startsWith('text-')) return 'text-translation';
    return 'dictionary-generation';
}
