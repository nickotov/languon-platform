import * as providerCatalog from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-catalog';
import { createTextAiSyntheticFlows } from '../../../../src/infrastructure/text-ai/probe-flow-registry';
import { textAiSyntheticFlowContractRevision } from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-probe-executor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTextAiProbeExecutor } from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-probe-executor';
import type { TextAiProbeReservation } from '../../../../src/modules/text-ai/application/ports/text-ai-probe-store';
const price = {
    id: '00000000-0000-4000-8000-000000000001',
    providerId: 'deepseek',
    modelId: 'deepseek-flash',
    meter: 'text-tokens' as const,
    inputUsdPerMillionTokens: '0.3',
    outputUsdPerMillionTokens: '1.2',
    cacheReadUsdPerMillionTokens: '0.006',
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    effectiveAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: null,
    version: 1,
    sourceReference: 'synthetic-test',
    sourceUrl: null,
    reason: 'Synthetic reviewed prices',
};
const request = {
    routeId: 'deepseek/deepseek-flash',
    approvedMaximumCostUsd: '0.01',
    kind: 'quick' as const,
};
const credentials = { DEEPSEEK_API_KEY: 'synthetic-not-real' };
function response(
    content: string,
    usage: unknown = {
        prompt_tokens: 100,
        completion_tokens: 10,
        total_tokens: 110,
    },
) {
    return new Response(
        JSON.stringify({
            id: 'offline-probe',
            object: 'chat.completion',
            created: 0,
            model: 'deepseek-flash',
            choices: [
                {
                    index: 0,
                    message: { role: 'assistant', content },
                    finish_reason: 'stop',
                },
            ],
            usage,
        }),
        { headers: { 'content-type': 'application/json' } },
    );
}
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
describe('synthetic probe through production SDK', () => {
    it('fingerprints every registered actual flow contract', () => {
        const flows = createTextAiSyntheticFlows();
        expect(Object.keys(flows)).toHaveLength(12);
        for (const flow of Object.values(flows))
            expect(textAiSyntheticFlowContractRevision(flow)).toMatch(
                /^[a-f0-9]{64}$/,
            );
    });
    it.each([true, false])(
        'retains bounded usage on malformed structured output (reported=%s)',
        async (reported) => {
            const executor = createTextAiProbeExecutor({
                credentials,
                flows: {
                    'sentence-check': {
                        instructions: 'Return synthetic JSON.',
                        input: 'Synthetic.',
                        schema: z.object({ ok: z.boolean() }),
                        validationRevision: 'synthetic:v1',
                        validate: () => false,
                    },
                },
            });
            vi.stubGlobal(
                'fetch',
                vi.fn(async () =>
                    response(
                        '{"notOk":"bad"}',
                        reported
                            ? {
                                  prompt_tokens: 100,
                                  completion_tokens: 10,
                                  total_tokens: 110,
                              }
                            : undefined,
                    ),
                ),
            );
            // JSON serialization omits explicit undefined usage only in this fixture.
            if (!reported)
                vi.stubGlobal(
                    'fetch',
                    vi.fn(async () => {
                        const result = response('not-json');
                        const body = await result.json();
                        delete body.usage;
                        return new Response(JSON.stringify(body), {
                            headers: { 'content-type': 'application/json' },
                        });
                    }),
                );
            const selected = {
                ...request,
                kind: 'flow' as const,
                flowId: 'sentence-check',
            };
            const result = await executor.execute(
                {
                    id: '00000000-0000-4000-8000-000000000002',
                    identity: executor.identity(selected),
                    request: selected,
                    price,
                    maximumCostMicros: 10000n,
                    startedAt: new Date(),
                },
                new AbortController().signal,
            );
            expect(result).toMatchObject({
                valid: false,
                failure: 'invalid_output',
                measurement: reported ? 'measured' : 'unknown',
                inputTokens: reported ? 100 : null,
                outputTokens: reported ? 10 : null,
            });
        },
    );
    it('makes one fixed-endpoint request with bounded output and no tools/retries', async () => {
        const executor = createTextAiProbeExecutor({ credentials, flows: {} });
        const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
            expect(String(url)).toBe(
                'https://api.deepseek.com/chat/completions',
            );
            const body = JSON.parse(String(init?.body));
            expect(body.max_tokens).toBe(128);
            expect(body.model).toBe('deepseek-flash');
            expect(body.tools).toBeUndefined();
            return response('OK');
        });
        vi.stubGlobal('fetch', fetch);
        const reservation: TextAiProbeReservation = {
            id: '00000000-0000-4000-8000-000000000002',
            identity: executor.identity(request),
            request,
            price,
            maximumCostMicros: 10_000n,
            startedAt: new Date(),
        };
        expect(
            await executor.execute(reservation, new AbortController().signal),
        ).toMatchObject({
            valid: true,
            inputTokens: 100,
            outputTokens: 10,
            measurement: 'measured',
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('changes evidence for credentials and actual flow contracts', () => {
        const flow = {
            instructions: 'Actual owned flow instruction',
            input: 'Synthetic',
            schema: z.object({ ok: z.boolean() }),
            validationRevision: 'synthetic-validator:v1',
            validate: (output: unknown) =>
                z.object({ ok: z.boolean() }).safeParse(output).success,
        };
        const a = createTextAiProbeExecutor({
            credentials,
            flows: { 'sentence-check': flow },
        });
        const b = createTextAiProbeExecutor({
            credentials: { DEEPSEEK_API_KEY: 'changed' },
            flows: { 'sentence-check': flow },
        });
        const c = createTextAiProbeExecutor({
            credentials,
            flows: {
                'sentence-check': { ...flow, instructions: 'Changed contract' },
            },
        });
        const selected = {
            routeId: request.routeId,
            kind: 'flow' as const,
            flowId: 'sentence-check',
        };
        expect(a.identity(selected).fingerprint).not.toBe(
            b.identity(selected).fingerprint,
        );
        expect(a.identity(selected).fingerprint).not.toBe(
            c.identity(selected).fingerprint,
        );
        const changedValidation = createTextAiProbeExecutor({
            credentials,
            flows: {
                'sentence-check': {
                    ...flow,
                    validationRevision: 'synthetic-validator:v2',
                },
            },
        });
        expect(a.identity(selected).fingerprint).not.toBe(
            changedValidation.identity(selected).fingerprint,
        );
        const initial = a.identity(selected).fingerprint;
        const route = providerCatalog.findTextAiModel(selected.routeId)!;
        const lookup = vi.spyOn(providerCatalog, 'findTextAiModel');
        lookup.mockReturnValue({
            ...route,
            requestPolicyRevision: 'changed-request-policy',
        });
        expect(a.identity(selected).fingerprint).not.toBe(initial);
        lookup.mockReturnValue({
            ...route,
            adapterRevision: 'changed-adapter',
        });
        expect(a.identity(selected).fingerprint).not.toBe(initial);
        expect(a.identity(selected).fingerprint).not.toContain(
            credentials.DEEPSEEK_API_KEY,
        );
    });
    it('rejects arbitrary routes and unsupported flows while allowing explicit synthetic gateway checks', () => {
        const executor = createTextAiProbeExecutor({
            credentials: { ...credentials, EVOLINK_API_KEY: 'fake' },
            flows: {},
        });
        expect(() =>
            executor.identity({
                routeId: 'https://attacker.test',
                approvedMaximumCostUsd: '0.01',
                kind: 'quick',
            }),
        ).toThrow('probe_route_unavailable');
        expect(() =>
            executor.identity({
                ...request,
                kind: 'flow',
                flowId: 'sentence-check',
            }),
        ).toThrow('probe_route_unavailable');
        expect(
            executor.identity({ routeId: 'evolink/gpt-6-luna', kind: 'quick' }),
        ).toMatchObject({
            routeId: 'evolink/gpt-6-luna',
            providerId: 'evolink',
        });
    });
    it('validates the actual selected schema and domain predicate', async () => {
        const executor = createTextAiProbeExecutor({
            credentials,
            flows: {
                'sentence-check': {
                    instructions: 'Actual sentence check synthetic fixture',
                    input: 'Synthetic phrase',
                    schema: z.object({ ok: z.boolean() }),
                    validationRevision: 'synthetic-validator:v1',
                    validate: (value: unknown) => (value as { ok: boolean }).ok,
                },
            },
        });
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response('{"ok":true}')),
        );
        const selected = {
            ...request,
            kind: 'flow' as const,
            flowId: 'sentence-check',
        };
        const reservation: TextAiProbeReservation = {
            id: '00000000-0000-4000-8000-000000000002',
            identity: executor.identity(selected),
            request: selected,
            price,
            maximumCostMicros: 10_000n,
            startedAt: new Date(),
        };
        expect(
            await executor.execute(reservation, new AbortController().signal),
        ).toMatchObject({ valid: true, measurement: 'measured' });
    });
    it('checks streamed prose in one bounded call and records first visible output', async () => {
        const executor = createTextAiProbeExecutor({
            credentials,
            flows: {
                conversation: {
                    instructions: 'Explain synthetic content.',
                    input: 'Synthetic word',
                    streaming: true,
                    validationRevision: 'synthetic-validator:v1',
                    validate: (value: unknown) =>
                        value === 'A book is something you read.',
                },
            },
        });
        const providerFetch = vi.fn(
            async (_url: unknown, init?: RequestInit) => {
                const request = JSON.parse(String(init?.body));
                expect(request.stream).toBe(true);
                expect(request.max_tokens).toBe(2048);
                const chunks = [
                    {
                        id: 'synthetic',
                        object: 'chat.completion.chunk',
                        created: 1,
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    role: 'assistant',
                                    content: 'A book is something you read.',
                                },
                                finish_reason: null,
                            },
                        ],
                    },
                    {
                        id: 'synthetic',
                        object: 'chat.completion.chunk',
                        created: 1,
                        choices: [
                            { index: 0, delta: {}, finish_reason: 'stop' },
                        ],
                        usage: {
                            prompt_tokens: 100,
                            completion_tokens: 10,
                            total_tokens: 110,
                        },
                    },
                ];
                return new Response(
                    chunks
                        .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
                        .join('') + 'data: [DONE]\n\n',
                    { headers: { 'content-type': 'text/event-stream' } },
                );
            },
        );
        vi.stubGlobal('fetch', providerFetch);
        const selected = {
            ...request,
            kind: 'flow' as const,
            flowId: 'conversation',
        };
        const reservation: TextAiProbeReservation = {
            id: '00000000-0000-4000-8000-000000000002',
            identity: executor.identity(selected),
            request: selected,
            price,
            maximumCostMicros: 10_000n,
            startedAt: new Date(),
        };
        expect(
            await executor.execute(reservation, new AbortController().signal),
        ).toMatchObject({
            valid: true,
            measurement: 'measured',
            firstOutputMs: expect.any(Number),
            inputTokens: 100,
            outputTokens: 10,
        });
        expect(providerFetch).toHaveBeenCalledTimes(1);
    });
    it('does not turn absent provider usage into a zero-cost measured pass', async () => {
        const executor = createTextAiProbeExecutor({ credentials, flows: {} });
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response('OK', null)),
        );
        const reservation: TextAiProbeReservation = {
            id: '00000000-0000-4000-8000-000000000002',
            identity: executor.identity(request),
            request,
            price,
            maximumCostMicros: 10_000n,
            startedAt: new Date(),
        };
        expect(
            await executor.execute(reservation, new AbortController().signal),
        ).toMatchObject({
            measurement: 'unknown',
            inputTokens: null,
            outputTokens: null,
        });
    });
});
