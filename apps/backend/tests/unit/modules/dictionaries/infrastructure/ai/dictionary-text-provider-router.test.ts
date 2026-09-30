import { describe, expect, it, vi } from 'vitest';

import {
    dictionaryAiModelCatalog,
    type DictionaryAiExecutionSnapshot,
} from '../../../../../../src/modules/dictionaries/application/dictionary-ai-provider-catalog';
import type { DictionaryGenerationProviderBudgetPolicy } from '../../../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import {
    createDictionaryTextProviderRoutingAdapters,
    DictionaryTextProviderRouter,
    type DictionaryTextProviderSet,
} from '../../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-text-provider-router';

const budget = dictionaryAiModelCatalog[0]!.aggregateBudget;

function snapshot(
    index = 0,
    overrides: Partial<DictionaryAiExecutionSnapshot> = {},
): DictionaryAiExecutionSnapshot {
    const model = dictionaryAiModelCatalog[index]!;
    return {
        adapterRevision: model.adapterRevision,
        aggregateBudget: model.aggregateBudget,
        credentialReference: model.credentialReference,
        enabledModelIds: [model.id],
        modelId: model.id,
        perCallMaxInputTokens: model.perCallMaxInputTokens,
        perCallMaxOutputTokens: model.perCallMaxOutputTokens,
        providerId: model.providerId,
        supportedFormats: [...model.supportedFormats],
        ...overrides,
    };
}

function providers(label: string): DictionaryTextProviderSet {
    const result = { proposal: label } as never;
    return {
        card: { generate: vi.fn(async () => result) },
        cardAuthoring: { generate: vi.fn(async () => result) },
        importPairs: { generate: vi.fn(async () => result) },
        pastedTerms: { generate: vi.fn(async () => result) },
    };
}

describe('dictionary text provider router', () => {
    it('uses the legacy provider only for jobs without a pinned execution snapshot', async () => {
        const legacy = providers('legacy');
        const factory = vi.fn(() => providers('pinned'));
        const routing = createDictionaryTextProviderRoutingAdapters({
            legacy,
            router: new DictionaryTextProviderRouter({
                credentials: { DEEPSEEK_API_KEY: 'deepseek-test-key' },
                factory,
            }),
        });

        await routing.card.generate({
            idempotencyKey: 'legacy-job',
            input: {} as never,
            providerBudget: budget,
            providerExecution: null,
            signal: new AbortController().signal,
        });

        expect(legacy.card.generate).toHaveBeenCalledOnce();
        expect(factory).not.toHaveBeenCalled();
    });

    it('dispatches requests with a pinned execution snapshot to the matching provider set', async () => {
        const legacy = providers('legacy');
        const pinned = providers('pinned');
        const execution = snapshot(0);
        const routing = createDictionaryTextProviderRoutingAdapters({
            legacy,
            router: new DictionaryTextProviderRouter({
                credentials: { DEEPSEEK_API_KEY: 'deepseek-test-key' },
                factory: vi.fn(() => pinned),
            }),
        });
        const request = {
            idempotencyKey: 'pinned-job',
            input: {} as never,
            providerBudget: budget,
            providerExecution: execution,
            signal: new AbortController().signal,
        };

        await routing.card.generate(request);

        expect(pinned.card.generate).toHaveBeenCalledWith(request);
        expect(legacy.card.generate).not.toHaveBeenCalled();
    });

    it('keeps an older pinned revision compatible after additive format expansion', () => {
        const pinned = providers('pinned');
        const factory = vi.fn(() => pinned);
        const router = new DictionaryTextProviderRouter({
            credentials: { DEEPSEEK_API_KEY: 'deepseek-test-key' },
            factory,
        });
        const execution = snapshot(0, {
            supportedFormats: [
                'single-card:v1',
                'card-authoring:v1',
                'card-authoring:v2',
                'pasted-terms:v1',
                'import-pairs:v1',
                'document-terms:v1',
            ],
        });

        expect(router.resolve(execution, budget)).toBe(pinned);
        expect(factory).toHaveBeenCalledOnce();
    });

    it('routes pinned jobs by immutable snapshot and caches bounded configurations', async () => {
        const deepseek = providers('deepseek');
        const kie = providers('kie');
        const factory = vi
            .fn()
            .mockReturnValueOnce(deepseek)
            .mockReturnValueOnce(kie)
            .mockReturnValueOnce(deepseek);
        const router = new DictionaryTextProviderRouter({
            credentials: {
                DEEPSEEK_API_KEY: 'deepseek-test-key',
                KIE_API_KEY: 'kie-test-key',
            },
            factory,
            maximumCachedConfigurations: 1,
        });

        expect(router.resolve(snapshot(0), budget)).toBe(deepseek);
        expect(router.resolve(snapshot(0), budget)).toBe(deepseek);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(
            router.resolve(
                snapshot(1),
                dictionaryAiModelCatalog[1]!.aggregateBudget,
            ),
        ).toBe(kie);
        expect(router.cachedConfigurationCount).toBe(1);
        expect(router.resolve(snapshot(0), budget)).toBe(deepseek);
        expect(factory).toHaveBeenCalledTimes(3);
        expect(factory.mock.calls[0]?.[1]).toBe('deepseek-test-key');
        expect(factory.mock.calls[1]?.[1]).toBe('kie-test-key');
    });

    it('rejects unsupported revisions, altered caps, mismatched budgets, and missing credentials', () => {
        const router = new DictionaryTextProviderRouter({
            credentials: { DEEPSEEK_API_KEY: 'deepseek-test-key' },
            factory: vi.fn(() => providers('unused')),
        });
        for (const invalid of [
            snapshot(0, { adapterRevision: 'openai-compatible:v2' }),
            snapshot(0, { perCallMaxOutputTokens: 40_960 }),
            snapshot(0, { enabledModelIds: [] }),
            snapshot(0, {
                supportedFormats: [
                    ...dictionaryAiModelCatalog[0]!.supportedFormats,
                    'future-format:v1',
                ],
            }),
        ]) {
            expect(() => router.resolve(invalid, budget)).toThrow(
                /snapshot is unsupported/i,
            );
        }
        const mismatchedBudget: DictionaryGenerationProviderBudgetPolicy = {
            ...budget,
            maxOutputTokensPerAttempt: budget.maxOutputTokensPerAttempt - 1,
        };
        expect(() => router.resolve(snapshot(0), mismatchedBudget)).toThrow(
            /snapshot is unsupported/i,
        );
        expect(() =>
            router.resolve(
                snapshot(1),
                dictionaryAiModelCatalog[1]!.aggregateBudget,
            ),
        ).toThrow(/credential is unavailable/i);
    });
});
