import type {
    EnqueueTextDetectionRequest,
    EnqueueTextTranslationRequest,
    TextAiJob,
} from '@languon/contracts';
import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../text-ai/application/text-ai-provider-catalog';
import type {
    TextJobInput,
    TextJobKind,
    TextJobResult,
    TextsTokenUsage,
} from './texts-ai-provider';
export interface TextJobContext {
    now: Date;
    signal: AbortSignal;
}
export interface TextsJobStore {
    enqueue(
        ownerId: string,
        kind: TextJobKind,
        input: EnqueueTextDetectionRequest | EnqueueTextTranslationRequest,
        context: TextJobContext,
    ): Promise<TextAiJob>;
    get(
        ownerId: string,
        jobId: string,
        context: TextJobContext,
    ): Promise<TextAiJob>;
    cancel(
        ownerId: string,
        jobId: string,
        context: TextJobContext,
    ): Promise<TextAiJob>;
}
export interface TextsLease {
    jobId: string;
    workerId: string;
    fencingToken: string;
    attempt: number;
}
export interface ClaimedTextsJob {
    lease: TextsLease;
    input: TextJobInput;
    execution: TextAiExecutionSnapshot;
    budget: TextAiProviderBudgetPolicy;
    providerIdempotencyKey: string;
}
export interface TextsWorkerStore {
    claimNext(
        input: {
            workerId: string;
            leaseMs: number;
            globalConcurrency: number;
            userConcurrency: number;
            supportedFormats: readonly (
                'text-detection:v1' | 'text-translation:v1'
            )[];
        },
        context: TextJobContext,
    ): Promise<ClaimedTextsJob | null>;
    heartbeat(
        lease: TextsLease,
        leaseMs: number,
        context: TextJobContext,
    ): Promise<{ owned: boolean; cancellationRequested: boolean }>;
    markDispatched(
        lease: TextsLease,
        context: TextJobContext,
    ): Promise<boolean>;
    complete(
        lease: TextsLease,
        result: TextJobResult,
        usage: TextsTokenUsage | undefined,
        context: TextJobContext,
    ): Promise<boolean>;
    fail(
        lease: TextsLease,
        input: { code: string; retryAt: Date | null; usage?: TextsTokenUsage },
        context: TextJobContext,
    ): Promise<boolean>;
    releaseWorkerLeases(
        workerId: string,
        context: TextJobContext,
    ): Promise<void>;
}
