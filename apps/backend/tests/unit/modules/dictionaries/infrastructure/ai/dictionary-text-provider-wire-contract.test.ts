import { afterEach, describe, expect, it, vi } from 'vitest';

import { textAiModelCatalog as dictionaryAiModelCatalog } from '../../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import type { CardProposalGeneratorRequest } from '../../../../../../src/modules/dictionaries/application/ports/card-proposal-generator';
import { DictionaryTextProviderRouter } from '../../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-text-provider-router';
import { textAiModelCatalog as dictionaryTextModelCatalog } from '../../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-catalog';

const input = {
    context: {
        cardId: '11111111-1111-4111-8111-111111111111',
        dictionaryId: '22222222-2222-4222-8222-222222222222',
        expectedCardVersion: 2,
        expectedDictionaryVersion: 4,
        expectedSettingsVersion: 3,
        sourceLanguage: 'en',
        targetLanguage: 'es',
    },
    format: 'single-card:v1',
    instruction: null,
    original: {
        authorship: 'human',
        effectiveSettings: {
            definitionEnabled: false,
            definitionLanguage: 'target',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            exampleTranslationLanguage: 'target',
            transcriptionCustomLabel: null,
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
        },
        overrides: {
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
            transcriptionCustomLabel: null,
            transcriptionEnabled: null,
            transcriptionNotation: null,
        },
        values: {
            definition: null,
            example: 'I went to the bank.',
            exampleTranslation: 'Fui al banco.',
            source: 'bank',
            transcription: null,
            translation: 'banco',
        },
    },
} as const;

const proposal = {
    candidate: {
        overrides: input.original.overrides,
        values: input.original.values,
    },
    fieldFeedback: [],
    warnings: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('dictionary text provider wire contracts', () => {
    for (const catalogId of [
        'deepseek/deepseek-flash',
        'kie/gemini-2.5-pro',
    ] as const) {
        for (const kind of ['card', 'import-pairs', 'pasted-terms'] as const) {
            it(`${catalogId === 'kie/gemini-2.5-pro' ? 'rejects retired' : 'maps'} ${catalogId} ${kind} through the capped OpenAI-compatible wire contract`, async () => {
                const catalogModel = dictionaryTextModelCatalog[catalogId];
                const model = dictionaryAiModelCatalog.find(
                    (candidate) =>
                        `${candidate.providerId}/${candidate.id}` === catalogId,
                )!;
                const output =
                    kind === 'card'
                        ? proposal
                        : {
                              candidates: [
                                  {
                                      candidate: proposal.candidate,
                                      fieldFeedback: proposal.fieldFeedback,
                                      rowIndex: 0,
                                      ...(kind === 'pasted-terms'
                                          ? { input: 'bank' }
                                          : {
                                                source: 'bank',
                                                translation: 'banco',
                                            }),
                                  },
                              ],
                              failures: [],
                              ...(kind === 'import-pairs'
                                  ? { warnings: [] }
                                  : {}),
                          };
                const budget = {
                    ...model.aggregateBudget,
                    maxInputTokensPerAttempt: 65_536,
                    maxOutputTokensPerAttempt: 9_000,
                };
                const fetchProvider = vi.fn<typeof fetch>(async () =>
                    Promise.resolve(
                        new Response(
                            JSON.stringify({
                                choices: [
                                    {
                                        finish_reason: 'stop',
                                        index: 0,
                                        message: {
                                            content: JSON.stringify(output),
                                            role: 'assistant',
                                        },
                                    },
                                ],
                                created: 1,
                                id: 'fixture-completion',
                                model: catalogModel.modelId,
                                object: 'chat.completion',
                                usage: {
                                    completion_tokens: 20,
                                    prompt_tokens: 30,
                                    total_tokens: 50,
                                },
                            }),
                            {
                                headers: { 'content-type': 'application/json' },
                                status: 200,
                            },
                        ),
                    ),
                );
                vi.stubGlobal('fetch', fetchProvider);
                const execution = {
                    adapterRevision: model.adapterRevision,
                    aggregateBudget: budget,
                    credentialReference: model.credentialReference,
                    enabledModelIds: [model.id],
                    modelId: model.id,
                    perCallMaxInputTokens: model.perCallMaxInputTokens,
                    perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                    providerId: model.providerId,
                    supportedFormats: [
                        kind === 'card'
                            ? 'single-card:v1'
                            : kind === 'import-pairs'
                              ? 'import-pairs:v1'
                              : 'pasted-terms:v1',
                    ],
                };
                const router = new DictionaryTextProviderRouter({
                    credentials: {
                        [model.credentialReference]: 'wire-contract-key',
                    },
                });
                if (catalogId === 'kie/gemini-2.5-pro') {
                    expect(model.retired).toBe(true);
                    expect(() => router.resolve(execution, budget)).toThrow(
                        'Text AI provider execution snapshot is unsupported.',
                    );
                    expect(fetchProvider).not.toHaveBeenCalled();
                    return;
                }
                const providers = router.resolve(execution, budget);
                const common = {
                    providerExecution: execution,
                    idempotencyKey: `wire-${kind}-${catalogId}`,
                    providerBudget: budget,
                    signal: new AbortController().signal,
                };
                const context = {
                    dictionaryId: input.context.dictionaryId,
                    expectedDictionaryVersion:
                        input.context.expectedDictionaryVersion,
                    expectedSettingsVersion:
                        input.context.expectedSettingsVersion,
                    sourceLanguage: input.context.sourceLanguage,
                    targetLanguage: input.context.targetLanguage,
                };
                const generate = () =>
                    kind === 'card'
                        ? providers.card.generate({
                              ...common,
                              input,
                          } satisfies CardProposalGeneratorRequest)
                        : kind === 'pasted-terms'
                          ? providers.pastedTerms.generate({
                                ...common,
                                input: {
                                    format: 'pasted-terms:v1',
                                    context,
                                    effectiveSettings:
                                        input.original.effectiveSettings,
                                    rows: [{ rowIndex: 0, input: 'bank' }],
                                    sharedContext: null,
                                },
                            })
                          : providers.importPairs.generate({
                                ...common,
                                input: {
                                    format: 'import-pairs:v1',
                                    context,
                                    effectiveSettings:
                                        input.original.effectiveSettings,
                                    instruction: null,
                                    importFingerprint:
                                        'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                                    predecessor: {
                                        jobId: '33333333-3333-4333-8333-333333333333',
                                        rowIndexes: [0],
                                    },
                                    rows: [
                                        {
                                            rowIndex: 0,
                                            source: 'bank',
                                            translation: 'banco',
                                            lineage: {
                                                importFingerprint:
                                                    'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                                                importedRowIndex: 0,
                                            },
                                        },
                                    ],
                                },
                            });
                await expect(generate()).resolves.toMatchObject({
                    usage: { inputTokens: 30, outputTokens: 20 },
                });

                expect(fetchProvider).toHaveBeenCalledOnce();
                const [url, init] = fetchProvider.mock.calls[0]!;
                expect(String(url)).toBe(
                    `${catalogModel.apiBaseUrl}/chat/completions`,
                );
                expect(init?.headers).toMatchObject({
                    authorization: 'Bearer wire-contract-key',
                });
                const body = JSON.parse(String(init?.body)) as {
                    messages: Array<{
                        content: string | Array<{ text: string; type: string }>;
                    }>;
                    model: string;
                    max_tokens?: number;
                    response_format?: { type: string };
                };
                expect(body.max_tokens).toBe(
                    Math.min(9_000, catalogModel.requestLimits.maxOutputTokens),
                );
                expect(body.model).toBe(catalogModel.modelId);
                // Retry authorization belongs to the worker, never to the SDK.
                fetchProvider.mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            error: {
                                message: 'Synthetic upstream failure',
                                type: 'server_error',
                            },
                        }),
                        {
                            status: 500,
                            headers: { 'content-type': 'application/json' },
                        },
                    ),
                );
                await expect(generate()).rejects.toBeInstanceOf(Error);
                expect(fetchProvider).toHaveBeenCalledTimes(2);
                if (catalogModel.structuredOutput === 'prompt-injection') {
                    expect(body.response_format).toBeUndefined();
                    expect(JSON.stringify(body.messages)).toContain(
                        'Return your response as JSON matching this schema',
                    );
                } else {
                    expect(body.response_format).toMatchObject({
                        type: 'json_schema',
                    });
                }
            });
        }
    }
});
