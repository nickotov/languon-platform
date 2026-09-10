import { describe, expect, it, vi } from 'vitest';

import { createCanonicalMastra } from '../../../../../../src/mastra/composition';
import type { CardAuthoringProposalGeneratorRequest } from '../../../../../../src/modules/dictionaries/application/ports/card-authoring-proposal-generator';
import { defaultDictionaryGenerationProviderBudgetPolicy } from '../../../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import {
    CardAuthoringProposalGeneratorExecutionError,
    createMastraCardAuthoringProposalGenerator,
    DeterministicCardAuthoringProposalGenerator,
    type DictionaryCardAuthoringStructuredAgent,
} from '../../../../../../src/modules/dictionaries/infrastructure/ai/card-authoring-proposal-generators';
import { createDictionaryCardAuthoringAgent } from '../../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-card-authoring-agent';

const input = {
    sourceLanguage: 'en',
    targetLanguage: 'es',
    source: 'bank',
    effectiveSettings: {
        transcriptionCustomLabel: null,
        definitionEnabled: true,
        definitionLanguage: 'target',
        exampleEnabled: false,
        exampleLanguage: 'source',
        exampleTranslationEnabled: false,
        exampleTranslationLanguage: 'target',
        transcriptionEnabled: false,
        transcriptionNotation: 'ipa',
    },
    requestedFields: ['translation', 'definition'],
    fieldContext: [
        { field: 'translation', currentValue: null, excludedValues: [] },
        { field: 'definition', currentValue: null, excludedValues: [] },
    ],
} as const;

function request(
    requestedFields: CardAuthoringProposalGeneratorRequest['input']['requestedFields'] = [
        ...input.requestedFields,
    ],
): CardAuthoringProposalGeneratorRequest {
    return {
        idempotencyKey: 'authoring-request-0001',
        input: {
            ...input,
            requestedFields,
            fieldContext: input.fieldContext
                .filter((entry) => requestedFields.includes(entry.field))
                .map((entry) => ({
                    ...entry,
                    excludedValues: [...entry.excludedValues],
                })),
        },
        providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
        signal: new AbortController().signal,
    };
}

describe('dictionary card authoring proposal generators', () => {
    it('deterministically generates only the requested atomic fields', async () => {
        const generator = new DeterministicCardAuthoringProposalGenerator();
        await expect(
            generator.generate(request(['definition'])),
        ).resolves.toEqual({
            delta: {
                suggestions: [
                    { field: 'definition', value: 'Meaning of bank' },
                ],
            },
            usage: { inputTokens: 0, outputTokens: 0 },
        });
        await expect(
            generator.generate({
                ...request(['translation']),
                input: {
                    ...request(['translation']).input,
                    source: '漢'.repeat(200),
                },
            }),
        ).resolves.toMatchObject({
            delta: { suggestions: [{ field: 'translation' }] },
            usage: { inputTokens: 0, outputTokens: 0 },
        });
        await expect(
            generator.generate({
                ...request(['translation']),
                input: {
                    ...request(['translation']).input,
                    fieldContext: [
                        {
                            field: 'translation',
                            currentValue: null,
                            excludedValues: ['bank (es)'],
                        },
                    ],
                },
            }),
        ).resolves.toEqual({
            delta: {
                suggestions: [
                    {
                        field: 'translation',
                        value: 'bank (es) · alternative 1',
                    },
                ],
            },
            usage: { inputTokens: 0, outputTokens: 0 },
        });
    });

    it('rejects output for a field that was not requested', async () => {
        const generator = new DeterministicCardAuthoringProposalGenerator(
            () => ({
                suggestions: [{ field: 'example', value: 'Use bank.' }],
            }),
        );
        await expect(
            generator.generate(request(['definition'])),
        ).rejects.toBeInstanceOf(CardAuthoringProposalGeneratorExecutionError);
    });

    it('rejects missing requested fields and current or excluded duplicates', async () => {
        const missing = new DeterministicCardAuthoringProposalGenerator(() => ({
            suggestions: [],
        }));
        await expect(missing.generate(request())).rejects.toMatchObject({
            category: 'invalid_model_output',
        });

        const duplicate = new DeterministicCardAuthoringProposalGenerator(
            () => ({
                suggestions: [
                    { field: 'translation', value: 'banco' },
                    { field: 'definition', value: 'old definition' },
                ],
            }),
        );
        await expect(
            duplicate.generate({
                ...request(),
                input: {
                    ...request().input,
                    fieldContext: [
                        {
                            field: 'translation',
                            currentValue: 'banco',
                            excludedValues: [],
                        },
                        {
                            field: 'definition',
                            currentValue: null,
                            excludedValues: ['old definition'],
                        },
                    ],
                },
            }),
        ).rejects.toMatchObject({ category: 'invalid_model_output' });
    });

    it('dispatches only the provider DTO with tools disabled and hidden traces', async () => {
        const delta = {
            suggestions: [
                { field: 'translation', value: 'banco' },
                { field: 'definition', value: 'Entidad financiera.' },
            ],
        } as const;
        const generate = vi.fn().mockResolvedValue({
            error: undefined,
            object: delta,
            tripwire: undefined,
            usage: { inputTokens: 100, outputTokens: 20 },
        });
        const generator = createMastraCardAuthoringProposalGenerator({
            agent: {
                generate,
            } satisfies DictionaryCardAuthoringStructuredAgent,
        });
        const generationRequest = request();
        await expect(generator.generate(generationRequest)).resolves.toEqual({
            delta,
            usage: { inputTokens: 100, outputTokens: 20 },
        });
        const serialized = generate.mock.calls[0]![0] as string;
        expect(JSON.parse(serialized)).toEqual(input);
        expect(serialized).not.toMatch(
            /dictionaryId|ownerId|predecessor|suggestionId|discardedSuggestionId/,
        );
        expect(serialized).not.toContain('private inactive field content');
        expect(generate).toHaveBeenCalledWith(expect.any(String), {
            abortSignal: generationRequest.signal,
            maxOutputTokens: 40_960,
            runId: 'authoring-request-0001',
            structuredOutput: { schema: expect.anything() },
            toolChoice: 'none',
            tracingOptions: { hideInput: true, hideOutput: true },
        });
    });

    it('registers the authoring agent in canonical Mastra composition', () => {
        const model = 'openai/gpt-4o-mini' as const;
        expect(createDictionaryCardAuthoringAgent({ model }).id).toBe(
            'dictionary-card-authoring-agent',
        );
        expect(
            createCanonicalMastra({
                dictionaryCardAuthoring: { model },
            }).listAgents().dictionaryCardAuthoringAgent?.id,
        ).toBe('dictionary-card-authoring-agent');
    });
});
