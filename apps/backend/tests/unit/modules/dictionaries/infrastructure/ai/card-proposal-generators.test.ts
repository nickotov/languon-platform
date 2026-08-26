import { describe, expect, it, vi } from 'vitest';

import { createCanonicalMastra } from '../../../../../../src/mastra/composition';
import type { CardProposalGeneratorRequest } from '../../../../../../src/modules/dictionaries/application/ports/card-proposal-generator';
import { defaultDictionaryGenerationProviderBudgetPolicy } from '../../../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import { dictionaryGenerationMinimumSupportedInputTokens } from '../../../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import type { DictionaryGenerationProposalPayload } from '../../../../../../src/modules/dictionaries/domain/generation';
import {
    CardProposalGeneratorExecutionError,
    CardProposalGeneratorUnavailableError,
    createCardProposalGenerator,
    createMastraCardProposalGenerator,
    DeterministicCardProposalGenerator,
    type DictionaryCardGenerationStructuredAgent,
} from '../../../../../../src/modules/dictionaries/infrastructure/ai/card-proposal-generators';
import { createDictionaryCardGenerationAgent } from '../../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-card-generation-agent';

const requestInput = {
    format: 'single-card:v1',
    instruction: 'Correct the translation.',
    context: {
        cardId: '11111111-1111-4111-8111-111111111111',
        dictionaryId: '22222222-2222-4222-8222-222222222222',
        expectedCardVersion: 2,
        expectedDictionaryVersion: 4,
        expectedSettingsVersion: 3,
        sourceLanguage: 'en',
        targetLanguage: 'es',
    },
    original: {
        authorship: 'human',
        effectiveSettings: {
            transcriptionCustomLabel: null,
            definitionEnabled: false,
            definitionLanguage: 'target',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            exampleTranslationLanguage: 'target',
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
        },
        overrides: {
            transcriptionCustomLabel: null,
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
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

const proposal: DictionaryGenerationProposalPayload = {
    candidate: {
        overrides: requestInput.original.overrides,
        values: {
            ...requestInput.original.values,
            translation: 'el banco',
        },
    },
    fieldFeedback: [
        {
            alternatives: ['la banca'],
            field: 'translation',
            reason: 'Added the common article.',
        },
    ],
    warnings: [],
};

function request(signal = new AbortController().signal) {
    return {
        idempotencyKey: 'generation-request-0001',
        input: requestInput,
        providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
        signal,
    } satisfies CardProposalGeneratorRequest;
}

describe('dictionary card proposal generators', () => {
    it('returns a deterministic validated proposal without a model call', async () => {
        const generator = new DeterministicCardProposalGenerator(
            () => proposal,
        );

        await expect(generator.generate(request())).resolves.toEqual(proposal);
        await expect(
            createCardProposalGenerator({ mode: 'deterministic' }).generate(
                request(),
            ),
        ).resolves.toMatchObject({
            candidate: {
                overrides: requestInput.original.overrides,
                values: requestInput.original.values,
            },
            fieldFeedback: [],
            warnings: [],
        });
    });

    it('rejects invalid deterministic output and cooperatively cancels', async () => {
        const invalid = new DeterministicCardProposalGenerator(
            () =>
                ({
                    ...proposal,
                    fieldFeedback: [
                        {
                            alternatives: ['a', 'b', 'c', 'd'],
                            field: 'translation',
                            reason: 'Too many.',
                        },
                    ],
                }) as never,
        );
        const invalidError = await invalid
            .generate(request())
            .catch((caught) => caught);
        expect(invalidError).toBeInstanceOf(
            CardProposalGeneratorExecutionError,
        );
        expect(invalidError).toMatchObject({
            category: 'invalid_model_output',
        });
        expect(String(invalidError)).not.toContain('Too many.');

        const controller = new AbortController();
        const delayed = new DeterministicCardProposalGenerator(async () => {
            controller.abort(new DOMException('Stopped', 'AbortError'));
            return proposal;
        });
        await expect(
            delayed.generate(request(controller.signal)),
        ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('fails closed when generation is unavailable', async () => {
        await expect(
            createCardProposalGenerator({ mode: 'unavailable' }).generate(
                request(),
            ),
        ).rejects.toBeInstanceOf(CardProposalGeneratorUnavailableError);
    });

    it('passes only structured data, disables tools, hides traces, and reparses output', async () => {
        const generate = vi.fn().mockResolvedValue({
            error: undefined,
            object: proposal,
            tripwire: undefined,
            usage: { inputTokens: 120, outputTokens: 48 },
        });
        const generator = createMastraCardProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryCardGenerationStructuredAgent,
        });
        const generationRequest = request();

        await expect(generator.generate(generationRequest)).resolves.toEqual({
            proposal,
            usage: { inputTokens: 120, outputTokens: 48 },
        });
        expect(generate).toHaveBeenCalledWith(JSON.stringify(requestInput), {
            abortSignal: generationRequest.signal,
            maxOutputTokens: 40_960,
            runId: 'generation-request-0001',
            structuredOutput: { schema: expect.anything() },
            toolChoice: 'none',
            tracingOptions: { hideInput: true, hideOutput: true },
        });
    });

    it('rejects an input outside the conservative serialized-token envelope before dispatch', async () => {
        const generate = vi.fn();
        const generator = createMastraCardProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryCardGenerationStructuredAgent,
        });

        await expect(
            generator.generate({
                ...request(),
                providerBudget: {
                    ...defaultDictionaryGenerationProviderBudgetPolicy,
                    maxInputTokensPerAttempt: 16_384,
                },
            }),
        ).rejects.toMatchObject({
            category: 'invalid_model_output',
            reason: 'invalid_input',
        });
        expect(generate).not.toHaveBeenCalled();
    });

    it('dispatches the smallest valid card at the minimum supported input envelope', async () => {
        const generate = vi.fn().mockResolvedValue({
            error: undefined,
            object: proposal,
            tripwire: undefined,
        });
        const generator = createMastraCardProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryCardGenerationStructuredAgent,
        });

        await expect(
            generator.generate({
                ...request(),
                input: {
                    ...requestInput,
                    instruction: null,
                    original: {
                        ...requestInput.original,
                        values: {
                            definition: null,
                            example: null,
                            exampleTranslation: null,
                            source: 'a',
                            transcription: null,
                            translation: 'b',
                        },
                    },
                },
                providerBudget: {
                    ...defaultDictionaryGenerationProviderBudgetPolicy,
                    maxInputTokensPerAttempt:
                        dictionaryGenerationMinimumSupportedInputTokens,
                },
            }),
        ).resolves.toEqual(proposal);
        expect(generate).toHaveBeenCalledOnce();
    });

    it('fits the maximum multibyte domain input inside the default 65536-token reservation', async () => {
        const generate = vi.fn().mockResolvedValue({
            error: undefined,
            object: proposal,
            tripwire: undefined,
        });
        const generator = createMastraCardProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryCardGenerationStructuredAgent,
        });
        const primary = '漢'.repeat(200);
        const long = '漢'.repeat(2_000);
        const maximumRequest = request();

        await expect(
            generator.generate({
                ...maximumRequest,
                input: {
                    ...maximumRequest.input,
                    instruction: '漢'.repeat(1_000),
                    original: {
                        ...maximumRequest.input.original,
                        effectiveSettings: {
                            ...maximumRequest.input.original.effectiveSettings,
                            transcriptionCustomLabel: '漢'.repeat(40),
                        },
                        overrides: {
                            ...maximumRequest.input.original.overrides,
                            transcriptionCustomLabel: '漢'.repeat(40),
                        },
                        values: {
                            definition: long,
                            example: long,
                            exampleTranslation: long,
                            source: primary,
                            transcription: primary,
                            translation: primary,
                        },
                    },
                },
            }),
        ).resolves.toEqual(proposal);
        expect(generate).toHaveBeenCalledOnce();
    });

    it('rejects provider usage outside the reserved input or output ceiling', async () => {
        const generate = vi.fn().mockResolvedValue({
            error: undefined,
            object: proposal,
            tripwire: undefined,
            usage: { inputTokens: 262_145, outputTokens: 1 },
        });
        const generator = createMastraCardProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryCardGenerationStructuredAgent,
        });

        await expect(generator.generate(request())).rejects.toMatchObject({
            category: 'invalid_model_output',
            reason: 'invalid_output',
        });
    });

    it('sanitizes provider failures without echoing content', async () => {
        const sentinel = 'private-card-sentinel-12498';
        const generator = createMastraCardProposalGenerator({
            agent: {
                generate: vi.fn().mockRejectedValue(new Error(sentinel)),
            } satisfies DictionaryCardGenerationStructuredAgent,
        });

        const error = await generator
            .generate(request())
            .catch((caught) => caught);
        expect(error).toBeInstanceOf(CardProposalGeneratorExecutionError);
        expect(error).toMatchObject({ category: 'provider_unavailable' });
        expect(String(error)).not.toContain(sentinel);
    });

    it('uses an explicit non-generation provider readiness probe and otherwise fails closed', async () => {
        const generate = vi.fn();
        const providerReadiness = vi.fn(async () => undefined);
        const ready = createMastraCardProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryCardGenerationStructuredAgent,
            providerReadiness,
        });
        const signal = new AbortController().signal;

        await expect(ready.readiness!(signal)).resolves.toBeUndefined();
        expect(providerReadiness).toHaveBeenCalledWith(signal);
        expect(generate).not.toHaveBeenCalled();

        const failClosed = createMastraCardProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryCardGenerationStructuredAgent,
        });
        await expect(failClosed.readiness!(signal)).rejects.toMatchObject({
            category: 'provider_unavailable',
        });
        expect(generate).not.toHaveBeenCalled();
    });

    it('builds a sanitized factory-level OpenAI-compatible readiness probe', async () => {
        const providerProbeFetch = vi
            .fn()
            .mockResolvedValue({ ok: true } as Response);
        const ready = createCardProposalGenerator({
            mode: 'mastra',
            model: {
                apiKey: 'test-provider-key',
                id: 'provider/model-v1',
                url: 'https://models.example.test/openai/v1',
            },
            providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
            providerProbeFetch,
        });
        const signal = new AbortController().signal;

        await expect(ready.readiness!(signal)).resolves.toBeUndefined();
        expect(providerProbeFetch).toHaveBeenCalledWith(
            new URL('https://models.example.test/openai/v1/models'),
            expect.objectContaining({
                cache: 'no-store',
                credentials: 'omit',
                headers: {
                    accept: 'application/json',
                    authorization: 'Bearer test-provider-key',
                },
                method: 'GET',
                redirect: 'error',
                referrerPolicy: 'no-referrer',
                signal,
            }),
        );

        const rejected = createCardProposalGenerator({
            mode: 'mastra',
            model: {
                apiKey: 'test-provider-key',
                id: 'provider/model-v1',
                url: 'https://127.0.0.1/v1',
            },
            providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
            providerProbeFetch,
        });
        await expect(rejected.readiness!(signal)).rejects.toMatchObject({
            category: 'provider_unavailable',
        });
    });

    it('creates and canonically registers a one-step product agent with no tools', async () => {
        const agent = createDictionaryCardGenerationAgent({
            model: 'deepseek/deepseek-chat',
        });
        const mastra = createCanonicalMastra({
            dictionaryCardGeneration: {
                model: 'deepseek/deepseek-chat',
            },
        });

        expect(Object.keys(await agent.listTools())).toEqual([]);
        expect(await agent.getDefaultOptions()).toMatchObject({ maxSteps: 1 });
        expect(Object.keys(mastra.listAgents())).toEqual([
            'dictionaryCardGenerationAgent',
        ]);
    });
});
