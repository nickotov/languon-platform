import type { TextAiFlowId } from '@languon/contracts';
import type {
    SentenceProviderFailure,
    SentenceProviderFailureReason,
} from '../../../learning/infrastructure/ai/sentence-provider-failure';

export interface TextAiProviderFailureEvent {
    routeId: string;
    flowId: TextAiFlowId;
    fingerprint: string;
    reason: SentenceProviderFailureReason;
    failure: SentenceProviderFailure;
}
/** Runtime health writes are awaited; failure must prevent successful publication. */
export type TextAiProviderFailureObserver = (
    event: TextAiProviderFailureEvent,
) => Promise<void>;
export interface TextAiProviderRuntimeOptions {
    onProviderFailure?: TextAiProviderFailureObserver;
    currentFingerprint?: (
        routeId: string,
        flowId: TextAiFlowId,
    ) => string | null;
}
