import type { ProviderPrice, TextAiFlowId } from '@languon/contracts';
import type { TextAiExecutionSnapshot } from './text-ai-provider-catalog';

/** Admitted alternatives are immutable; current defaults never authorize a retry. */
export interface TextAiRoutingAuthority {
    revisionId: string;
    flowId: TextAiFlowId;
    candidates: Array<{
        routeId: string;
        fingerprint: string;
        snapshot: TextAiExecutionSnapshot;
        providerPrice: ProviderPrice;
    }>;
    automaticReattemptLimit: 1;
    tariffPublished: boolean;
}
