import type { SentenceFeedback, SentenceJobFailure } from '@languon/contracts';
import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../text-ai/application/text-ai-provider-catalog';
import type {
    SentenceCheckInput,
    SentenceGenerationInput,
    SentenceGeneratedContent,
} from '../../domain/sentence-types';
import type { SentenceTokenUsage } from './sentence-ai-provider';
import type { SentenceContext } from './sentence-practice-store';
export type SentenceJobKind = 'sentence-generation' | 'sentence-check';
export type SentenceJobFormat = 'sentence-generation:v1' | 'sentence-check:v1';
export interface SentenceLease {
    jobId: string;
    workerId: string;
    fencingToken: number;
    attempt: number;
}
export type ClaimedSentenceJob = {
    lease: SentenceLease;
    leaseDeadline: Date;
    execution: TextAiExecutionSnapshot;
    budget: TextAiProviderBudgetPolicy;
    providerIdempotencyKey: string;
} & (
    | { kind: 'sentence-generation'; input: SentenceGenerationInput }
    | { kind: 'sentence-check'; input: SentenceCheckInput }
);
export type SentenceWriteResult = 'committed' | 'terminalized' | 'lost';
export interface SentenceWorkerStore {
    claimNext(
        input: {
            workerId: string;
            supportedFormats: readonly SentenceJobFormat[];
            learningExecutionRevision: 1;
            textAiSelectionRevision: 1;
            creditSettlementRevision: 1;
            leaseMs: number;
            globalConcurrency: number;
            learnerConcurrency: number;
        },
        context: SentenceContext,
    ): Promise<ClaimedSentenceJob | null>;
    heartbeat(
        lease: SentenceLease,
        leaseMs: number,
        context: SentenceContext,
    ): Promise<{ owned: boolean; cancellationRequested: boolean }>;
    markDispatched(
        lease: SentenceLease,
        context: SentenceContext,
    ): Promise<'dispatch' | 'terminalized' | 'lost'>;
    completeGeneration(
        lease: SentenceLease,
        result: {
            content: SentenceGeneratedContent;
            usage?: SentenceTokenUsage;
        },
        context: SentenceContext,
    ): Promise<SentenceWriteResult>;
    completeCheck(
        lease: SentenceLease,
        result: { feedback: SentenceFeedback; usage?: SentenceTokenUsage },
        context: SentenceContext,
    ): Promise<SentenceWriteResult>;
    fail(
        lease: SentenceLease,
        failure: {
            code: SentenceJobFailure;
            retryAt: Date | null;
            usage?: SentenceTokenUsage;
        },
        context: SentenceContext,
    ): Promise<SentenceWriteResult>;
    releaseWorkerLeases(
        workerId: string,
        context: SentenceContext,
    ): Promise<void>;
}
