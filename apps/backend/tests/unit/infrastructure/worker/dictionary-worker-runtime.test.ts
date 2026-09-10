import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryWorkerRuntime } from '../../../../src/infrastructure/worker/dictionary-worker-runtime';

const operationalMeasurement = {
    schemaVersion: 1 as const,
    windowSeconds: 60,
    queueAwaitingUploadDepth: 1,
    queueQueuedDepth: 2,
    queueRunningDepth: 3,
    queueRetryDepth: 4,
    queueOldestRunnableAgeMs: 5,
    queueCardAuthoringDepth: 75,
    queueSingleCardDepth: 6,
    queuePastedTermsDepth: 7,
    queueDocumentTermsDepth: 8,
    queueImportPairsDepth: 9,
    queueCardAuthoringOldestAgeMs: 76,
    queueSingleCardOldestAgeMs: 10,
    queuePastedTermsOldestAgeMs: 11,
    queueDocumentTermsOldestAgeMs: 12,
    queueImportPairsOldestAgeMs: 13,
    expiredRunningLeaseDepth: 14,
    generationQueueCapacityRemaining: 15,
    ownersAtGenerationQueueCapacity: 16,
    outcomeCompletedCount: 17,
    outcomeFailedCount: 18,
    outcomeCancelledCount: 19,
    outcomeExpiredCount: 20,
    reviewAcceptedCount: 21,
    reviewDiscardedCount: 22,
    reviewExpiredCount: 23,
    processingAverageDurationMs: 24,
    processingMaximumDurationMs: 25,
    retryAttemptCount: 26,
    failureInvalidModelOutputCount: 27,
    failureProviderUnavailableCount: 28,
    failureProviderTimeoutCount: 29,
    failureProviderRateLimitedCount: 30,
    failureMalwareDetectedCount: 31,
    failureScanCount: 32,
    failureInvalidDocumentCount: 33,
    failureExtractionCount: 34,
    failureNoTermsFoundCount: 35,
    failureTooManyTermsCount: 36,
    settledProviderReservationAttemptCount: 37,
    providerActiveReservationCount: 38,
    providerActiveCapacityRemaining: 39,
    providerCircuitOpenCount: 40,
    providerCircuitFailureCount: 41,
    providerReservedInputTokenCount: 42,
    providerReservedOutputTokenCount: 43,
    providerReservedCostMicros: 44,
    settledProviderBudgetInputTokenCount: 45,
    settledProviderBudgetOutputTokenCount: 46,
    settledProviderBudgetCostMicros: 47,
    scannerFailureCount: 48,
    ocrFailureCount: 49,
    uploadAuthorizationCount: 50,
    uploadCompletionCount: 51,
    uploadAuthorizedByteCount: 52,
    uploadSmallSizeCount: 53,
    uploadMediumSizeCount: 54,
    uploadLargeSizeCount: 55,
    uploadPendingPhysicalByteCount: 56,
    scanCompletionCount: 57,
    scanAverageDurationMs: 58,
    scanCleanCount: 59,
    scanInfectedCount: 60,
    scanUnavailableCount: 61,
    scanTimeoutCount: 62,
    scanLimitExceededCount: 63,
    scanInvalidResponseCount: 64,
    scanStaleSignatureCount: 65,
    parserFailureCount: 66,
    scannerLatestSignatureAgeMs: 67,
    cleanupPendingDepth: 68,
    cleanupRunningDepth: 69,
    cleanupWaitingCapabilityExpiryDepth: 70,
    cleanupFailureDepth: 71,
    cleanupOldestLagMs: 72,
    cleanupRetryAttemptCount: 73,
    cleanupLagBreachDepth: 74,
};

describe('DictionaryWorkerRuntime', () => {
    afterEach(() => vi.useRealTimers());

    it('clears losing drain and release timeouts after a fast idle shutdown', async () => {
        vi.useFakeTimers();
        let entered: (() => void) | undefined;
        const polling = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const service = {
            readiness: vi.fn(async () => undefined),
            processNext: vi.fn(async () => {
                entered?.();
                return false;
            }),
            releaseWorkerLeases: vi.fn(async () => undefined),
        };
        const runtime = new DictionaryWorkerRuntime({
            concurrency: 1,
            drainTimeoutMs: 295_000,
            logger: { error: vi.fn(), info: vi.fn() },
            pollIntervalMs: 60_000,
            readinessTimeoutMs: 30_000,
            service,
            supportedFormats: ['single-card:v1'],
            workerId: 'worker-fast-shutdown',
        });

        const running = runtime.run();
        await polling;
        await expect(runtime.shutdown('SIGINT')).resolves.toEqual({
            forced: false,
        });
        await running;

        expect(service.releaseWorkerLeases).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('owns bounded concurrency and stops leasing before releasing worker leases', async () => {
        const entered: AbortSignal[] = [];
        let resolveEntered: (() => void) | undefined;
        const allEntered = new Promise<void>((resolve) => {
            resolveEntered = resolve;
        });
        const service = {
            readiness: vi.fn(async () => undefined),
            processNext: vi.fn(async ({ signal }: { signal: AbortSignal }) => {
                entered.push(signal);
                if (entered.length === 2) resolveEntered?.();
                await new Promise<void>((resolve) =>
                    signal.addEventListener('abort', () => resolve(), {
                        once: true,
                    }),
                );
                return false;
            }),
            releaseWorkerLeases: vi.fn(async () => undefined),
        };
        const runtime = new DictionaryWorkerRuntime({
            concurrency: 2,
            drainTimeoutMs: 1_000,
            logger: { error: vi.fn(), info: vi.fn() },
            pollIntervalMs: 50,
            readinessTimeoutMs: 1_000,
            service,
            supportedFormats: ['single-card:v1'],
            workerId: 'worker-one',
        });

        const running = runtime.run();
        await allEntered;
        const outcome = await runtime.shutdown('SIGTERM');
        await running;

        expect(outcome).toEqual({ forced: false });
        expect(service.processNext).toHaveBeenCalledTimes(2);
        expect(entered.every((signal) => signal.aborted)).toBe(true);
        expect(service.releaseWorkerLeases).toHaveBeenCalledWith({
            workerId: 'worker-one',
        });
    });

    it('bounds drain when an application call ignores cancellation', async () => {
        let entered: (() => void) | undefined;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const service = {
            readiness: vi.fn(async () => undefined),
            processNext: vi.fn(async () => {
                entered?.();
                await new Promise(() => undefined);
                return false;
            }),
            releaseWorkerLeases: vi.fn(async () => undefined),
        };
        const runtime = new DictionaryWorkerRuntime({
            concurrency: 1,
            drainTimeoutMs: 10,
            logger: { error: vi.fn(), info: vi.fn() },
            pollIntervalMs: 50,
            readinessTimeoutMs: 1_000,
            service,
            supportedFormats: ['single-card:v1'],
            workerId: 'worker-two',
        });

        const running = runtime.run();
        await started;
        await expect(runtime.shutdown('SIGINT')).resolves.toEqual({
            forced: true,
        });
        await running;
        expect(service.releaseWorkerLeases).toHaveBeenCalledOnce();
    });

    it('fails readiness on a bounded timeout', async () => {
        const runtime = new DictionaryWorkerRuntime({
            concurrency: 1,
            drainTimeoutMs: 1_000,
            logger: { error: vi.fn(), info: vi.fn() },
            pollIntervalMs: 50,
            readinessTimeoutMs: 10,
            service: {
                readiness: async () => await new Promise(() => undefined),
                processNext: async () => false,
                releaseWorkerLeases: async () => undefined,
            },
            supportedFormats: [],
            workerId: 'worker-three',
        });

        await expect(runtime.readiness()).rejects.toThrow(/timed out/);
    });

    it('includes provider readiness in health while startup uses baseline readiness for cleanup', async () => {
        const readiness = vi.fn(async () => undefined);
        const runtime = new DictionaryWorkerRuntime({
            concurrency: 1,
            drainTimeoutMs: 1_000,
            includeProviderReadiness: true,
            logger: { error: vi.fn(), info: vi.fn() },
            pollIntervalMs: 50,
            readinessTimeoutMs: 1_000,
            service: {
                readiness,
                processNext: async () => false,
                releaseWorkerLeases: async () => undefined,
            },
            supportedFormats: ['single-card:v1'],
            workerId: 'worker-activated',
        });

        await runtime.readiness();

        expect(readiness).toHaveBeenCalledWith(expect.any(AbortSignal), {
            includeProvider: true,
        });
    });

    it('starts cleanup polling when provider health is unavailable', async () => {
        let processed: (() => void) | undefined;
        const firstPoll = new Promise<void>((resolve) => {
            processed = resolve;
        });
        const readiness = vi.fn(
            async (
                _signal: AbortSignal,
                options?: { includeProvider?: boolean },
            ) => {
                if (options?.includeProvider)
                    throw new Error('provider unavailable');
            },
        );
        const processNext = vi.fn(async () => {
            processed?.();
            return false;
        });
        const runtime = new DictionaryWorkerRuntime({
            concurrency: 1,
            drainTimeoutMs: 1_000,
            includeProviderReadiness: true,
            logger: { error: vi.fn(), info: vi.fn() },
            pollIntervalMs: 60_000,
            readinessTimeoutMs: 1_000,
            service: {
                readiness,
                processNext,
                releaseWorkerLeases: async () => undefined,
            },
            supportedFormats: ['document-terms:v1'],
            workerId: 'worker-cleanup-during-provider-outage',
        });

        await expect(runtime.readiness()).rejects.toThrow(
            'provider unavailable',
        );
        const running = runtime.run();
        await firstPoll;
        await runtime.shutdown('test');
        await running;

        expect(processNext).toHaveBeenCalled();
        expect(readiness).toHaveBeenCalledWith(expect.any(AbortSignal), {
            includeProvider: false,
        });
    });

    it('never logs raw application or provider errors', async () => {
        const logger = { error: vi.fn(), info: vi.fn() };
        let calls = 0;
        const runtime = new DictionaryWorkerRuntime({
            concurrency: 1,
            drainTimeoutMs: 1_000,
            logger,
            pollIntervalMs: 50,
            readinessTimeoutMs: 1_000,
            service: {
                readiness: async () => undefined,
                processNext: async ({ signal }) => {
                    calls += 1;
                    if (calls === 1) {
                        throw new Error(
                            'private card text and provider payload',
                        );
                    }
                    await new Promise<void>((resolve) =>
                        signal.addEventListener('abort', () => resolve(), {
                            once: true,
                        }),
                    );
                    return false;
                },
                releaseWorkerLeases: async () => undefined,
            },
            supportedFormats: [],
            workerId: 'worker-four',
        });

        const running = runtime.run();
        while (calls < 2) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await runtime.shutdown('test');
        await running;

        expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
            'private card text',
        );
        expect(logger.error).toHaveBeenCalledWith(
            'Dictionary worker loop 0 failed; polling will retry.',
        );
    });

    it('periodically logs only the fixed sanitized operational fields', async () => {
        let resolveMeasured!: () => void;
        const measured = new Promise<void>((resolve) => {
            resolveMeasured = resolve;
        });
        const logger = {
            error: vi.fn(),
            info: vi.fn((message: string) => {
                if (message === 'Dictionary worker operational measurement.')
                    resolveMeasured();
            }),
        };
        const runtime = new DictionaryWorkerRuntime({
            concurrency: 1,
            drainTimeoutMs: 1_000,
            logger,
            operationalObservationIntervalMs: 10_000,
            pollIntervalMs: 50,
            readinessTimeoutMs: 1_000,
            service: {
                observeOperationalState: async () =>
                    ({
                        ...operationalMeasurement,
                        rawContent: 'private card text and object key',
                    }) as typeof operationalMeasurement,
                readiness: async () => undefined,
                processNext: async ({ signal }) => {
                    await new Promise<void>((resolve) =>
                        signal.addEventListener('abort', () => resolve(), {
                            once: true,
                        }),
                    );
                    return false;
                },
                releaseWorkerLeases: async () => undefined,
            },
            supportedFormats: ['single-card:v1'],
            workerId: 'worker-observation',
        });

        const running = runtime.run();
        await measured;
        await runtime.shutdown('test');
        await running;

        expect(logger.info).toHaveBeenCalledWith(
            'Dictionary worker operational measurement.',
            operationalMeasurement,
        );
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
            'private card text',
        );
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
            'object key',
        );
    });
});
