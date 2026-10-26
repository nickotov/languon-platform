import { currentTextAiProviderAttemptWitness } from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-attempt-context';
import { legacyProviderAttemptId } from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderPrice } from '@languon/contracts';
import { DictionaryTextProviderRouter } from '../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-text-provider-router';
import { createTextAiSyntheticFlows } from '../../../../../src/infrastructure/text-ai/probe-flow-registry';
import { createTextAiRouteFingerprint } from '../../../../../src/infrastructure/text-ai/route-fingerprint';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';

const model = textAiModelCatalog.find(
    (model) =>
        model.providerId === 'openrouter' && model.id === 'openai/gpt-6-luna',
)!;
const providerPrice: ProviderPrice = {
    id: '00000000-0000-4000-8000-000000000009',
    version: 1,
    createdAt: '2026-10-25T00:00:00.000Z',
    createdBy: null,
    providerId: model.providerId,
    modelId: model.id,
    meter: 'text-tokens',
    inputUsdPerMillionTokens: '0.17',
    outputUsdPerMillionTokens: '0.51',
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    effectiveAt: '2026-10-25T00:00:00.000Z',
    sourceReference: 'synthetic',
    sourceUrl: null,
    reason: 'Synthetic fixture price.',
};
const routeId = `${model.providerId}/${model.id}`;
function fixture() {
    const credentials = { OPENROUTER_API_KEY: 'synthetic-only' };
    const currentFingerprint = createTextAiRouteFingerprint(credentials);
    const fingerprint = currentFingerprint(routeId, 'card-authoring')!;
    const base = {
        adapterRevision: model.adapterRevision,
        aggregateBudget: model.aggregateBudget,
        credentialReference: model.credentialReference,
        enabledModelIds: [model.id],
        modelId: model.id,
        providerId: model.providerId,
        perCallMaxInputTokens: model.perCallMaxInputTokens,
        perCallMaxOutputTokens: model.perCallMaxOutputTokens,
        supportedFormats: ['card-authoring:v3'],
    };
    const snapshot: TextAiExecutionSnapshot = {
        ...base,
        routingAuthority: {
            revisionId: 'synthetic-revision',
            flowId: 'card-authoring',
            candidates: [
                { routeId, fingerprint, snapshot: base, providerPrice },
            ],
            automaticReattemptLimit: 1,
            tariffPublished: true,
        },
    };
    const witnesses: unknown[] = [];
    const onProviderFailure = vi.fn(async (_event: unknown) => {
        witnesses.push(currentTextAiProviderAttemptWitness());
    });
    const router = new DictionaryTextProviderRouter({
        credentials,
        currentFingerprint,
        onProviderFailure,
    });
    const input = JSON.parse(
        createTextAiSyntheticFlows()['card-authoring'].input,
    );
    const generate = (execution = snapshot) =>
        router
            .resolve(execution, execution.aggregateBudget)
            .cardAuthoring.generate({
                input,
                providerBudget: execution.aggregateBudget,
                providerExecution: execution,
                providerAttempt: {
                    jobId: '00000000-0000-4000-8000-000000000020',
                    attempt: 1,
                    workerId: 'synthetic-worker',
                    fencingToken: '3',
                },
                signal: new AbortController().signal,
                idempotencyKey: 'synthetic-router-gateway',
            });
    return {
        credentials,
        witnesses,
        snapshot,
        router,
        generate,
        onProviderFailure,
        fingerprint,
    };
}
function success() {
    return new Response(
        JSON.stringify({
            id: 'synthetic',
            object: 'chat.completion',
            created: 1,
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: JSON.stringify({
                            suggestions: [
                                { field: 'translation', value: 'libro' },
                            ],
                        }),
                    },
                },
            ],
            usage: {
                prompt_tokens: 12,
                completion_tokens: 5,
                total_tokens: 17,
            },
        }),
        { headers: { 'content-type': 'application/json' } },
    );
}
afterEach(() => vi.unstubAllGlobals());
describe('production DictionaryTextProviderRouter gateway composition', () => {
    it('uses its pinned price through router, generator and real SDK HTTP', async () => {
        const f = fixture();
        const providerFetch = vi.fn(
            async (url: unknown, init?: RequestInit) => {
                expect(String(url)).toBe(
                    'https://openrouter.ai/api/v1/chat/completions',
                );
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: 'openai/gpt-6-luna',
                    max_tokens: 10_000,
                    response_format: {
                        type: 'json_schema',
                        json_schema: { strict: false },
                    },
                    provider: {
                        allow_fallbacks: false,
                        max_price: {
                            prompt: 0.17,
                            completion: 0.51,
                            request: 0,
                            image: 0,
                        },
                    },
                });
                return success();
            },
        );
        vi.stubGlobal('fetch', providerFetch);
        await expect(f.generate()).resolves.toMatchObject({
            delta: { suggestions: [{ field: 'translation', value: 'libro' }] },
            usage: { inputTokens: 12, outputTokens: 5 },
        });
        expect(providerFetch).toHaveBeenCalledOnce();
        expect(f.onProviderFailure).not.toHaveBeenCalled();
    });
    it('does not reuse a same-policy cached generator after provider-price revision changes', async () => {
        const f = fixture();
        const original = f.router.resolve(f.snapshot, model.aggregateBudget);
        const updated = structuredClone(f.snapshot);
        Object.assign(updated.routingAuthority!.candidates[0]!.providerPrice, {
            id: '00000000-0000-4000-8000-000000000010',
            version: 2,
            inputUsdPerMillionTokens: '0.18',
        });
        expect(f.router.resolve(updated, model.aggregateBudget)).not.toBe(
            original,
        );
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: unknown, init?: RequestInit) => {
                expect(
                    JSON.parse(String(init?.body)).provider.max_price.prompt,
                ).toBe(0.18);
                return success();
            }),
        );
        await f.generate(updated);
    });
    it('fails before HTTP on credential drift even when the matching generator is cached', () => {
        const f = fixture();
        f.router.resolve(f.snapshot, model.aggregateBudget);
        f.credentials.OPENROUTER_API_KEY = 'synthetic-rotated';
        const providerFetch = vi.fn();
        vi.stubGlobal('fetch', providerFetch);
        expect(() =>
            f.router.resolve(f.snapshot, model.aggregateBudget),
        ).toThrow('identity has changed');
        expect(providerFetch).not.toHaveBeenCalled();
    });
    it('awaits a safe runtime health write before returning a rejected provider failure', async () => {
        const f = fixture();
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            error: {
                                message: 'private-synthetic-body',
                                code: 401,
                            },
                        }),
                        {
                            status: 401,
                            headers: { 'content-type': 'application/json' },
                        },
                    ),
            ),
        );
        await expect(f.generate()).rejects.toMatchObject({
            executionOutcome: 'rejected',
        });
        expect(f.onProviderFailure).toHaveBeenCalledOnce();
        expect(f.witnesses).toEqual([
            {
                attemptId: legacyProviderAttemptId(
                    '00000000-0000-4000-8000-000000000020',
                    1,
                ),
                jobId: '00000000-0000-4000-8000-000000000020',
                workerId: 'synthetic-worker',
                fencingToken: '3',
            },
        ]);
        expect(f.onProviderFailure.mock.calls[0]?.[0]).toMatchObject({
            routeId,
            flowId: 'card-authoring',
            fingerprint: f.fingerprint,
            reason: 'authorization_failed',
            failure: { httpStatus: 401 },
        });
        expect(JSON.stringify(f.onProviderFailure.mock.calls)).not.toContain(
            'private-synthetic-body',
        );
    });
    it('does not let a learner-induced policy403 exclude shared credentials or authorize fallback', async () => {
        const f = fixture();
        const providerFetch = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        error: {
                            code: 403,
                            message: 'Synthetic policy refusal',
                        },
                    }),
                    {
                        status: 403,
                        headers: { 'content-type': 'application/json' },
                    },
                ),
        );
        vi.stubGlobal('fetch', providerFetch);
        await expect(f.generate()).rejects.toMatchObject({
            executionOutcome: 'ambiguous',
            category: 'provider_unavailable',
        });
        expect(f.onProviderFailure).not.toHaveBeenCalled();
        expect(providerFetch).toHaveBeenCalledOnce();
    });

    it('does not return a successful result if recording a fatal provider failure fails', async () => {
        const f = fixture();
        f.onProviderFailure.mockRejectedValueOnce(
            new Error('Synthetic health store unavailable.'),
        );
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            error: { message: 'Synthetic unauthorized' },
                        }),
                        {
                            status: 401,
                            headers: { 'content-type': 'application/json' },
                        },
                    ),
            ),
        );
        await expect(f.generate()).rejects.toBeDefined();
        expect(f.onProviderFailure).toHaveBeenCalledOnce();
    });
});
