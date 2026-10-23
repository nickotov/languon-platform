import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { dictionaryDocumentGenerationFormat } from '../../../domain/document-ingestion';
import {
    dictionaryCardAuthoringGenerationFormat,
    dictionaryCardAuthoringGenerationFormatV1,
} from '../../../domain/card-authoring';
import {
    and,
    asc,
    count,
    desc,
    eq,
    gte,
    inArray,
    isNotNull,
    isNull,
    lte,
    or,
    sql,
} from 'drizzle-orm';
import type {
    DictionaryGenerationStore,
    DictionaryOperationalMeasurement,
} from '../../../application/ports/dictionary-generation-store';
import {
    dictionaryGenerationFormat,
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../../../domain/generation';
import {
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
    dictionaryDocumentUploadsTable,
} from './schema';
import type { GenerationStoreContext } from './generation-context';
import {
    abort,
    generationLimits,
    providerOperationalBudget,
} from './generation-context';
import { expireProposal } from './generation-job-access';

export async function expireReviewPayloads(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['expireReviewPayloads']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        const rows = await tx
            .select({ jobId: dictionaryGenerationProposalsTable.jobId })
            .from(dictionaryGenerationProposalsTable)
            .where(
                and(
                    eq(
                        dictionaryGenerationProposalsTable.reviewState,
                        'reviewable',
                    ),
                    or(
                        isNull(
                            dictionaryGenerationProposalsTable.documentStagedAt,
                        ),
                        isNotNull(
                            dictionaryGenerationProposalsTable.documentPublishedAt,
                        ),
                    ),
                    lte(
                        dictionaryGenerationProposalsTable.expiresAt,
                        input.context.now,
                    ),
                ),
            )
            .orderBy(asc(dictionaryGenerationProposalsTable.expiresAt))
            .limit(input.limit)
            .for('update', { skipLocked: true });

        for (const row of rows)
            await expireProposal(tx, row.jobId, input.context.now);

        return rows.length;
    });
}

export async function readiness(
    context: GenerationStoreContext,
    signal: AbortSignal,
) {
    signal.throwIfAborted();
    await context.database.execute(sql`select 1`);
    signal.throwIfAborted();
}

export async function observeOperationalState(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['observeOperationalState']>[0],
): Promise<DictionaryOperationalMeasurement> {
    abort(input.context);
    const windowMs =
        input.context.now.getTime() - input.windowStartedAt.getTime();

    if (windowMs < 10_000 || windowMs > 300_000)
        throw new Error(
            'Dictionary operational measurement window is invalid.',
        );
    const observedAt = input.context.now.toISOString();
    const windowStartedAt = input.windowStartedAt.toISOString();
    const [jobs] = await context.database
        .select({
            awaitingUploadDepth: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.awaitingUploadAt} is not null)`,
            providerActiveReservations: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active')`,
            providerReservedInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)::bigint`,
            providerReservedOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)::bigint`,
            providerReservedCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)::bigint`,
            expiredRunningLeases: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'running' and ${dictionaryGenerationJobsTable.leaseDeadline} <= ${observedAt}::timestamptz)`,
            oldestRunnableAgeMs: sql<number>`coalesce(greatest(0, extract(epoch from (${observedAt}::timestamptz - min(${dictionaryGenerationJobsTable.createdAt}) filter (where ${dictionaryGenerationJobsTable.executionState} = 'queued' and ${dictionaryGenerationJobsTable.awaitingUploadAt} is null and ${dictionaryGenerationJobsTable.nextAttemptAt} <= ${observedAt}::timestamptz))) * 1000), 0)::bigint`,
            ownersAtCapacity: sql<number>`(select count(*)::bigint from (select owner_id from dictionary_generation_jobs where execution_state in ('queued', 'running') group by owner_id having count(*) >= ${generationLimits.ownerQueued}) capacity_owners)`,
            queuedDepth: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'queued' and ${dictionaryGenerationJobsTable.awaitingUploadAt} is null)`,
            retryDepth: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'queued' and ${dictionaryGenerationJobsTable.awaitingUploadAt} is null and ${dictionaryGenerationJobsTable.attemptCount} > 0)`,
            runningDepth: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'running')`,
        })
        .from(dictionaryGenerationJobsTable)
        .where(
            inArray(dictionaryGenerationJobsTable.executionState, [
                'queued',
                'running',
            ]),
        );

    abort(input.context);
    const [terminalJobs] = await context.database
        .select({
            cancelledCount: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'cancelled')`,
            completedCount: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'completed')`,
            failedCount: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'failed')`,
            expiredCount: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'expired')`,
            averageDurationMs: sql<number>`coalesce(avg(extract(epoch from (${dictionaryGenerationJobsTable.completedAt} - ${dictionaryGenerationJobsTable.createdAt})) * 1000), 0)::bigint`,
            maximumDurationMs: sql<number>`coalesce(max(extract(epoch from (${dictionaryGenerationJobsTable.completedAt} - ${dictionaryGenerationJobsTable.createdAt})) * 1000), 0)::bigint`,
            ocrFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'ocr_failed')`,
            invalidModelOutputFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'invalid_model_output')`,
            providerUnavailableFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'provider_unavailable')`,
            providerTimeoutFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'provider_timeout')`,
            providerRateLimitedFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'provider_rate_limited')`,
            malwareFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'malware_detected')`,
            scanFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'scan_failed')`,
            invalidDocumentFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'invalid_document')`,
            extractionFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'extraction_failed')`,
            noTermsFoundFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'no_terms_found')`,
            tooManyTermsFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'too_many_terms')`,
            retryAttempts: sql<number>`coalesce(sum(greatest(${dictionaryGenerationJobsTable.attemptCount} - 1, 0)), 0)::bigint`,
        })
        .from(dictionaryGenerationJobsTable)
        .where(
            gte(
                dictionaryGenerationJobsTable.completedAt,
                input.windowStartedAt,
            ),
        );

    abort(input.context);
    const [providerSettlements] = await context.database
        .select({
            attempts: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedAttempts}), 0)::bigint`,
            inputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualInputTokens}), 0)::bigint`,
            outputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualOutputTokens}), 0)::bigint`,
            costMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualCostMicros}), 0)::bigint`,
        })
        .from(dictionaryGenerationJobsTable)
        .where(
            and(
                inArray(
                    dictionaryGenerationJobsTable.providerReservationState,
                    ['settled', 'released'],
                ),
                gte(
                    dictionaryGenerationJobsTable.providerReservationSettledAt,
                    input.windowStartedAt,
                ),
            ),
        );

    abort(input.context);
    const formatQueues = await context.database
        .select({
            depth: count(),
            format: dictionaryGenerationJobsTable.format,
            oldestAt: sql<
                string | null
            >`min(${dictionaryGenerationJobsTable.createdAt}) filter (where ${dictionaryGenerationJobsTable.nextAttemptAt} <= ${observedAt}::timestamptz)::text`,
        })
        .from(dictionaryGenerationJobsTable)
        .where(
            and(
                eq(dictionaryGenerationJobsTable.executionState, 'queued'),
                isNull(dictionaryGenerationJobsTable.awaitingUploadAt),
            ),
        )
        .groupBy(dictionaryGenerationJobsTable.format);

    abort(input.context);
    const [reviews] = await context.database
        .select({
            accepted: sql<number>`count(*) filter (where ${dictionaryGenerationProposalsTable.reviewState} = 'accepted' and ${dictionaryGenerationProposalsTable.terminalAt} >= ${windowStartedAt}::timestamptz)`,
            discarded: sql<number>`count(*) filter (where ${dictionaryGenerationProposalsTable.reviewState} = 'discarded' and ${dictionaryGenerationProposalsTable.terminalAt} >= ${windowStartedAt}::timestamptz)`,
            expired: sql<number>`count(*) filter (where ${dictionaryGenerationProposalsTable.reviewState} = 'expired' and ${dictionaryGenerationProposalsTable.terminalAt} >= ${windowStartedAt}::timestamptz)`,
        })
        .from(dictionaryGenerationProposalsTable)
        .where(
            gte(
                dictionaryGenerationProposalsTable.terminalAt,
                input.windowStartedAt,
            ),
        );

    abort(input.context);
    const [documents] = await context.database
        .select({
            cleanupFailures: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} <> 'complete' and ${dictionaryDocumentUploadsTable.cleanupFailureCategory} is not null)`,
            cleanupOldestLagMs: sql<number>`coalesce(greatest(0, extract(epoch from (${observedAt}::timestamptz - (min(coalesce(${dictionaryDocumentUploadsTable.terminalAt}, ${dictionaryDocumentUploadsTable.updatedAt})) filter (where ${dictionaryDocumentUploadsTable.cleanupState} in ('pending', 'running', 'waiting_capability_expiry'))))) * 1000), 0)::bigint`,
            cleanupPending: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} = 'pending')`,
            cleanupRetries: sql<number>`coalesce(sum(greatest(${dictionaryDocumentUploadsTable.cleanupAttemptCount} - 1, 0)) filter (where ${dictionaryDocumentUploadsTable.cleanupState} <> 'complete'), 0)::bigint`,
            cleanupRunning: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} = 'running')`,
            cleanupWaiting: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} = 'waiting_capability_expiry')`,
            scannerFailures: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} in ('infected', 'unavailable', 'timeout', 'limit_exceeded', 'invalid_response', 'stale_signatures') and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            authorizations: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz)`,
            completions: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.uploadCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            authorizedBytes: sql<number>`coalesce(sum(${dictionaryDocumentUploadsTable.expectedSizeBytes}) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz), 0)::bigint`,
            smallUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz and ${dictionaryDocumentUploadsTable.expectedSizeBytes} <= 1048576)`,
            mediumUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz and ${dictionaryDocumentUploadsTable.expectedSizeBytes} > 1048576 and ${dictionaryDocumentUploadsTable.expectedSizeBytes} <= 8388608)`,
            largeUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz and ${dictionaryDocumentUploadsTable.expectedSizeBytes} > 8388608)`,
            pendingPhysicalBytes: sql<number>`coalesce(sum(${dictionaryDocumentUploadsTable.accountedPhysicalBytes}) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null), 0)::bigint`,
            scanCompletions: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            scanAverageDurationMs: sql<number>`coalesce(avg(extract(epoch from (${dictionaryDocumentUploadsTable.scanCompletedAt} - ${dictionaryDocumentUploadsTable.uploadCompletedAt})) * 1000) filter (where ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz), 0)::bigint`,
            scanClean: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'clean' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            scanInfected: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'infected' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            scanUnavailable: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'unavailable' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            scanTimeout: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'timeout' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            scanLimitExceeded: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'limit_exceeded' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            scanInvalidResponse: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'invalid_response' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            scanStaleSignature: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'stale_signatures' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
            cleanupLagBreaches: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} in ('pending', 'running', 'waiting_capability_expiry') and coalesce(${dictionaryDocumentUploadsTable.terminalAt}, ${dictionaryDocumentUploadsTable.updatedAt}) <= ${observedAt}::timestamptz - interval '24 hours')`,
        })
        .from(dictionaryDocumentUploadsTable)
        .where(
            or(
                inArray(dictionaryDocumentUploadsTable.cleanupState, [
                    'pending',
                    'running',
                    'waiting_capability_expiry',
                ]),
                isNull(dictionaryDocumentUploadsTable.quotaReleasedAt),
                gte(
                    dictionaryDocumentUploadsTable.createdAt,
                    input.windowStartedAt,
                ),
                gte(
                    dictionaryDocumentUploadsTable.uploadCompletedAt,
                    input.windowStartedAt,
                ),
                gte(
                    dictionaryDocumentUploadsTable.scanCompletedAt,
                    input.windowStartedAt,
                ),
            ),
        );

    abort(input.context);
    const [latestScan] = await context.database
        .select({
            signatureUpdatedAt:
                dictionaryDocumentUploadsTable.scannerSignatureUpdatedAt,
        })
        .from(dictionaryDocumentUploadsTable)
        .where(
            and(
                isNotNull(dictionaryDocumentUploadsTable.scanCompletedAt),
                isNotNull(
                    dictionaryDocumentUploadsTable.scannerSignatureUpdatedAt,
                ),
            ),
        )
        .orderBy(desc(dictionaryDocumentUploadsTable.scanCompletedAt))
        .limit(1);

    abort(input.context);
    const [circuits] = await context.database
        .select({
            failureCount: sql<number>`coalesce(sum(${dictionaryGenerationProviderCircuitTable.consecutiveFailures}), 0)::bigint`,
            openCount: sql<number>`count(*) filter (where ${dictionaryGenerationProviderCircuitTable.openUntil} > ${observedAt}::timestamptz)`,
        })
        .from(dictionaryGenerationProviderCircuitTable);

    abort(input.context);
    const number = (value: unknown) =>
        Math.max(0, Math.round(Number(value ?? 0)));
    const queueFor = (format: string) =>
        formatQueues.find((queue) => queue.format === format);
    const queueAge = (format: string) => {
        const oldestAt = queueFor(format)?.oldestAt;

        return oldestAt
            ? Math.max(
                  0,
                  input.context.now.getTime() - new Date(oldestAt).getTime(),
              )
            : 0;
    };
    const queuedAndRunning =
        number(jobs?.awaitingUploadDepth) +
        number(jobs?.queuedDepth) +
        number(jobs?.runningDepth);

    return {
        schemaVersion: 1,
        windowSeconds: number(windowMs / 1000),
        queueAwaitingUploadDepth: number(jobs?.awaitingUploadDepth),
        queueQueuedDepth: number(jobs?.queuedDepth),
        queueRunningDepth: number(jobs?.runningDepth),
        queueRetryDepth: number(jobs?.retryDepth),
        queueOldestRunnableAgeMs: number(jobs?.oldestRunnableAgeMs),
        queueSingleCardDepth: number(
            queueFor(dictionaryGenerationFormat)?.depth,
        ),
        queuePastedTermsDepth: number(
            queueFor(dictionaryPastedTermsGenerationFormat)?.depth,
        ),
        queueDocumentTermsDepth: number(
            queueFor(dictionaryDocumentGenerationFormat)?.depth,
        ),
        queueImportPairsDepth: number(
            queueFor(dictionaryImportPairsGenerationFormat)?.depth,
        ),
        queueCardAuthoringDepth:
            number(queueFor(dictionaryCardAuthoringGenerationFormatV1)?.depth) +
            number(queueFor(dictionaryCardAuthoringGenerationFormat)?.depth),
        queueSingleCardOldestAgeMs: queueAge(dictionaryGenerationFormat),
        queuePastedTermsOldestAgeMs: queueAge(
            dictionaryPastedTermsGenerationFormat,
        ),
        queueDocumentTermsOldestAgeMs: queueAge(
            dictionaryDocumentGenerationFormat,
        ),
        queueImportPairsOldestAgeMs: queueAge(
            dictionaryImportPairsGenerationFormat,
        ),
        queueCardAuthoringOldestAgeMs: Math.max(
            queueAge(dictionaryCardAuthoringGenerationFormatV1),
            queueAge(dictionaryCardAuthoringGenerationFormat),
        ),
        expiredRunningLeaseDepth: number(jobs?.expiredRunningLeases),
        generationQueueCapacityRemaining: Math.max(
            0,
            generationLimits.globalQueued - queuedAndRunning,
        ),
        ownersAtGenerationQueueCapacity: number(jobs?.ownersAtCapacity),
        outcomeCompletedCount: number(terminalJobs?.completedCount),
        outcomeFailedCount: number(terminalJobs?.failedCount),
        outcomeCancelledCount: number(terminalJobs?.cancelledCount),
        outcomeExpiredCount: number(terminalJobs?.expiredCount),
        reviewAcceptedCount: number(reviews?.accepted),
        reviewDiscardedCount: number(reviews?.discarded),
        reviewExpiredCount: number(reviews?.expired),
        processingAverageDurationMs: number(terminalJobs?.averageDurationMs),
        processingMaximumDurationMs: number(terminalJobs?.maximumDurationMs),
        retryAttemptCount: number(terminalJobs?.retryAttempts),
        failureInvalidModelOutputCount: number(
            terminalJobs?.invalidModelOutputFailures,
        ),
        failureProviderUnavailableCount: number(
            terminalJobs?.providerUnavailableFailures,
        ),
        failureProviderTimeoutCount: number(
            terminalJobs?.providerTimeoutFailures,
        ),
        failureProviderRateLimitedCount: number(
            terminalJobs?.providerRateLimitedFailures,
        ),
        failureMalwareDetectedCount: number(terminalJobs?.malwareFailures),
        failureScanCount: number(terminalJobs?.scanFailures),
        failureInvalidDocumentCount: number(
            terminalJobs?.invalidDocumentFailures,
        ),
        failureExtractionCount: number(terminalJobs?.extractionFailures),
        failureNoTermsFoundCount: number(terminalJobs?.noTermsFoundFailures),
        failureTooManyTermsCount: number(terminalJobs?.tooManyTermsFailures),
        settledProviderReservationAttemptCount: number(
            providerSettlements?.attempts,
        ),
        providerActiveReservationCount: number(
            jobs?.providerActiveReservations,
        ),
        providerActiveCapacityRemaining: Math.max(
            0,
            providerOperationalBudget.globalActiveAttempts -
                number(jobs?.providerActiveReservations),
        ),
        providerCircuitOpenCount: number(circuits?.openCount),
        providerCircuitFailureCount: number(circuits?.failureCount),
        providerReservedInputTokenCount: number(
            jobs?.providerReservedInputTokens,
        ),
        providerReservedOutputTokenCount: number(
            jobs?.providerReservedOutputTokens,
        ),
        providerReservedCostMicros: number(jobs?.providerReservedCostMicros),
        settledProviderBudgetInputTokenCount: number(
            providerSettlements?.inputTokens,
        ),
        settledProviderBudgetOutputTokenCount: number(
            providerSettlements?.outputTokens,
        ),
        settledProviderBudgetCostMicros: number(
            providerSettlements?.costMicros,
        ),
        scannerFailureCount: number(documents?.scannerFailures),
        ocrFailureCount: number(terminalJobs?.ocrFailures),
        uploadAuthorizationCount: number(documents?.authorizations),
        uploadCompletionCount: number(documents?.completions),
        uploadAuthorizedByteCount: number(documents?.authorizedBytes),
        uploadSmallSizeCount: number(documents?.smallUploads),
        uploadMediumSizeCount: number(documents?.mediumUploads),
        uploadLargeSizeCount: number(documents?.largeUploads),
        uploadPendingPhysicalByteCount: number(documents?.pendingPhysicalBytes),
        scanCompletionCount: number(documents?.scanCompletions),
        scanAverageDurationMs: number(documents?.scanAverageDurationMs),
        scanCleanCount: number(documents?.scanClean),
        scanInfectedCount: number(documents?.scanInfected),
        scanUnavailableCount: number(documents?.scanUnavailable),
        scanTimeoutCount: number(documents?.scanTimeout),
        scanLimitExceededCount: number(documents?.scanLimitExceeded),
        scanInvalidResponseCount: number(documents?.scanInvalidResponse),
        scanStaleSignatureCount: number(documents?.scanStaleSignature),
        parserFailureCount:
            number(terminalJobs?.invalidDocumentFailures) +
            number(terminalJobs?.extractionFailures),
        scannerLatestSignatureAgeMs: latestScan?.signatureUpdatedAt
            ? Math.max(
                  0,
                  input.context.now.getTime() -
                      latestScan.signatureUpdatedAt.getTime(),
              )
            : 0,
        cleanupPendingDepth: number(documents?.cleanupPending),
        cleanupRunningDepth: number(documents?.cleanupRunning),
        cleanupWaitingCapabilityExpiryDepth: number(documents?.cleanupWaiting),
        cleanupFailureDepth: number(documents?.cleanupFailures),
        cleanupOldestLagMs: number(documents?.cleanupOldestLagMs),
        cleanupRetryAttemptCount: number(documents?.cleanupRetries),
        cleanupLagBreachDepth: number(documents?.cleanupLagBreaches),
    };
}
