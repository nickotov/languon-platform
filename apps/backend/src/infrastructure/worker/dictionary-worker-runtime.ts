import type { DictionaryOperationalMeasurement } from '../../modules/dictionaries/application/ports/dictionary-generation-store';

export interface DictionaryWorkerApplicationService {
    observeOperationalState?(input: {
        signal: AbortSignal;
        windowMs: number;
    }): Promise<DictionaryOperationalMeasurement>;
    processNext(input: {
        signal: AbortSignal;
        supportedFormats: readonly string[];
        workerId: string;
    }): Promise<boolean>;
    readiness(
        signal: AbortSignal,
        options?: { includeProvider?: boolean },
    ): Promise<void>;
    releaseWorkerLeases(input: { workerId: string }): Promise<void>;
}

export interface DictionaryWorkerLogger {
    error(message: string, fields?: DictionaryWorkerOperationalLogFields): void;
    info(message: string, fields?: DictionaryWorkerOperationalLogFields): void;
}

export type DictionaryWorkerOperationalLogFields =
    Readonly<DictionaryOperationalMeasurement>;

export interface DictionaryWorkerRuntimeOptions {
    concurrency: number;
    drainTimeoutMs: number;
    includeProviderReadiness?: boolean;
    operationalObservationIntervalMs?: number;
    pollIntervalMs: number;
    readinessTimeoutMs: number;
    service: DictionaryWorkerApplicationService;
    supportedFormats: readonly string[];
    workerId: string;
    logger?: DictionaryWorkerLogger;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }
        const finish = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', finish);
            resolve();
        };
        const timer = setTimeout(finish, milliseconds);
        signal?.addEventListener('abort', finish, { once: true });
    });
}

function settlesBeforeTimeout(
    operation: Promise<unknown>,
    timeoutMs: number,
): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        operation.then(
            () => {
                clearTimeout(timer);
                resolve(true);
            },
            () => {
                clearTimeout(timer);
                resolve(false);
            },
        );
    });
}

async function withTimeout(
    timeoutMs: number,
    externalSignal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        await Promise.race([
            operation(controller.signal),
            new Promise<never>((_, reject) => {
                controller.signal.addEventListener(
                    'abort',
                    () =>
                        reject(new Error('Worker readiness probe timed out.')),
                    { once: true },
                );
            }),
        ]);
    } finally {
        clearTimeout(timeout);
        externalSignal.removeEventListener('abort', abort);
    }
}

export class DictionaryWorkerRuntime {
    readonly #controller = new AbortController();
    readonly #logger: DictionaryWorkerLogger;
    readonly #options: DictionaryWorkerRuntimeOptions;
    #loops: Promise<void>[] = [];
    #operationalLoop?: Promise<void>;
    readonly #operationalObservationIntervalMs: number;
    readonly #shutdownComplete: Promise<void>;
    readonly #resolveShutdownComplete: () => void;
    #shutdownPromise?: Promise<{ forced: boolean }>;

    constructor(options: DictionaryWorkerRuntimeOptions) {
        this.#options = options;
        this.#logger = options.logger ?? console;
        this.#operationalObservationIntervalMs =
            options.operationalObservationIntervalMs ?? 60_000;
        if (
            this.#operationalObservationIntervalMs < 10_000 ||
            this.#operationalObservationIntervalMs > 300_000
        )
            throw new Error(
                'Dictionary worker operational observation interval is invalid.',
            );
        let resolveShutdownComplete: () => void = () => undefined;
        this.#shutdownComplete = new Promise<void>((resolve) => {
            resolveShutdownComplete = resolve;
        });
        this.#resolveShutdownComplete = resolveShutdownComplete;
    }

    async readiness(): Promise<void> {
        await this.#readiness(this.#options.includeProviderReadiness ?? false);
    }

    async #readiness(includeProvider: boolean): Promise<void> {
        await withTimeout(
            this.#options.readinessTimeoutMs,
            this.#controller.signal,
            (signal) =>
                this.#options.service.readiness(signal, {
                    includeProvider,
                }),
        );
    }

    async run(): Promise<void> {
        try {
            await this.#readiness(false);
        } catch (error) {
            if (this.#controller.signal.aborted) {
                await this.#shutdownComplete;
                return;
            }
            throw error;
        }
        if (this.#controller.signal.aborted) {
            await this.#shutdownComplete;
            return;
        }
        this.#logger.info(
            `Dictionary worker ${this.#options.workerId} ready with concurrency ${this.#options.concurrency}.`,
        );
        this.#loops = Array.from(
            { length: this.#options.concurrency },
            (_, index) => this.#poll(index),
        );
        const operationalLoop = this.#options.service.observeOperationalState
            ? this.#observeOperationalState()
            : undefined;
        if (operationalLoop) this.#operationalLoop = operationalLoop;
        await Promise.race([
            Promise.allSettled([
                ...this.#loops,
                ...(operationalLoop ? [operationalLoop] : []),
            ]).then(() => undefined),
            this.#shutdownComplete,
        ]);
    }

    async shutdown(signal: string): Promise<{ forced: boolean }> {
        if (this.#shutdownPromise) return this.#shutdownPromise;
        this.#shutdownPromise = this.#performShutdown(signal);
        return this.#shutdownPromise;
    }

    async #performShutdown(signal: string): Promise<{ forced: boolean }> {
        this.#logger.info(
            `Dictionary worker ${this.#options.workerId} stopping after ${signal}.`,
        );
        this.#controller.abort();
        let forced = false;
        if (this.#loops.length || this.#operationalLoop) {
            forced = !(await settlesBeforeTimeout(
                Promise.allSettled([
                    ...this.#loops,
                    ...(this.#operationalLoop ? [this.#operationalLoop] : []),
                ]),
                this.#options.drainTimeoutMs,
            ));
        }
        const released = await settlesBeforeTimeout(
            this.#options.service.releaseWorkerLeases({
                workerId: this.#options.workerId,
            }),
            this.#options.readinessTimeoutMs,
        );
        if (!released) {
            forced = true;
            this.#logger.error(
                'Dictionary worker could not confirm lease release before shutdown.',
            );
        }
        this.#resolveShutdownComplete();
        return { forced };
    }

    async #poll(index: number): Promise<void> {
        const signal = this.#controller.signal;
        while (!signal.aborted) {
            try {
                const processed = await this.#options.service.processNext({
                    signal,
                    supportedFormats: this.#options.supportedFormats,
                    workerId: this.#options.workerId,
                });
                if (!processed && !signal.aborted) {
                    await delay(this.#options.pollIntervalMs, signal);
                }
            } catch {
                if (signal.aborted) break;
                this.#logger.error(
                    `Dictionary worker loop ${index} failed; polling will retry.`,
                );
                await delay(this.#options.pollIntervalMs, signal);
            }
        }
    }

    async #observeOperationalState(): Promise<void> {
        const signal = this.#controller.signal;
        while (!signal.aborted) {
            try {
                const measurement = await this.#options.service
                    .observeOperationalState!({
                    signal,
                    windowMs: this.#operationalObservationIntervalMs,
                });
                if (signal.aborted) return;
                this.#logger.info(
                    'Dictionary worker operational measurement.',
                    sanitizeOperationalMeasurement(measurement),
                );
            } catch {
                if (signal.aborted) return;
                this.#logger.error(
                    'Dictionary worker operational measurement failed; observation will retry.',
                );
            }
            await delay(this.#operationalObservationIntervalMs, signal);
        }
    }
}

function sanitizeOperationalMeasurement(
    measurement: DictionaryOperationalMeasurement,
): DictionaryWorkerOperationalLogFields {
    return {
        schemaVersion: 1,
        windowSeconds: measurement.windowSeconds,
        queueAwaitingUploadDepth: measurement.queueAwaitingUploadDepth,
        queueQueuedDepth: measurement.queueQueuedDepth,
        queueRunningDepth: measurement.queueRunningDepth,
        queueRetryDepth: measurement.queueRetryDepth,
        queueOldestRunnableAgeMs: measurement.queueOldestRunnableAgeMs,
        queueSingleCardDepth: measurement.queueSingleCardDepth,
        queuePastedTermsDepth: measurement.queuePastedTermsDepth,
        queueDocumentTermsDepth: measurement.queueDocumentTermsDepth,
        queueImportPairsDepth: measurement.queueImportPairsDepth,
        queueSingleCardOldestAgeMs: measurement.queueSingleCardOldestAgeMs,
        queuePastedTermsOldestAgeMs: measurement.queuePastedTermsOldestAgeMs,
        queueDocumentTermsOldestAgeMs:
            measurement.queueDocumentTermsOldestAgeMs,
        queueImportPairsOldestAgeMs: measurement.queueImportPairsOldestAgeMs,
        expiredRunningLeaseDepth: measurement.expiredRunningLeaseDepth,
        generationQueueCapacityRemaining:
            measurement.generationQueueCapacityRemaining,
        ownersAtGenerationQueueCapacity:
            measurement.ownersAtGenerationQueueCapacity,
        outcomeCompletedCount: measurement.outcomeCompletedCount,
        outcomeFailedCount: measurement.outcomeFailedCount,
        outcomeCancelledCount: measurement.outcomeCancelledCount,
        outcomeExpiredCount: measurement.outcomeExpiredCount,
        reviewAcceptedCount: measurement.reviewAcceptedCount,
        reviewDiscardedCount: measurement.reviewDiscardedCount,
        reviewExpiredCount: measurement.reviewExpiredCount,
        processingAverageDurationMs: measurement.processingAverageDurationMs,
        processingMaximumDurationMs: measurement.processingMaximumDurationMs,
        retryAttemptCount: measurement.retryAttemptCount,
        failureInvalidModelOutputCount:
            measurement.failureInvalidModelOutputCount,
        failureProviderUnavailableCount:
            measurement.failureProviderUnavailableCount,
        failureProviderTimeoutCount: measurement.failureProviderTimeoutCount,
        failureProviderRateLimitedCount:
            measurement.failureProviderRateLimitedCount,
        failureMalwareDetectedCount: measurement.failureMalwareDetectedCount,
        failureScanCount: measurement.failureScanCount,
        failureInvalidDocumentCount: measurement.failureInvalidDocumentCount,
        failureExtractionCount: measurement.failureExtractionCount,
        failureNoTermsFoundCount: measurement.failureNoTermsFoundCount,
        failureTooManyTermsCount: measurement.failureTooManyTermsCount,
        settledProviderReservationAttemptCount:
            measurement.settledProviderReservationAttemptCount,
        providerActiveReservationCount:
            measurement.providerActiveReservationCount,
        providerActiveCapacityRemaining:
            measurement.providerActiveCapacityRemaining,
        providerCircuitOpenCount: measurement.providerCircuitOpenCount,
        providerCircuitFailureCount: measurement.providerCircuitFailureCount,
        providerReservedInputTokenCount:
            measurement.providerReservedInputTokenCount,
        providerReservedOutputTokenCount:
            measurement.providerReservedOutputTokenCount,
        providerReservedCostMicros: measurement.providerReservedCostMicros,
        settledProviderBudgetInputTokenCount:
            measurement.settledProviderBudgetInputTokenCount,
        settledProviderBudgetOutputTokenCount:
            measurement.settledProviderBudgetOutputTokenCount,
        settledProviderBudgetCostMicros:
            measurement.settledProviderBudgetCostMicros,
        scannerFailureCount: measurement.scannerFailureCount,
        ocrFailureCount: measurement.ocrFailureCount,
        uploadAuthorizationCount: measurement.uploadAuthorizationCount,
        uploadCompletionCount: measurement.uploadCompletionCount,
        uploadAuthorizedByteCount: measurement.uploadAuthorizedByteCount,
        uploadSmallSizeCount: measurement.uploadSmallSizeCount,
        uploadMediumSizeCount: measurement.uploadMediumSizeCount,
        uploadLargeSizeCount: measurement.uploadLargeSizeCount,
        uploadPendingPhysicalByteCount:
            measurement.uploadPendingPhysicalByteCount,
        scanCompletionCount: measurement.scanCompletionCount,
        scanAverageDurationMs: measurement.scanAverageDurationMs,
        scanCleanCount: measurement.scanCleanCount,
        scanInfectedCount: measurement.scanInfectedCount,
        scanUnavailableCount: measurement.scanUnavailableCount,
        scanTimeoutCount: measurement.scanTimeoutCount,
        scanLimitExceededCount: measurement.scanLimitExceededCount,
        scanInvalidResponseCount: measurement.scanInvalidResponseCount,
        scanStaleSignatureCount: measurement.scanStaleSignatureCount,
        parserFailureCount: measurement.parserFailureCount,
        scannerLatestSignatureAgeMs: measurement.scannerLatestSignatureAgeMs,
        cleanupPendingDepth: measurement.cleanupPendingDepth,
        cleanupRunningDepth: measurement.cleanupRunningDepth,
        cleanupWaitingCapabilityExpiryDepth:
            measurement.cleanupWaitingCapabilityExpiryDepth,
        cleanupFailureDepth: measurement.cleanupFailureDepth,
        cleanupOldestLagMs: measurement.cleanupOldestLagMs,
        cleanupRetryAttemptCount: measurement.cleanupRetryAttemptCount,
        cleanupLagBreachDepth: measurement.cleanupLagBreachDepth,
    };
}
