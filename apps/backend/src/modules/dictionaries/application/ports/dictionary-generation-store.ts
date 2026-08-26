import type {
    DictionaryAiImportResponse,
    DictionaryGenerationCandidate,
    DictionaryGenerationJob,
    DictionaryImportPairsGenerationAcceptedOutcome,
    DictionaryPastedTermsGenerationAcceptedOutcome,
    DictionaryImportTarget,
} from '@languon/contracts';

import type {
    DictionaryBatchGenerationProposalPayload,
    DictionaryImportPairsGenerationProposalPayload,
} from '../../domain/batch-generation';
import type {
    DictionaryGenerationInputPayload,
    DictionaryGenerationProposalPayload,
} from '../../domain/generation';
import type { DictionaryOperationContext } from './dictionary-store';
import type { DictionaryGenerationProviderBudgetPolicy } from './dictionary-generation-provider-policy';

export type DictionaryGenerationPublicState =
    | 'accepted'
    | 'cancelled'
    | 'discarded'
    | 'expired'
    | 'failed'
    | 'queued'
    | 'review'
    | 'running';

export type DictionaryGenerationJobView = DictionaryGenerationJob;

export interface ClaimedDictionaryGenerationJob {
    attempt: number;
    fencingToken: bigint;
    id: string;
    input: DictionaryGenerationInputPayload;
    leaseDeadline: Date;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    workerId: string;
}

export interface DictionaryGenerationWorkerWrite {
    context: DictionaryOperationContext;
    fencingToken: bigint;
    jobId: string;
    leaseDeadline: Date;
    workerId: string;
}

export interface DictionaryOperationalMeasurement {
    schemaVersion: 1;
    windowSeconds: number;
    queueAwaitingUploadDepth: number;
    queueQueuedDepth: number;
    queueRunningDepth: number;
    queueRetryDepth: number;
    queueOldestRunnableAgeMs: number;
    queueSingleCardDepth: number;
    queuePastedTermsDepth: number;
    queueDocumentTermsDepth: number;
    queueImportPairsDepth: number;
    queueSingleCardOldestAgeMs: number;
    queuePastedTermsOldestAgeMs: number;
    queueDocumentTermsOldestAgeMs: number;
    queueImportPairsOldestAgeMs: number;
    expiredRunningLeaseDepth: number;
    generationQueueCapacityRemaining: number;
    ownersAtGenerationQueueCapacity: number;
    outcomeCompletedCount: number;
    outcomeFailedCount: number;
    outcomeCancelledCount: number;
    outcomeExpiredCount: number;
    reviewAcceptedCount: number;
    reviewDiscardedCount: number;
    reviewExpiredCount: number;
    processingAverageDurationMs: number;
    processingMaximumDurationMs: number;
    retryAttemptCount: number;
    failureInvalidModelOutputCount: number;
    failureProviderUnavailableCount: number;
    failureProviderTimeoutCount: number;
    failureProviderRateLimitedCount: number;
    failureMalwareDetectedCount: number;
    failureScanCount: number;
    failureInvalidDocumentCount: number;
    failureExtractionCount: number;
    failureNoTermsFoundCount: number;
    failureTooManyTermsCount: number;
    settledProviderReservationAttemptCount: number;
    providerActiveReservationCount: number;
    providerActiveCapacityRemaining: number;
    providerCircuitOpenCount: number;
    providerCircuitFailureCount: number;
    providerReservedInputTokenCount: number;
    providerReservedOutputTokenCount: number;
    providerReservedCostMicros: number;
    settledProviderBudgetInputTokenCount: number;
    settledProviderBudgetOutputTokenCount: number;
    settledProviderBudgetCostMicros: number;
    scannerFailureCount: number;
    ocrFailureCount: number;
    uploadAuthorizationCount: number;
    uploadCompletionCount: number;
    uploadAuthorizedByteCount: number;
    uploadSmallSizeCount: number;
    uploadMediumSizeCount: number;
    uploadLargeSizeCount: number;
    uploadPendingPhysicalByteCount: number;
    scanCompletionCount: number;
    scanAverageDurationMs: number;
    scanCleanCount: number;
    scanInfectedCount: number;
    scanUnavailableCount: number;
    scanTimeoutCount: number;
    scanLimitExceededCount: number;
    scanInvalidResponseCount: number;
    scanStaleSignatureCount: number;
    parserFailureCount: number;
    scannerLatestSignatureAgeMs: number;
    cleanupPendingDepth: number;
    cleanupRunningDepth: number;
    cleanupWaitingCapabilityExpiryDepth: number;
    cleanupFailureDepth: number;
    cleanupOldestLagMs: number;
    cleanupRetryAttemptCount: number;
    cleanupLagBreachDepth: number;
}

export interface DictionaryGenerationStore {
    acceptSingleCard(input: {
        candidate: DictionaryGenerationCandidate;
        candidateFingerprint: string;
        context: DictionaryOperationContext;
        jobId: string;
        ownerId: string;
    }): Promise<{
        job: DictionaryGenerationJobView;
        outcome: {
            cardId: string;
            cardVersion: number;
            dictionaryVersion: number;
        };
    }>;
    acceptBatch(input: {
        acceptanceFingerprint: string;
        context: DictionaryOperationContext;
        jobId: string;
        ownerId: string;
        selected: Array<{
            candidate: DictionaryGenerationCandidate;
            rowIndex: number;
        }>;
    }): Promise<{
        job: DictionaryGenerationJobView;
        outcome:
            | DictionaryPastedTermsGenerationAcceptedOutcome
            | DictionaryImportPairsGenerationAcceptedOutcome;
    }>;
    /** @deprecated Use acceptBatch; retained for source compatibility. */
    acceptPastedTerms(input: {
        acceptanceFingerprint: string;
        context: DictionaryOperationContext;
        jobId: string;
        ownerId: string;
        selected: Array<{
            candidate: DictionaryGenerationCandidate;
            rowIndex: number;
        }>;
    }): Promise<{
        job: DictionaryGenerationJobView;
        outcome: DictionaryPastedTermsGenerationAcceptedOutcome;
    }>;
    cancel(input: {
        context: DictionaryOperationContext;
        jobId: string;
        ownerId: string;
    }): Promise<DictionaryGenerationJobView>;
    claim(input: {
        context: DictionaryOperationContext;
        leaseDurationMs: number;
        globalConcurrency: number;
        ownerConcurrency: number;
        supportedFormats: readonly string[];
        workerId: string;
    }): Promise<ClaimedDictionaryGenerationJob | null>;
    complete(
        input: DictionaryGenerationWorkerWrite & {
            proposal:
                | DictionaryGenerationProposalPayload
                | DictionaryBatchGenerationProposalPayload
                | DictionaryImportPairsGenerationProposalPayload;
            providerUsage?: {
                inputTokens: number;
                outputTokens: number;
            };
            reviewExpiresAt: Date;
        },
    ): Promise<boolean>;
    discard(input: {
        context: DictionaryOperationContext;
        jobId: string;
        ownerId: string;
    }): Promise<DictionaryGenerationJobView>;
    enqueue(input: {
        context: DictionaryOperationContext;
        dictionaryId: string;
        cardId: string;
        expectedCardVersion: number;
        expectedDictionaryVersion: number;
        expectedSettingsVersion: number;
        fingerprint: string;
        idempotencyKey: string;
        instruction: string | null;
        ownerId: string;
    }): Promise<DictionaryGenerationJobView>;
    enqueuePastedTerms(
        input: {
            context: DictionaryOperationContext;
            dictionaryId: string;
            expectedDictionaryVersion: number;
            expectedSettingsVersion: number;
            fingerprint: string;
            idempotencyKey: string;
            ownerId: string;
        } & (
            | {
                  retry?: never;
                  sharedContext: string | null;
                  text: string;
              }
            | {
                  retry: { jobId: string; rowIndexes: number[] };
                  sharedContext?: never;
                  text?: never;
              }
        ),
    ): Promise<DictionaryGenerationJobView>;
    enqueueDocumentFailureRetry(input: {
        context: DictionaryOperationContext;
        dictionaryId: string;
        expectedDictionaryVersion: number;
        expectedSettingsVersion: number;
        fingerprint: string;
        idempotencyKey: string;
        ownerId: string;
        predecessorJobId: string;
        rowIndexes: number[];
    }): Promise<DictionaryGenerationJobView>;
    enqueueImportPairs(input: {
        context: DictionaryOperationContext;
        fingerprint: string;
        idempotencyKey: string;
        importFingerprint: string;
        instruction: string | null;
        ownerId: string;
        rows: Array<{
            rowIndex: number;
            source: string;
            translation: string;
        }>;
        target: DictionaryImportTarget;
    }): Promise<DictionaryAiImportResponse>;
    enqueueImportPairsRetry(input: {
        context: DictionaryOperationContext;
        expectedDictionaryVersion: number;
        expectedSettingsVersion: number;
        fingerprint: string;
        idempotencyKey: string;
        ownerId: string;
        predecessorJobId: string;
        rowIndexes: number[];
    }): Promise<DictionaryGenerationJobView>;
    expireReviewPayloads(input: {
        context: DictionaryOperationContext;
        limit: number;
    }): Promise<number>;
    fail(
        input: DictionaryGenerationWorkerWrite & {
            failureCategory: string;
            retryAt: Date | null;
        },
    ): Promise<boolean>;
    heartbeat(
        input: DictionaryGenerationWorkerWrite & {
            nextLeaseDeadline: Date;
            progress?: {
                percent: number;
                stage:
                    | 'cleaning'
                    | 'extracting'
                    | 'generating'
                    | 'ocr'
                    | 'scanning'
                    | 'validating';
            };
        },
    ): Promise<boolean>;
    latestForCard(input: {
        cardId: string;
        context: DictionaryOperationContext;
        dictionaryId: string;
        ownerId: string;
    }): Promise<DictionaryGenerationJobView | null>;
    observeOperationalState(input: {
        context: DictionaryOperationContext;
        windowStartedAt: Date;
    }): Promise<DictionaryOperationalMeasurement>;
    read(input: {
        context: DictionaryOperationContext;
        jobId: string;
        ownerId: string;
    }): Promise<DictionaryGenerationJobView>;
    readiness(signal: AbortSignal): Promise<void>;
    releaseWorkerLeases(input: {
        context: DictionaryOperationContext;
        workerId: string;
    }): Promise<void>;
}
