import { describe, expect, it, vi } from 'vitest';

import { createCanonicalMastra } from '../../../../../../src/mastra/composition';

import {
    createMastraImportPairsProposalGenerator,
    createImportPairsProposalGenerator,
    DeterministicImportPairsProposalGenerator,
} from '../../../../../../src/modules/dictionaries/infrastructure/ai/import-pairs-proposal-generators';

const request = {
    idempotencyKey: 'job/import-chunk/1-of-1',
    input: {
        format: 'import-pairs:v1' as const,
        importFingerprint:
            'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        instruction: null,
        predecessor: {
            jobId: '33333333-3333-4333-8333-333333333333',
            rowIndexes: [72],
        },
        effectiveSettings: {
            transcriptionCustomLabel: null,
            definitionEnabled: true,
            definitionLanguage: 'target' as const,
            exampleEnabled: true,
            exampleLanguage: 'source' as const,
            exampleTranslationEnabled: true,
            exampleTranslationLanguage: 'target' as const,
            transcriptionEnabled: true,
            transcriptionNotation: 'ipa' as const,
        },
        context: {
            dictionaryId: '11111111-1111-4111-8111-111111111111',
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            sourceLanguage: 'en',
            targetLanguage: 'es',
        },
        rows: [
            {
                rowIndex: 72,
                source: 'bank',
                translation: 'banco',
                lineage: {
                    importFingerprint:
                        'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                    importedRowIndex: 72,
                },
            },
        ],
    },
    providerBudget: {
        maxCostMicrosPerAttempt: 1_000_000,
        maxInputTokensPerAttempt: 262_144,
        maxOutputTokensPerAttempt: 40_960,
        inputCostMicrosPerMillionTokens: 1,
        outputCostMicrosPerMillionTokens: 1,
    },
    signal: new AbortController().signal,
};

describe('deterministic import-pairs provider', () => {
    it('fails live activation closed below the five-chunk envelope', () => {
        expect(() =>
            createImportPairsProposalGenerator({
                mode: 'mastra',
                model: {
                    apiKey: 'test',
                    id: 'openai/model',
                    url: 'https://invalid.test',
                },
                providerBudget: {
                    ...request.providerBudget,
                    maxOutputTokensPerAttempt: 40_959,
                },
            }),
        ).toThrow(/262144 input-token and 40960 output-token/);
    });

    it('preserves trusted core pairs and enriches only optional fields', async () => {
        const result =
            await new DeterministicImportPairsProposalGenerator().generate(
                request,
            );
        expect(result.proposal.candidates[0]).toMatchObject({
            rowIndex: 72,
            source: 'bank',
            translation: 'banco',
            candidate: {
                values: {
                    source: 'bank',
                    translation: 'banco',
                    definition: 'Imported meaning of bank',
                },
            },
        });
        expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    });

    it('validates live structured output against the exact trusted pair', async () => {
        const valid = (
            await new DeterministicImportPairsProposalGenerator().generate(
                request,
            )
        ).proposal;
        const generate = vi.fn().mockResolvedValue({
            object: valid,
            usage: { inputTokens: 10, outputTokens: 20 },
        });
        const provider = createMastraImportPairsProposalGenerator({
            agent: { generate },
        });
        await expect(provider.generate(request)).resolves.toMatchObject({
            proposal: valid,
            usage: { inputTokens: 10, outputTokens: 20 },
        });
        expect(generate).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                runId: 'job/import-chunk/1-of-1',
                toolChoice: 'none',
                tracingOptions: { hideInput: true, hideOutput: true },
            }),
        );
        const providerMessage = generate.mock.calls[0]?.[0];
        expect(JSON.parse(providerMessage)).toEqual({
            effectiveSettings: request.input.effectiveSettings,
            instruction: null,
            rows: [{ rowIndex: 72, source: 'bank', translation: 'banco' }],
            sourceLanguage: 'en',
            targetLanguage: 'es',
        });
        expect(providerMessage).not.toContain('dictionaryId');
        expect(providerMessage).not.toContain('importFingerprint');
        expect(providerMessage).not.toContain('lineage');
        expect(providerMessage).not.toContain('predecessor');
        expect(providerMessage).not.toContain(
            'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        );
        expect(providerMessage).not.toContain(
            '33333333-3333-4333-8333-333333333333',
        );

        const changed = structuredClone(valid);
        changed.candidates[0]!.source = 'changed';
        generate.mockResolvedValueOnce({
            object: changed,
            usage: { inputTokens: 10, outputTokens: 20 },
        });
        await expect(provider.generate(request)).rejects.toThrow();
    });

    it('rejects a resolver that alters either trusted core field', async () => {
        const generator = new DeterministicImportPairsProposalGenerator(
            () =>
                ({
                    candidates: [
                        {
                            rowIndex: 72,
                            source: 'bank',
                            translation: 'banco',
                            candidate: {
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
                                    source: 'changed',
                                    translation: 'banco',
                                    transcription: null,
                                    definition: null,
                                    example: null,
                                    exampleTranslation: null,
                                },
                            },
                            fieldFeedback: [],
                        },
                    ],
                    failures: [],
                    warnings: [],
                }) as never,
        );
        await expect(generator.generate(request)).rejects.toThrow();
    });

    it('registers the import-pairs primitive in canonical Mastra composition', () => {
        expect(
            createCanonicalMastra({
                dictionaryImportPairsGeneration: {
                    model: 'openai/gpt-4o-mini',
                },
            }).listAgents(),
        ).toHaveProperty('dictionaryImportPairsGenerationAgent');
    });
});
