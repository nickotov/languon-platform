import { createHash } from 'node:crypto';
import type { TextAiProbeRequest } from '@languon/contracts';
import { TextAiFlowIdSchema } from '@languon/contracts';
import { TextAiProbeUnavailableError } from '../../application/ports/text-ai-probe-store';
import { findTextAiModel } from './text-ai-provider-catalog';

export function textAiProbeIdentity(
    request: Omit<TextAiProbeRequest, 'approvedMaximumCostUsd'>,
    credentials: Readonly<Partial<Record<string, string>>>,
    contractRevision = 'flow-contract:v1',
) {
    const route = findTextAiModel(request.routeId);
    const key = route
        ? credentials[route.credentialEnvironmentVariable]
        : undefined;
    if (
        !route ||
        !key ||
        request.routeId === 'kie/gemini-2.5-pro' ||
        (request.kind === 'flow' &&
            !TextAiFlowIdSchema.safeParse(request.flowId).success)
    )
        throw new TextAiProbeUnavailableError('probe_route_unavailable');
    // Only the opaque hash is persisted. Neither credential material nor a reversible identifier leaves the server.
    const credentialRevision = createHash('sha256')
        .update('languon-probe-credential-v1\0')
        .update(key)
        .digest('hex');
    const fingerprint = createHash('sha256')
        .update(
            JSON.stringify({
                routeId: route.id,
                adapter: route.adapterRevision,
                requestPolicyRevision: route.requestPolicyRevision,
                credentialRevision,
                processing:
                    'processingControlsRevision' in route
                        ? route.processingControlsRevision
                        : 'direct-provider-processing:v1',
                flow: request.flowId ?? null,
                contractRevision,
            }),
        )
        .digest('hex');
    return {
        routeId: route.id,
        providerId: route.providerId,
        modelId: route.modelId,
        fingerprint,
    };
}
