import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSentenceWorkerRuntime } from '../../../../src/modules/learning/infrastructure/sentence-worker-runtime';
import { createSentenceAiProvider } from '../../../../src/modules/learning/infrastructure/ai/sentence-ai-provider';
import type {
    ClaimedSentenceJob,
    SentenceWorkerStore,
} from '../../../../src/modules/learning/application/ports/sentence-worker-store';
import { loadDictionaryWorkerEnvironment } from '../../../../src/config/environment';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';

const entryId = '00000000-0000-4000-8000-000000000001';

function fixture(
    timeoutMs?: number,
    providerIndex = 0,
    observerThrows = false,
) {
    const model = textAiModelCatalog[providerIndex]!;
    const onProviderFailure = vi.fn((_event: unknown) => {
        if (observerThrows) throw new Error('Observer failed');
    });
    const job: ClaimedSentenceJob = {
        kind: 'sentence-check',
        format: 'sentence-check:v1',
        lease: {
            jobId: 'job',
            workerId: 'worker',
            attempt: 1,
            fencingToken: 1,
        },
        leaseDeadline: new Date(Date.now() + 30_000),
        providerIdempotencyKey: 'sentence-check:job:1',
        budget: model.aggregateBudget,
        execution: {
            adapterRevision: model.adapterRevision,
            aggregateBudget: model.aggregateBudget,
            credentialReference: model.credentialReference,
            enabledModelIds: [model.id],
            modelId: model.id,
            providerId: model.providerId,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            supportedFormats: ['sentence-check:v1'],
        },
        input: {
            schemaVersion: 1,
            exerciseId: 'exercise',
            sourceText: 'We go today.',
            referenceTranslation: 'Wir gehen heute.',
            sourceLanguage: 'en',
            targetLanguage: 'de',
            targets: [
                {
                    entryId,
                    learningVersion: 1,
                    sourceText: 'go',
                    targetText: 'gehen',
                },
            ],
            answer: 'Wir gehen heute.',
            explanationLanguage: 'en',
            revealedHintIds: [],
        },
    };
    const store = {
        claimNext: vi.fn<SentenceWorkerStore['claimNext']>(async () => job),
        heartbeat: vi.fn<SentenceWorkerStore['heartbeat']>(async () => ({
            owned: true,
            cancellationRequested: false,
        })),
        markDispatched: vi.fn<SentenceWorkerStore['markDispatched']>(
            async () => 'dispatch',
        ),
        completeGeneration: vi.fn<SentenceWorkerStore['completeGeneration']>(
            async () => 'committed',
        ),
        completeCheck: vi.fn<SentenceWorkerStore['completeCheck']>(
            async () => 'committed',
        ),
        fail: vi.fn<SentenceWorkerStore['fail']>(async () => 'committed'),
        releaseWorkerLeases: vi.fn<SentenceWorkerStore['releaseWorkerLeases']>(
            async () => {},
        ),
    };
    let resolveHttp!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
        resolveHttp = resolve;
    });
    let transportSignal: AbortSignal | undefined;
    // Intentionally ignore abort in this external transport. Late SDK results must
    // still be fenced out by the real provider/worker, without a second request.
    const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
        expect(String(url)).toBe(
            model.providerId === 'kie'
                ? 'https://api.kie.ai/gemini-2.5-pro/v1/chat/completions'
                : 'https://api.deepseek.com/chat/completions',
        );
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
            model: model.id,
            max_tokens: model.perCallMaxOutputTokens,
        });
        transportSignal = init?.signal ?? undefined;
        return response;
    });
    vi.stubGlobal('fetch', fetch);
    const service = createSentenceWorkerRuntime({
        store,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        provider: createSentenceAiProvider({
            credentials: {
                DEEPSEEK_API_KEY: 'synthetic-test-key',
                KIE_API_KEY: 'synthetic-kie-key',
            },
            onProviderFailure,
        }),
        clock: { now: () => new Date() },
        workerId: 'worker',
    });
    const controller = new AbortController();
    const run = service.processNext(controller.signal);

    async function started() {
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    }

    async function respond(payload?: object) {
        resolveHttp(
            new Response(
                JSON.stringify(
                    payload ?? {
                        id: 'synthetic-runtime-check',
                        object: 'chat.completion',
                        created: 0,
                        model: model.id,
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: 'assistant',
                                    content: JSON.stringify({
                                        proposedPercentage: 100,
                                        meaning: 'correct',
                                        grammar: 'correct',
                                        targets: {
                                            'target-1': {
                                                status: 'used',
                                                explanation: 'Correct target.',
                                            },
                                        },
                                        issues: [],
                                        improvedTranslation: 'Wir gehen heute.',
                                        explanation: 'Correct.',
                                    }),
                                },
                                finish_reason: 'stop',
                            },
                        ],
                        usage: {
                            prompt_tokens: 100,
                            completion_tokens: 20,
                            total_tokens: 120,
                        },
                    },
                ),
                { headers: { 'Content-Type': 'application/json' } },
            ),
        );
        await vi.advanceTimersByTimeAsync(0);
    }

    return {
        job,
        store,
        service,
        controller,
        run,
        started,
        respond,
        fetch,
        signal: () => transportSignal,
        onProviderFailure,
    };
}

describe('production sentence worker execution deadline', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
        // Node's native AbortSignal.timeout uses native timers outside Vitest's
        // clock. Preserve its behavior while making the full production deadline deterministic.
        vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
            const controller = new AbortController();
            setTimeout(
                () =>
                    controller.abort(
                        new DOMException('Timed out', 'TimeoutError'),
                    ),
                ms,
            );
            return controller.signal;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('publishes a valid check after the old 20-second cutoff while renewing its lease', async () => {
        const f = fixture();
        await f.started();
        await vi.advanceTimersByTimeAsync(25_000);
        expect(f.store.fail).not.toHaveBeenCalled();
        expect(f.signal()?.aborted).toBe(false);
        expect(f.store.heartbeat).toHaveBeenCalledTimes(2);
        expect(f.store.heartbeat).toHaveBeenLastCalledWith(
            f.job.lease,
            30_000,
            expect.any(Object),
        );
        await f.respond();
        await expect(f.run).resolves.toBe(true);
        expect(f.store.completeCheck).toHaveBeenCalledOnce();
        expect(f.store.completeCheck.mock.calls[0]?.[1]).toMatchObject({
            feedback: { percentage: 100 },
            usage: { inputTokens: 100, outputTokens: 20 },
        });
        expect(f.store.fail).not.toHaveBeenCalled();
        expect(f.fetch).toHaveBeenCalledOnce();
    });

    it.each([false, true])(
        'rejects retired Kie before SDK dispatch (observer throws: %s)',
        async (observerThrows) => {
            const f = fixture(undefined, 1, observerThrows);
            await f.run;
            expect(f.store.completeCheck).not.toHaveBeenCalled();
            expect(f.store.fail).toHaveBeenCalledOnce();
            expect(f.store.fail.mock.calls[0]?.[1]).toMatchObject({
                code: 'model_unavailable',
                retryAt: null,
            });
            expect(f.onProviderFailure).not.toHaveBeenCalled();
            expect(f.fetch).not.toHaveBeenCalled();
        },
    );

    it('uses the validated environment override in the production runtime', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const environment = loadDictionaryWorkerEnvironment({
            APP_ENV: 'test',
            DICTIONARY_WORKER_DATABASE_URL:
                'postgres://synthetic:synthetic@localhost:55489/languon_auth_unused_test',
            SENTENCE_AI_TIMEOUT_MS: '45000',
            TEXT_AI_TIMEOUT_MS: '60000',
        });
        const f = fixture(environment.sentenceAiTimeoutMs);
        await f.started();
        await vi.advanceTimersByTimeAsync(44_000);
        expect(f.store.fail).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1_000);
        await f.run;
        expect(f.signal()?.aborted).toBe(true);
        expect(f.store.fail).toHaveBeenCalledOnce();
        expect(f.store.fail.mock.calls[0]?.[1].code).toBe('provider_timeout');
        await f.respond();
        expect(f.store.completeCheck).not.toHaveBeenCalled();
        expect(f.fetch).toHaveBeenCalledOnce();
    });

    it('aborts at the production 180-second deadline and cannot publish a late response', async () => {
        const f = fixture();
        await f.started();
        await vi.advanceTimersByTimeAsync(179_000);
        expect(f.store.fail).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1_000);
        await f.run;
        expect(f.signal()?.aborted).toBe(true);
        expect(f.store.fail).toHaveBeenCalledOnce();
        expect(f.store.fail.mock.calls[0]?.[1]).toMatchObject({
            code: 'provider_timeout',
        });
        await f.respond();
        expect(f.store.completeCheck).not.toHaveBeenCalled();
        expect(f.fetch).toHaveBeenCalledOnce();
    });

    it('observes explicit cancellation on heartbeat and prevents late publication', async () => {
        const f = fixture();
        await f.started();
        f.store.heartbeat.mockResolvedValue({
            owned: true,
            cancellationRequested: true,
        });
        await vi.advanceTimersByTimeAsync(10_000);
        await f.run;
        expect(f.signal()?.aborted).toBe(true);
        expect(f.store.fail.mock.calls[0]?.[1].retryAt).toBeNull();
        await f.respond();
        expect(f.store.completeCheck).not.toHaveBeenCalled();
        expect(f.fetch).toHaveBeenCalledOnce();
    });

    it('aborts after losing the lease and cannot publish the old attempt', async () => {
        const f = fixture();
        await f.started();
        f.store.heartbeat.mockResolvedValue({
            owned: false,
            cancellationRequested: false,
        });
        f.store.fail.mockResolvedValue('lost');
        await vi.advanceTimersByTimeAsync(10_000);
        await f.run;
        expect(f.signal()?.aborted).toBe(true);
        expect(f.store.fail).toHaveBeenCalledWith(
            f.job.lease,
            expect.objectContaining({ retryAt: null }),
            expect.any(Object),
        );
        await f.respond();
        expect(f.store.completeCheck).not.toHaveBeenCalled();
        expect(f.fetch).toHaveBeenCalledOnce();
    });

    it('leaves interrupted work recoverable on process shutdown', async () => {
        const f = fixture();
        await f.started();
        f.controller.abort();
        await f.run;
        expect(f.signal()?.aborted).toBe(true);
        expect(f.store.fail).not.toHaveBeenCalled();
        await f.respond();
        expect(f.store.completeCheck).not.toHaveBeenCalled();
        await f.service.releaseWorkerLeases(new AbortController().signal);
        expect(f.store.releaseWorkerLeases).toHaveBeenCalledWith(
            'worker',
            expect.any(Object),
        );
        expect(f.fetch).toHaveBeenCalledOnce();
    });
});
