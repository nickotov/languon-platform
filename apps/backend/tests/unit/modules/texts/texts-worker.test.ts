import { describe, it, expect, vi } from 'vitest';
import { TextsWorkerService } from '../../../../src/modules/texts/application/texts-worker-service';
import type {
    TextsWorkerStore,
    ClaimedTextsJob,
} from '../../../../src/modules/texts/application/ports/texts-job-store';
import type { TextsAiProvider } from '../../../../src/modules/texts/application/ports/texts-ai-provider';
import { segmentText } from '../../../../src/modules/texts/domain/text';
import { randomUUID } from 'node:crypto';
const now = new Date('2026-10-15T00:00:00Z');
function fixture() {
    const sourceText = 'Hello world.\nThis is a second sentence.';
    const input = {
        kind: 'text-translation' as const,
        folderId: randomUUID(),
        operationId: randomUUID(),
        sourceText,
        sourceLanguage: 'en' as const,
        targetLanguage: 'es' as const,
        segments: segmentText(sourceText, 'en', randomUUID),
    };
    const job: ClaimedTextsJob = {
        lease: {
            jobId: randomUUID(),
            workerId: 'texts-test',
            fencingToken: '4',
            attempt: 1,
        },
        input,
        execution: {
            adapterRevision: 'openai-compatible:v1',
            aggregateBudget: {
                inputCostMicrosPerMillionTokens: 1,
                outputCostMicrosPerMillionTokens: 1,
                maxCostMicrosPerAttempt: 100,
                maxInputTokensPerAttempt: 65536,
                maxOutputTokensPerAttempt: 32000,
            },
            credentialReference: 'DEEPSEEK_API_KEY',
            enabledModelIds: ['deepseek-flash'],
            modelId: 'deepseek-flash',
            perCallMaxInputTokens: 65536,
            perCallMaxOutputTokens: 32000,
            providerId: 'deepseek',
            supportedFormats: ['text-translation:v1', 'text-detection:v1'],
        },
        budget: {
            inputCostMicrosPerMillionTokens: 1,
            outputCostMicrosPerMillionTokens: 1,
            maxCostMicrosPerAttempt: 100,
            maxInputTokensPerAttempt: 65536,
            maxOutputTokensPerAttempt: 32000,
        },
        providerIdempotencyKey: 'test-key',
    };
    const store: TextsWorkerStore = {
        claimNext: vi.fn(async () => job),
        heartbeat: vi.fn(async () => ({
            owned: true,
            cancellationRequested: false,
        })),
        markDispatched: vi.fn(async () => true),
        complete: vi.fn(async () => true),
        fail: vi.fn(async () => true),
        releaseWorkerLeases: vi.fn(async () => {}),
    };
    const provider: TextsAiProvider = {
        run: vi.fn(async () => ({
            draft: {
                translation: input.segments.map((s) => ({
                    pairId: s.pairId,
                    text: `ES: ${s.text}`,
                })),
            },
            usage: { inputTokens: 100, outputTokens: 100 },
        })),
    };
    const worker = new TextsWorkerService({
        store,
        provider,
        clock: { now: () => now },
        workerId: 'texts-test',
        leaseMs: 1000,
        heartbeatMs: 100,
        timeoutMs: 500,
        globalConcurrency: 2,
        userConcurrency: 1,
        maxAttempts: 3,
        retryDelayMs: 50,
        supportedFormats: ['text-translation:v1', 'text-detection:v1'],
    });
    return { job, store, provider, worker };
}
describe('Texts worker', () => {
    it('publishes a proposal preserving exact source and ordered linked IDs', async () => {
        const { job, store, provider, worker } = fixture();
        await expect(
            worker.processNext(new AbortController().signal),
        ).resolves.toBe(true);
        expect(provider.run).toHaveBeenCalledWith(
            expect.objectContaining({
                input: job.input,
                idempotencyKey: 'test-key',
            }),
        );
        expect(store.complete).toHaveBeenCalledWith(
            job.lease,
            expect.objectContaining({
                id: job.lease.jobId,
                sourceText: job.input.sourceText,
                alignment: expect.objectContaining({
                    source:
                        job.input.kind === 'text-translation'
                            ? job.input.segments
                            : [],
                    editedPairIds: [],
                }),
            }),
            { inputTokens: 100, outputTokens: 100 },
            expect.anything(),
        );
        expect(store.fail).not.toHaveBeenCalled();
    });
    it('rejects missing or reordered translation segments and retains measured usage', async () => {
        const { store, provider, worker } = fixture();
        vi.mocked(provider.run).mockResolvedValue({
            draft: { translation: [] },
            usage: { inputTokens: 60, outputTokens: 2 },
        });
        await worker.processNext(new AbortController().signal);
        expect(store.complete).not.toHaveBeenCalled();
        expect(store.fail).toHaveBeenCalledWith(
            expect.anything(),
            {
                code: 'invalid_model_output',
                usage: { inputTokens: 60, outputTokens: 2 },
                retryAt: new Date(now.getTime() + 50),
            },
            expect.anything(),
        );
    });
    it('does not dispatch provider after losing its lease', async () => {
        const { store, provider, worker } = fixture();
        vi.mocked(store.markDispatched).mockResolvedValue(false);
        await worker.processNext(new AbortController().signal);
        expect(provider.run).not.toHaveBeenCalled();
        expect(store.complete).not.toHaveBeenCalled();
    });
    it('shutdown leaves a recoverable lease and publishes no proposal', async () => {
        const { store, provider, worker } = fixture();
        const abort = new AbortController();
        vi.mocked(provider.run).mockImplementation(async () => {
            abort.abort();
            throw new Error('shutdown');
        });
        await worker.processNext(abort.signal);
        expect(store.complete).not.toHaveBeenCalled();
        expect(store.fail).not.toHaveBeenCalled();
    });
    it('stops retrying at the bounded attempt limit', async () => {
        const { job, store, provider, worker } = fixture();
        job.lease.attempt = 3;
        vi.mocked(provider.run).mockRejectedValue(
            new Error('upstream body must never escape'),
        );
        await worker.processNext(new AbortController().signal);
        expect(store.fail).toHaveBeenCalledWith(
            job.lease,
            { code: 'provider_unavailable', retryAt: null },
            expect.anything(),
        );
    });
    it('detects unknown languages without inventing a catalog language', async () => {
        const { job, store, provider, worker } = fixture();
        job.input = {
            kind: 'text-detection',
            folderId: randomUUID(),
            operationId: randomUUID(),
            sourceText: '123 456',
        };
        vi.mocked(provider.run).mockResolvedValue({
            draft: { language: null, confidence: 'unknown' },
        });
        await worker.processNext(new AbortController().signal);
        expect(store.complete).toHaveBeenCalledWith(
            job.lease,
            { language: null, confidence: 'unknown' },
            undefined,
            expect.anything(),
        );
    });
    it('validates advisory detection output before publishing', async () => {
        const { job, store, provider, worker } = fixture();
        job.input = {
            kind: 'text-detection',
            folderId: randomUUID(),
            operationId: randomUUID(),
            sourceText: 'Unclear',
        };
        vi.mocked(provider.run).mockResolvedValue({
            draft: { language: null, confidence: 'high' },
        });
        await worker.processNext(new AbortController().signal);
        expect(store.complete).not.toHaveBeenCalled();
        expect(store.fail).toHaveBeenCalledWith(
            job.lease,
            expect.objectContaining({ code: 'invalid_model_output' }),
            expect.anything(),
        );
    });
    it('bounds a provider that ignores abort and schedules a timeout retry', async () => {
        vi.useFakeTimers();
        try {
            const { store, provider, worker } = fixture();
            vi.mocked(provider.run).mockImplementation(
                () => new Promise(() => {}),
            );
            const processing = worker.processNext(new AbortController().signal);
            await vi.advanceTimersByTimeAsync(501);
            await processing;
            expect(store.complete).not.toHaveBeenCalled();
            expect(store.fail).toHaveBeenCalledWith(
                expect.anything(),
                {
                    code: 'provider_timeout',
                    retryAt: new Date(now.getTime() + 50),
                },
                expect.anything(),
            );
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
    it('aborts ongoing work when heartbeat observes cancellation without retrying', async () => {
        vi.useFakeTimers();
        try {
            const { store, provider, worker } = fixture();
            vi.mocked(provider.run).mockImplementation(
                () => new Promise(() => {}),
            );
            vi.mocked(store.heartbeat).mockResolvedValue({
                owned: true,
                cancellationRequested: true,
            });
            const processing = worker.processNext(new AbortController().signal);
            await vi.advanceTimersByTimeAsync(101);
            await processing;
            expect(store.complete).not.toHaveBeenCalled();
            expect(store.fail).toHaveBeenCalledWith(
                expect.anything(),
                { code: 'provider_timeout', retryAt: null },
                expect.anything(),
            );
        } finally {
            vi.useRealTimers();
        }
    });
});
