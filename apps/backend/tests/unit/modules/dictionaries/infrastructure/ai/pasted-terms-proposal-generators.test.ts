import { describe, expect, it, vi } from 'vitest';

import { createCanonicalMastra } from '../../../../../../src/mastra/composition';
import type { PastedTermsProposalGeneratorRequest } from '../../../../../../src/modules/dictionaries/application/ports/pasted-terms-proposal-generator';
import { defaultDictionaryGenerationProviderBudgetPolicy } from '../../../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import {
    createMastraPastedTermsProposalGenerator,
    createPastedTermsProposalGenerator,
    DeterministicPastedTermsProposalGenerator,
    PastedTermsProposalGeneratorCapabilityError,
    type DictionaryPastedTermsGenerationStructuredAgent,
} from '../../../../../../src/modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators';

const effectiveSettings = {
    definitionEnabled: true,
    definitionLanguage: 'source' as const,
    exampleEnabled: true,
    exampleLanguage: 'source' as const,
    exampleTranslationEnabled: true,
    exampleTranslationLanguage: 'target' as const,
    transcriptionCustomLabel: null,
    transcriptionEnabled: false,
    transcriptionNotation: 'ipa' as const,
};

function request(
    rows = [
        { input: 'bank', rowIndex: 0 },
        { input: 'shore', rowIndex: 1 },
    ],
): PastedTermsProposalGeneratorRequest {
    return {
        idempotencyKey: 'job/generate/chunk/1-of-1',
        input: {
            context: {
                dictionaryId: '11111111-1111-4111-8111-111111111111',
                expectedDictionaryVersion: 2,
                expectedSettingsVersion: 3,
                sourceLanguage: 'en',
                targetLanguage: 'es',
            },
            effectiveSettings,
            format: 'pasted-terms:v1',
            rows,
            sharedContext: 'Ecology',
        },
        providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
        signal: new AbortController().signal,
    };
}

function candidate(input: string, rowIndex: number) {
    return {
        candidate: {
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
                definition: `${input} definition`,
                example: `${input} example`,
                exampleTranslation: `${input} example translation`,
                source: input,
                transcription: null,
                translation: input,
            },
        },
        fieldFeedback: [],
        input,
        rowIndex,
    };
}

describe('pasted-terms proposal generators', () => {
    it('deterministically enriches enabled fields and exposes a structural retryable failure fixture', async () => {
        const generator = new DeterministicPastedTermsProposalGenerator();
        const longTerm = 'a'.repeat(161);

        await expect(
            generator.generate(
                request([
                    { input: 'bank', rowIndex: 0 },
                    { input: longTerm, rowIndex: 1 },
                ]),
            ),
        ).resolves.toMatchObject({
            proposal: {
                candidates: [
                    {
                        candidate: {
                            values: {
                                definition: 'bank definition',
                                example: 'bank example',
                                exampleTranslation: 'bank example translation',
                                source: 'bank',
                                translation: 'bank',
                            },
                        },
                        rowIndex: 0,
                    },
                ],
                failures: [
                    {
                        code: 'generation_failed',
                        retryable: true,
                        rowIndex: 1,
                    },
                ],
            },
            usage: { inputTokens: 0, outputTokens: 0 },
        });
    });

    it('validates 200 astral-code-point row inputs by code point, not UTF-16 units', async () => {
        const input = '😀'.repeat(200);
        const generator = new DeterministicPastedTermsProposalGenerator(() => ({
            candidates: [],
            failures: [
                {
                    code: 'generation_failed',
                    input,
                    message: 'Could not generate this row.',
                    retryable: true,
                    rowIndex: 0,
                },
            ],
            warnings: [],
        }));

        await expect(
            generator.generate(request([{ input, rowIndex: 0 }])),
        ).resolves.toMatchObject({
            proposal: { failures: [{ input, rowIndex: 0 }] },
        });
    });

    it('accepts partial row failures but rejects omitted, invented, or changed rows', async () => {
        const valid = new DeterministicPastedTermsProposalGenerator(() => ({
            candidates: [candidate('bank', 0)],
            failures: [
                {
                    code: 'generation_failed',
                    input: 'shore',
                    message: 'Could not generate this row.',
                    retryable: true,
                    rowIndex: 1,
                },
            ],
            warnings: [],
        }));
        await expect(valid.generate(request())).resolves.toMatchObject({
            proposal: {
                candidates: [{ rowIndex: 0 }],
                failures: [{ rowIndex: 1 }],
            },
        });

        const invalid = new DeterministicPastedTermsProposalGenerator(() => ({
            candidates: [candidate('changed', 0)],
            failures: [],
            warnings: [],
        }));
        await expect(invalid.generate(request())).rejects.toMatchObject({
            category: 'invalid_model_output',
            reason: 'invalid_output',
        });
    });

    it('uses bounded structured output, stable run identity, hidden traces, and mandatory usage', async () => {
        const proposal = {
            candidates: [candidate('bank', 0), candidate('shore', 1)],
            failures: [],
        };
        const generate = vi.fn().mockResolvedValue({
            error: undefined,
            object: proposal,
            tripwire: undefined,
            usage: { inputTokens: 400, outputTokens: 300 },
        });
        const generator = createMastraPastedTermsProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryPastedTermsGenerationStructuredAgent,
        });
        const generationRequest = request();

        await expect(generator.generate(generationRequest)).resolves.toEqual({
            proposal: { ...proposal, warnings: [] },
            usage: { inputTokens: 400, outputTokens: 300 },
        });
        expect(JSON.parse(generate.mock.calls[0]![0])).toEqual(
            generationRequest.input,
        );
        expect(generate.mock.calls[0]![1]).toEqual(
            expect.objectContaining({
                abortSignal: generationRequest.signal,
                maxOutputTokens: 40_960,
                runId: 'job/generate/chunk/1-of-1',
                structuredOutput: { schema: expect.anything() },
                toolChoice: 'none',
                tracingOptions: { hideInput: true, hideOutput: true },
            }),
        );

        generate.mockResolvedValueOnce({
            error: undefined,
            object: proposal,
            tripwire: undefined,
        });
        await expect(
            generator.generate(generationRequest),
        ).rejects.toMatchObject({
            category: 'invalid_model_output',
            reason: 'invalid_output',
        });
    });

    it('fits a maximum multibyte twenty-row chunk inside one fifth of the aggregate input envelope', async () => {
        const rows = Array.from({ length: 20 }, (_, rowIndex) => ({
            input: '漢'.repeat(200),
            rowIndex,
        }));
        const output = {
            candidates: [],
            failures: rows.map((row) => ({
                code: 'generation_failed' as const,
                input: row.input,
                message: 'Could not generate this row.',
                retryable: true,
                rowIndex: row.rowIndex,
            })),
        };
        const generate = vi.fn().mockResolvedValue({
            error: undefined,
            object: output,
            tripwire: undefined,
            usage: { inputTokens: 50_000, outputTokens: 1_000 },
        });
        const generator = createMastraPastedTermsProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryPastedTermsGenerationStructuredAgent,
        });

        await expect(
            generator.generate({
                ...request(rows),
                input: {
                    ...request(rows).input,
                    sharedContext: '漢'.repeat(1_000),
                },
                providerBudget: {
                    ...defaultDictionaryGenerationProviderBudgetPolicy,
                    maxCostMicrosPerAttempt: 10_000,
                    maxInputTokensPerAttempt: Math.floor(262_144 / 5),
                    maxOutputTokensPerAttempt: 8_192,
                },
            }),
        ).resolves.toMatchObject({
            proposal: { failures: expect.any(Array) },
            usage: { inputTokens: 50_000, outputTokens: 1_000 },
        });
        expect(generate).toHaveBeenCalledOnce();
    });

    it('fails live capability creation below the full five-chunk envelope and registers the canonical agent', () => {
        expect(() =>
            createPastedTermsProposalGenerator({
                mode: 'mastra',
                model: 'openai/gpt-4o-mini',
                providerBudget: {
                    ...defaultDictionaryGenerationProviderBudgetPolicy,
                    maxOutputTokensPerAttempt: 1_024,
                },
            }),
        ).toThrow(PastedTermsProposalGeneratorCapabilityError);
        expect(() =>
            createPastedTermsProposalGenerator({
                mode: 'mastra',
                model: 'openai/gpt-4o-mini',
                providerBudget: {
                    ...defaultDictionaryGenerationProviderBudgetPolicy,
                    maxInputTokensPerAttempt: 262_143,
                },
            }),
        ).toThrow(PastedTermsProposalGeneratorCapabilityError);

        expect(
            createCanonicalMastra({
                dictionaryPastedTermsGeneration: {
                    model: 'openai/gpt-4o-mini',
                },
            }).listAgents(),
        ).toHaveProperty('dictionaryPastedTermsGenerationAgent');
    });
});
