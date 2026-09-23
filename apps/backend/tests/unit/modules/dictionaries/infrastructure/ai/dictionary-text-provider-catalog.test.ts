import { describe, expect, it, vi } from 'vitest';

import {
    createDictionaryTextMastraModel,
    createDictionaryTextProviderReadiness,
    dictionaryTextModelCatalog,
    dictionaryTextRequestLimits,
    findDictionaryTextModel,
} from '../../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-text-provider-catalog';

describe('dictionary text provider catalog', () => {
    it('exposes fixed provider URLs, model IDs, credentials, formats, and request caps', () => {
        expect(dictionaryTextModelCatalog).toMatchObject({
            'deepseek/deepseek-chat': {
                apiBaseUrl: 'https://api.deepseek.com',
                credentialEnvironmentVariable: 'DEEPSEEK_API_KEY',
                modelId: 'deepseek-chat',
                providerId: 'deepseek',
                requestLimits: {
                    maxInputTokens: 64_000,
                    maxOutputTokens: 8_192,
                },
            },
            'kie/gemini-2.5-pro': {
                apiBaseUrl: 'https://api.kie.ai/gemini-2.5-pro/v1',
                credentialEnvironmentVariable: 'KIE_API_KEY',
                modelId: 'gemini-2.5-pro',
                providerId: 'kie',
                requestLimits: {
                    maxInputTokens: 64_000,
                    maxOutputTokens: 8_192,
                },
            },
        });
        for (const model of Object.values(dictionaryTextModelCatalog)) {
            expect(model.supportedFormats).toEqual(
                expect.arrayContaining([
                    'single-card:v1',
                    'card-authoring:v1',
                    'pasted-terms:v1',
                    'import-pairs:v1',
                    'document-terms:v1',
                ]),
            );
        }
        expect(findDictionaryTextModel('untrusted/model')).toBeUndefined();
    });

    it('creates Mastra OpenAI-compatible configuration with the provider wire model ID', () => {
        expect(
            createDictionaryTextMastraModel({
                apiKey: 'test-kie-key',
                model: dictionaryTextModelCatalog['kie/gemini-2.5-pro'],
            }),
        ).toEqual({
            apiKey: 'test-kie-key',
            modelId: 'gemini-2.5-pro',
            providerId: 'kie',
            url: 'https://api.kie.ai/gemini-2.5-pro/v1',
        });
    });

    it('keeps per-call caps separate from a larger aggregate batch budget', () => {
        expect(
            dictionaryTextRequestLimits({
                aggregate: {
                    maxInputTokensPerAttempt: 262_144,
                    maxOutputTokensPerAttempt: 40_960,
                },
                model: dictionaryTextModelCatalog['deepseek/deepseek-chat']
                    .requestLimits,
            }),
        ).toEqual({ maxInputTokens: 64_000, maxOutputTokens: 8_192 });
    });

    it('uses provider-specific non-generation readiness requests', async () => {
        const fetchProvider = vi
            .fn()
            .mockResolvedValueOnce({ status: 200 } as Response)
            .mockResolvedValueOnce({ status: 405 } as Response);
        const signal = new AbortController().signal;

        for (const id of [
            'deepseek/deepseek-chat',
            'kie/gemini-2.5-pro',
        ] as const) {
            const model = dictionaryTextModelCatalog[id];
            await expect(
                createDictionaryTextProviderReadiness({
                    apiKey: 'test-provider-key',
                    fetchProvider,
                    readiness: model.readiness,
                })(signal),
            ).resolves.toBeUndefined();
        }

        expect(fetchProvider.mock.calls).toEqual([
            [
                'https://api.deepseek.com/models',
                expect.objectContaining({ method: 'GET', signal }),
            ],
            [
                'https://api.kie.ai/gemini-2.5-pro/v1/chat/completions',
                expect.objectContaining({ method: 'HEAD', signal }),
            ],
        ]);
        expect(fetchProvider.mock.calls[0]?.[1]).toMatchObject({
            headers: { authorization: 'Bearer test-provider-key' },
        });
    });

    it('fails readiness closed for unexpected statuses and preserves cancellation', async () => {
        const readiness = createDictionaryTextProviderReadiness({
            apiKey: 'test-provider-key',
            fetchProvider: vi.fn(async () => ({ status: 401 }) as Response),
            readiness:
                dictionaryTextModelCatalog['kie/gemini-2.5-pro'].readiness,
        });
        await expect(readiness(new AbortController().signal)).rejects.toThrow(
            /unavailable/i,
        );

        const controller = new AbortController();
        controller.abort(new DOMException('Aborted', 'AbortError'));
        await expect(readiness(controller.signal)).rejects.toMatchObject({
            name: 'AbortError',
        });
    });
});
