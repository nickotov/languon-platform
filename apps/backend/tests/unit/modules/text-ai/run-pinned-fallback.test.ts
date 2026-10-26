import { describe, expect, it, vi } from 'vitest';
import type { ProviderPrice } from '@languon/contracts';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { runPinnedFallback } from '../../../../src/modules/text-ai/infrastructure/ai/run-pinned-fallback';
import { ProviderExecutionError } from '../../../../src/modules/text-ai/infrastructure/ai/provider-execution-outcome';

function snapshot(): TextAiExecutionSnapshot {
    const model = textAiModelCatalog.find(
        (model) => model.id === 'deepseek-flash',
    )!;
    const base: TextAiExecutionSnapshot = {
        ...model,
        supportedFormats: [...model.supportedFormats],
        modelId: model.id,
        enabledModelIds: [model.id],
    };
    const price: ProviderPrice = {
        id: '00000000-0000-4000-8000-000000000001',
        providerId: 'openrouter',
        modelId: 'fallback',
        meter: 'text-tokens',
        inputUsdPerMillionTokens: '0.1',
        outputUsdPerMillionTokens: '0.5',
        cacheReadUsdPerMillionTokens: null,
        cacheWriteUsdPerMillionTokens: null,
        usdPer1000Characters: null,
        effectiveAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: null,
        version: 1,
        sourceReference: 'synthetic',
        sourceUrl: null,
        reason: 'Synthetic test price',
    };
    return {
        ...base,
        routingAuthority: {
            revisionId: 'revision',
            flowId: 'conversation',
            automaticReattemptLimit: 1,
            tariffPublished: true,
            candidates: [
                {
                    routeId: 'deepseek/deepseek-flash',
                    fingerprint: 'primary',
                    snapshot: base,
                    providerPrice: price,
                },
                {
                    routeId: 'openrouter/fallback',
                    fingerprint: 'secondary',
                    snapshot: {
                        ...base,
                        providerId: 'openrouter',
                        modelId: 'fallback',
                    },
                    providerPrice: price,
                },
            ],
        },
    };
}
const rejected = () =>
    new ProviderExecutionError({ statusCode: 429 }, 'openrouter');
describe('pinned fallback dispatch', () => {
    it('uses only the pinned candidate, with one fresh execution after a conclusive rejection', async () => {
        const current = snapshot();
        const execute = vi
            .fn()
            .mockRejectedValueOnce(rejected())
            .mockResolvedValueOnce('usable result');
        await expect(
            runPinnedFallback({
                snapshot: current,
                signal: new AbortController().signal,
                hasPublished: () => false,
                execute,
            }),
        ).resolves.toBe('usable result');
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute.mock.calls[1]![0]).toMatchObject({
            providerId: 'openrouter',
            modelId: 'fallback',
            routingAuthority: current.routingAuthority,
        });
        expect(execute.mock.calls[1]![1]).toBe(2);
    });
    it.each([403, 500, 503, undefined])(
        'does not retry ambiguous or policy failure %s',
        async (statusCode) => {
            const error = new ProviderExecutionError(
                { statusCode },
                'openrouter',
            );
            const execute = vi.fn().mockRejectedValue(error);
            await expect(
                runPinnedFallback({
                    snapshot: snapshot(),
                    signal: new AbortController().signal,
                    hasPublished: () => false,
                    execute,
                }),
            ).rejects.toBe(error);
            expect(execute).toHaveBeenCalledTimes(1);
        },
    );
    it.each(['published', 'aborted', 'no-candidate', 'untyped'] as const)(
        'does not retry %s',
        async (kind) => {
            const current = snapshot();
            const controller = new AbortController();
            if (kind === 'no-candidate')
                current.routingAuthority!.candidates.splice(1);
            const error =
                kind === 'untyped'
                    ? new Error('Invalid structured result')
                    : rejected();
            const execute = vi.fn().mockImplementation(async () => {
                if (kind === 'aborted') controller.abort();
                throw error;
            });
            await expect(
                runPinnedFallback({
                    snapshot: current,
                    signal: controller.signal,
                    hasPublished: () => kind === 'published',
                    execute,
                }),
            ).rejects.toBe(error);
            expect(execute).toHaveBeenCalledTimes(1);
        },
    );
    it('does not trust provider-controlled completed outcome properties', async () => {
        const error = Object.assign(new Error('Untrusted invalid result'), {
            executionOutcome: 'completed',
        });
        const execute = vi.fn().mockRejectedValue(error);
        await expect(
            runPinnedFallback({
                snapshot: snapshot(),
                signal: new AbortController().signal,
                hasPublished: () => false,
                execute,
            }),
        ).rejects.toBe(error);
        expect(execute).toHaveBeenCalledTimes(1);
    });
    it('never retries the fallback or reduces confirmed output allowances', async () => {
        const execute = vi.fn().mockRejectedValue(rejected());
        await expect(
            runPinnedFallback({
                snapshot: snapshot(),
                signal: new AbortController().signal,
                hasPublished: () => false,
                execute,
            }),
        ).rejects.toBeInstanceOf(ProviderExecutionError);
        expect(execute).toHaveBeenCalledTimes(2);
        const current = snapshot();
        current.routingAuthority!.candidates[1]!.snapshot.perCallMaxOutputTokens = 1;
        execute.mockClear();
        await expect(
            runPinnedFallback({
                snapshot: current,
                signal: new AbortController().signal,
                hasPublished: () => false,
                execute,
            }),
        ).rejects.toThrow('confirmed execution allowance');
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
