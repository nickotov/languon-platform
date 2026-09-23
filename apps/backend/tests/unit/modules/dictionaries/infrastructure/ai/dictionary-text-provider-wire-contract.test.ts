import { afterEach, describe, expect, it, vi } from 'vitest';

import { dictionaryAiModelCatalog } from '../../../../../../src/modules/dictionaries/application/dictionary-ai-provider-catalog';
import type { CardProposalGeneratorRequest } from '../../../../../../src/modules/dictionaries/application/ports/card-proposal-generator';
import { createCardProposalGenerator } from '../../../../../../src/modules/dictionaries/infrastructure/ai/card-proposal-generators';
import {
    createDictionaryTextMastraModel,
    dictionaryTextModelCatalog,
} from '../../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-text-provider-catalog';

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
        'deepseek/deepseek-chat',
        'kie/gemini-2.5-pro',
    ] as const) {
        it(`maps ${catalogId} through the OpenAI-compatible structured-output wire contract`, async () => {
            const catalogModel = dictionaryTextModelCatalog[catalogId];
            const model = dictionaryAiModelCatalog.find(
                (candidate) =>
                    `${candidate.providerId}/${candidate.id}` === catalogId,
            )!;
            const fetchProvider = vi.fn<typeof fetch>(async () =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            choices: [
                                {
                                    finish_reason: 'stop',
                                    index: 0,
                                    message: {
                                        content: JSON.stringify(proposal),
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
            const generator = createCardProposalGenerator({
                mode: 'mastra',
                model: createDictionaryTextMastraModel({
                    apiKey: 'wire-contract-key',
                    model: catalogModel,
                }),
                modelRequestLimits: catalogModel.requestLimits,
                providerBudget: model.aggregateBudget,
                providerReadiness: async () => undefined,
            });

            await expect(
                generator.generate({
                    idempotencyKey: `wire-${catalogId}`,
                    input,
                    providerBudget: model.aggregateBudget,
                    signal: new AbortController().signal,
                } satisfies CardProposalGeneratorRequest),
            ).resolves.toMatchObject({
                proposal,
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
            expect(JSON.parse(String(init?.body))).toMatchObject({
                model: catalogModel.modelId,
                response_format: { type: 'json_schema' },
            });
        });
    }
});
