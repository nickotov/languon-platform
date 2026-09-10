import { describe, expect, it } from 'vitest';

import {
    DictionaryCardAuthoringGenerationInputPayloadSchema,
    dictionaryCardAuthoringProviderInput,
    DictionaryCardAuthoringDuplicateSuggestionError,
    DictionaryCardAuthoringSuggestionLimitError,
    mergeDictionaryCardAuthoringProposal,
    resolveDictionaryCardAuthoringFields,
} from '../../../../../src/modules/dictionaries/domain/card-authoring';
import { parseDictionaryGenerationInput } from '../../../../../src/modules/dictionaries/domain/generation';

const settings = {
    transcriptionCustomLabel: null,
    definitionEnabled: true,
    definitionLanguage: 'target',
    exampleEnabled: true,
    exampleLanguage: 'source',
    exampleTranslationEnabled: true,
    exampleTranslationLanguage: 'target',
    transcriptionEnabled: false,
    transcriptionNotation: 'ipa',
} as const;
const overrides = {
    transcriptionCustomLabel: null,
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
    transcriptionEnabled: null,
    transcriptionNotation: null,
} as const;
const input = {
    format: 'card-authoring:v1',
    context: {
        dictionaryId: '11111111-1111-4111-8111-111111111111',
        expectedDictionaryVersion: 4,
        expectedSettingsVersion: 3,
        sourceLanguage: 'en',
        targetLanguage: 'es',
    },
    source: 'bank',
    draft: {
        values: {
            translation: null,
            transcription: null,
            definition: 'A financial institution.',
            example: null,
            exampleTranslation: null,
        },
        overrides,
    },
    effectiveSettings: settings,
    scope: { kind: 'all' },
} as const;

describe('dictionary card authoring domain', () => {
    it('targets translation and only enabled optional fields', () => {
        expect(
            resolveDictionaryCardAuthoringFields(settings, input.scope),
        ).toEqual([
            'translation',
            'definition',
            'example',
            'exampleTranslation',
        ]);
        expect(
            resolveDictionaryCardAuthoringFields(settings, {
                kind: 'field',
                field: 'definition',
            }),
        ).toEqual(['definition']);
        expect(
            resolveDictionaryCardAuthoringFields(settings, {
                kind: 'field',
                field: 'transcription',
            }),
        ).toEqual([]);
    });

    it('requires all-fields scope for an initial request and an enabled successor field', () => {
        expect(
            DictionaryCardAuthoringGenerationInputPayloadSchema.parse(input),
        ).toBeDefined();
        expect(parseDictionaryGenerationInput(input).format).toBe(
            'card-authoring:v1',
        );
        expect(() =>
            DictionaryCardAuthoringGenerationInputPayloadSchema.parse({
                ...input,
                scope: { kind: 'field', field: 'definition' },
            }),
        ).toThrow();
        expect(() =>
            DictionaryCardAuthoringGenerationInputPayloadSchema.parse({
                ...input,
                scope: { kind: 'field', field: 'transcription' },
                predecessor: {
                    jobId: '22222222-2222-4222-8222-222222222222',
                    discardedSuggestionIds: [],
                },
                excludedValues: [{ field: 'transcription', values: ['old'] }],
            }),
        ).toThrow();
    });

    it('projects an ID-free bounded provider DTO', () => {
        const providerInput = dictionaryCardAuthoringProviderInput({
            ...input,
            draft: {
                ...input.draft,
                values: {
                    ...input.draft.values,
                    transcription: 'private inactive transcription',
                },
            },
            predecessor: {
                jobId: '22222222-2222-4222-8222-222222222222',
                discardedSuggestionIds: [
                    '33333333-3333-4333-8333-333333333333',
                ],
            },
            excludedValues: [
                { field: 'translation', values: ['banco'] },
                {
                    field: 'definition',
                    values: ['A previous definition.'],
                },
                { field: 'example', values: ['Previous example.'] },
                {
                    field: 'exampleTranslation',
                    values: ['Ejemplo anterior.'],
                },
            ],
        });
        expect(providerInput).toEqual({
            sourceLanguage: 'en',
            targetLanguage: 'es',
            source: 'bank',
            effectiveSettings: settings,
            requestedFields: [
                'translation',
                'definition',
                'example',
                'exampleTranslation',
            ],
            fieldContext: [
                {
                    field: 'translation',
                    currentValue: null,
                    excludedValues: ['banco'],
                },
                {
                    field: 'definition',
                    currentValue: 'A financial institution.',
                    excludedValues: ['A previous definition.'],
                },
                {
                    field: 'example',
                    currentValue: null,
                    excludedValues: ['Previous example.'],
                },
                {
                    field: 'exampleTranslation',
                    currentValue: null,
                    excludedValues: ['Ejemplo anterior.'],
                },
            ],
        });
        expect(JSON.stringify(providerInput)).not.toMatch(
            /dictionaryId|owner|version|predecessor|suggestionId/,
        );
        expect(JSON.stringify(providerInput)).not.toContain(
            'private inactive transcription',
        );
    });

    it('retains cross-field exclusion history while projecting only the requested field', () => {
        const successor =
            DictionaryCardAuthoringGenerationInputPayloadSchema.parse({
                ...input,
                excludedValues: [
                    { field: 'translation', values: ['banco'] },
                    {
                        field: 'transcription',
                        values: ['previous disabled transcription'],
                    },
                    {
                        field: 'definition',
                        values: ['A previous definition.'],
                    },
                ],
                predecessor: {
                    discardedSuggestionIds: [],
                    jobId: '22222222-2222-4222-8222-222222222222',
                },
                scope: { field: 'definition', kind: 'field' },
            });
        expect(successor.excludedValues).toHaveLength(3);
        expect(dictionaryCardAuthoringProviderInput(successor)).toMatchObject({
            fieldContext: [
                {
                    excludedValues: ['A previous definition.'],
                    field: 'definition',
                },
            ],
            requestedFields: ['definition'],
        });
    });

    it('preserves stable choices, removes discards, rejects duplicates, and bounds each field', () => {
        const predecessor = {
            source: 'bank',
            suggestions: [
                {
                    id: '11111111-1111-4111-8111-111111111111',
                    field: 'translation' as const,
                    value: 'banco',
                },
                {
                    id: '22222222-2222-4222-8222-222222222222',
                    field: 'definition' as const,
                    value: 'old',
                },
            ],
        };
        const ids = ['33333333-3333-4333-8333-333333333333'];
        expect(
            mergeDictionaryCardAuthoringProposal({
                source: 'bank',
                predecessor,
                discardedSuggestionIds: [predecessor.suggestions[1]!.id],
                delta: {
                    suggestions: [
                        { field: 'definition', value: 'entidad financiera' },
                    ],
                },
                requestedFields: ['definition'],
                nextId: () => ids.shift()!,
            }),
        ).toEqual({
            source: 'bank',
            suggestions: [
                predecessor.suggestions[0],
                {
                    id: '33333333-3333-4333-8333-333333333333',
                    field: 'definition',
                    value: 'entidad financiera',
                },
            ],
        });

        expect(() =>
            mergeDictionaryCardAuthoringProposal({
                source: 'bank',
                predecessor,
                discardedSuggestionIds: [],
                delta: {
                    suggestions: [{ field: 'translation', value: 'banco' }],
                },
                requestedFields: ['translation'],
                nextId: () => '33333333-3333-4333-8333-333333333333',
            }),
        ).toThrow(DictionaryCardAuthoringDuplicateSuggestionError);

        expect(() =>
            mergeDictionaryCardAuthoringProposal({
                source: 'bank',
                predecessor: {
                    source: 'bank',
                    suggestions: Array.from({ length: 6 }, (_, index) => ({
                        id: `11111111-1111-4111-8111-11111111111${index}`,
                        field: 'translation' as const,
                        value: `choice ${index}`,
                    })),
                },
                discardedSuggestionIds: [],
                delta: {
                    suggestions: [{ field: 'translation', value: 'seventh' }],
                },
                requestedFields: ['translation'],
                nextId: () => '33333333-3333-4333-8333-333333333333',
            }),
        ).toThrow(DictionaryCardAuthoringSuggestionLimitError);
    });
});
