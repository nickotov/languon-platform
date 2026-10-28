import type { TextAiFlowId, ProviderNativeUsage } from '@languon/contracts';
import type { TextAiProviderAttemptWitness } from './text-ai-provider-attempt-context';
import type { NativeTextCallReceipt } from './provider-native-observations';
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
    observeNativeCall?: (input: {
        callId: string;
        usage: ProviderNativeUsage;
        execution?: { endpointId?: string; serviceTier?: string };
    }) => Promise<void>;
    authorizeNativeCall?: (input: {
        witness: TextAiProviderAttemptWitness;
        inputTokens: number;
        outputTokens: number;
    }) => Promise<NativeTextCallReceipt>;
    onProviderFailure?: TextAiProviderFailureObserver;
    /** Current credential/flow identity; resolver applies the pinned native request policy. */
    currentFingerprint?: (
        routeId: string,
        flowId: TextAiFlowId,
    ) => string | null;
}
