import { describe, expect, it, vi } from 'vitest';

import {
    textAiModelCatalog as dictionaryAiModelCatalog,
    type TextAiExecutionSnapshot as DictionaryAiExecutionSnapshot,
} from '../../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
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
    it('runs card authoring within its admitted budget without constructing unrelated batch providers', async () => {
        const admittedBudget = {
            ...budget,
            maxInputTokensPerAttempt: 33_748,
            maxOutputTokensPerAttempt: 8_192,
        };
        const execution = snapshot(0, {
            aggregateBudget: admittedBudget,
            supportedFormats: ['card-authoring:v3'],
        });
        const fetchProvider = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        id: 'synthetic-completion',
                        object: 'chat.completion',
                        created: 0,
                        model: 'deepseek-flash',
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: 'assistant',
                                    content: JSON.stringify({
                                        suggestions: [
                                            {
                                                field: 'translation',
                                                value: 'Привет',
                                            },
                                        ],
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
                    }),
                    { headers: { 'Content-Type': 'application/json' } },
                ),
        );
        vi.stubGlobal('fetch', fetchProvider);
        try {
            const router = new DictionaryTextProviderRouter({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-key' },
            });
            const routing = createDictionaryTextProviderRoutingAdapters({
                legacy: providers('unused'),
                router,
            });
            const result = await routing.cardAuthoring.generate({
                idempotencyKey: 'synthetic-job',
                providerBudget: admittedBudget,
                providerExecution: execution,
                signal: new AbortController().signal,
                input: {
                    sourceLanguage: 'fr',
                    targetLanguage: 'ru',
                    source: 'bonjour',
                    translationContext: null,
                    effectiveSettings: {
                        transcriptionCustomLabel: null,
                        definitionEnabled: false,
                        definitionLanguage: 'target',
                        exampleEnabled: false,
                        exampleLanguage: 'source',
                        exampleTranslationEnabled: false,
                        exampleTranslationLanguage: 'target',
                        transcriptionEnabled: false,
                        transcriptionNotation: 'ipa',
                    },
                    requestedFields: ['translation'],
                    fieldContext: [
                        {
                            field: 'translation',
                            currentValue: null,
                            excludedValues: [],
                        },
                    ],
                },
            });
            expect(result).toMatchObject({
                delta: {
                    suggestions: [{ field: 'translation', value: 'Привет' }],
                },
                usage: { inputTokens: 100, outputTokens: 20 },
            });
            expect(fetchProvider).toHaveBeenCalledOnce();
            const options = fetchProvider.mock.calls[0] as unknown as [
                unknown,
                RequestInit,
            ];
            expect(JSON.parse(options[1].body as string).max_tokens).toBe(
                8_192,
            );
            const resolved = router.resolve(execution, admittedBudget);
            expect(
                router.resolve(execution, admittedBudget).cardAuthoring,
            ).toBe(resolved.cardAuthoring);
            expect(resolved.card.generate).toBeTypeOf('function');
            // Reduced admitted budgets can fund a chunk without requiring the
            // historical five-chunk maximum. Each dispatch still checks its input.
            expect(resolved.pastedTerms).toBe(resolved.pastedTerms);
            expect(resolved.importPairs).toBe(resolved.importPairs);
        } finally {
            vi.unstubAllGlobals();
        }
    });

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
        const reduced = providers('reduced-budget');
        const reducedBudget = {
            ...budget,
            maxCostMicrosPerAttempt: budget.maxCostMicrosPerAttempt - 1,
        };
        const reducedSnapshot = snapshot(0, { aggregateBudget: reducedBudget });
        const factory = vi
            .fn()
            .mockReturnValueOnce(deepseek)
            .mockReturnValueOnce(reduced)
            .mockReturnValueOnce(deepseek);
        const router = new DictionaryTextProviderRouter({
            credentials: {
                DEEPSEEK_API_KEY: 'deepseek-test-key',
            },
            factory,
            maximumCachedConfigurations: 1,
        });

        expect(router.resolve(snapshot(0), budget)).toBe(deepseek);
        expect(router.resolve(snapshot(0), budget)).toBe(deepseek);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(router.resolve(reducedSnapshot, reducedBudget)).toBe(reduced);
        expect(router.cachedConfigurationCount).toBe(1);
        expect(router.resolve(snapshot(0), budget)).toBe(deepseek);
        expect(factory).toHaveBeenCalledTimes(3);
        expect(factory.mock.calls[0]?.[1]).toBe('deepseek-test-key');
        expect(factory.mock.calls[1]?.[1]).toBe('deepseek-test-key');
    });

    it('rejects unsupported revisions, altered caps, mismatched budgets, and missing credentials', () => {
        const router = new DictionaryTextProviderRouter({
            credentials: { DEEPSEEK_API_KEY: 'deepseek-test-key' },
            factory: vi.fn(() => providers('unused')),
        });
        for (const invalid of [
            snapshot(0, { adapterRevision: 'openai-compatible:v2' }),
            snapshot(1),
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
            new DictionaryTextProviderRouter({
                credentials: {},
                factory: vi.fn(() => providers('unused')),
            }).resolve(snapshot(0), budget),
        ).toThrow(/credential is unavailable/i);
    });
});
