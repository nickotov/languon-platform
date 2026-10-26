import type { TextAiFlowId } from '@languon/contracts';
import type { TextAiProviderCredentials } from '../../modules/text-ai/application/text-ai-provider-catalog';
import { textAiProbeIdentity } from '../../modules/text-ai/infrastructure/ai/text-ai-probe-identity';
import { textAiSyntheticFlowContractRevision } from '../../modules/text-ai/infrastructure/ai/text-ai-probe-executor';
import { createTextAiSyntheticFlows } from './probe-flow-registry';

let contractRevisions: ReadonlyMap<string, string> | undefined;
function revisionsForRelease() {
    if (!contractRevisions) {
        contractRevisions = new Map(
            Object.entries(createTextAiSyntheticFlows()).map(([id, flow]) => [
                id,
                textAiSyntheticFlowContractRevision(flow),
            ]),
        );
    }
    return contractRevisions;
}

/** Shared by activation, admission and disposable fixtures; no credentials escape. */
export function createTextAiRouteFingerprint(
    credentials: Readonly<TextAiProviderCredentials>,
) {
    const revisions = revisionsForRelease();
    return (routeId: string, flowId: string): string | null => {
        const revision = revisions.get(flowId);
        if (!revision) return null;
        try {
            return textAiProbeIdentity(
                { routeId, flowId: flowId as TextAiFlowId, kind: 'flow' },
                credentials,
                revision,
            ).fingerprint;
        } catch {
            return null;
        }
    };
}
