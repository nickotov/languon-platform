import { describe, expect, it } from 'vitest';

import {
    AcceptDictionaryCardAuthoringGenerationJobRequestSchema,
    DictionaryCardAuthoringAcceptedOutcomeSchema,
    DictionaryCardAuthoringGenerationJobSchema,
    DictionaryCardAuthoringProposalSchema,
    EnqueueDictionaryCardAuthoringGenerationRequestSchema,
    ReadDictionaryGenerationCapabilitiesResponseSchema,
    RegenerateDictionaryCardAuthoringGenerationRequestSchema,
} from '../src/dictionaries';

const overrides = {
    transcriptionEnabled: null,
    transcriptionNotation: null,
    transcriptionCustomLabel: null,
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
} as const;
const draft = {
    values: {
        translation: null,
        transcription: null,
        definition: null,
        example: null,
        exampleTranslation: null,
    },
    overrides,
};

describe('dictionary card authoring contracts', () => {
    it('accepts source-only initial authoring and publishes its capability', () => {
        expect(
            EnqueueDictionaryCardAuthoringGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                source: 'bank',
                draft,
                scope: { kind: 'all' },
            }),
        ).toBeDefined();
        expect(() =>
            EnqueueDictionaryCardAuthoringGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                source: 'bank',
                draft,
                scope: { kind: 'field', field: 'translation' },
            }),
        ).toThrow();
        expect(
            ReadDictionaryGenerationCapabilitiesResponseSchema.parse({
                singleCardGeneration: { available: false },
                cardAuthoringGeneration: { available: true },
                pastedTermsGeneration: { available: false },
                importPairsGeneration: { available: false },
                documentTermsGeneration: { available: false },
                documentOcr: { available: false },
            }).cardAuthoringGeneration.available,
        ).toBe(true);
    });

    it('supports field/all successors with unique discarded identities', () => {
        const base = {
            format: 'card-authoring:v1',
            expectedDictionaryVersion: 4,
            expectedSettingsVersion: 3,
            source: 'bank',
            draft,
            discardedSuggestionIds: ['11111111-1111-4111-8111-111111111111'],
        } as const;
        expect(
            RegenerateDictionaryCardAuthoringGenerationRequestSchema.parse({
                ...base,
                scope: { kind: 'field', field: 'definition' },
            }),
        ).toBeDefined();
        expect(
            RegenerateDictionaryCardAuthoringGenerationRequestSchema.parse({
                ...base,
                scope: { kind: 'all' },
            }),
        ).toBeDefined();
        expect(() =>
            RegenerateDictionaryCardAuthoringGenerationRequestSchema.parse({
                ...base,
                scope: { kind: 'field', field: 'source' },
            }),
        ).toThrow();
        expect(() =>
            RegenerateDictionaryCardAuthoringGenerationRequestSchema.parse({
                ...base,
                scope: { kind: 'all' },
                discardedSuggestionIds: [
                    base.discardedSuggestionIds[0],
                    base.discardedSuggestionIds[0],
                ],
            }),
        ).toThrow();
    });

    it('keeps cumulative stable suggestions unique and bounded to six per field', () => {
        const suggestions = Array.from({ length: 6 }, (_, index) => ({
            id: `11111111-1111-4111-8111-11111111111${index}`,
            field: 'translation',
            value: `banco ${index}`,
        }));
        expect(
            DictionaryCardAuthoringProposalSchema.parse({
                source: 'bank',
                suggestions,
            }),
        ).toBeDefined();
        expect(() =>
            DictionaryCardAuthoringProposalSchema.parse({
                source: 'bank',
                suggestions: [
                    ...suggestions,
                    {
                        id: '22222222-2222-4222-8222-222222222222',
                        field: 'translation',
                        value: 'orilla',
                    },
                ],
            }),
        ).toThrow();
    });

    it('accepts manual or AI-assisted candidates with unique selected identities', () => {
        const candidate = {
            values: {
                source: 'bank',
                translation: 'banco',
                transcription: null,
                definition: null,
                example: null,
                exampleTranslation: null,
            },
            overrides,
        };
        expect(
            AcceptDictionaryCardAuthoringGenerationJobRequestSchema.parse({
                format: 'card-authoring:v1',
                candidate,
                selectedSuggestions: [
                    {
                        field: 'translation',
                        suggestionId: '11111111-1111-4111-8111-111111111111',
                    },
                ],
            }),
        ).toBeDefined();
        expect(
            AcceptDictionaryCardAuthoringGenerationJobRequestSchema.parse({
                format: 'card-authoring:v1',
                candidate,
                selectedSuggestions: [],
            }),
        ).toBeDefined();
        expect(() =>
            AcceptDictionaryCardAuthoringGenerationJobRequestSchema.parse({
                format: 'card-authoring:v1',
                candidate,
                selectedSuggestions: [
                    {
                        field: 'translation',
                        suggestionId: '11111111-1111-4111-8111-111111111111',
                    },
                    {
                        field: 'translation',
                        suggestionId: '22222222-2222-4222-8222-222222222222',
                    },
                ],
            }),
        ).toThrow();
    });

    it('reports duplicate-source acceptance and a safe nonretryable generation conflict', () => {
        expect(
            DictionaryCardAuthoringAcceptedOutcomeSchema.parse({
                cardId: '11111111-1111-4111-8111-111111111111',
                cardVersion: 1,
                dictionaryVersion: 2,
                duplicateSource: true,
            }).duplicateSource,
        ).toBe(true);
        expect(() =>
            DictionaryCardAuthoringAcceptedOutcomeSchema.parse({
                cardId: '11111111-1111-4111-8111-111111111111',
                cardVersion: 1,
                dictionaryVersion: 2,
            }),
        ).toThrow();
        expect(
            DictionaryCardAuthoringGenerationJobSchema.parse({
                id: '11111111-1111-4111-8111-111111111111',
                kind: 'card-authoring',
                format: 'card-authoring:v1',
                state: 'failed',
                dictionaryId: '22222222-2222-4222-8222-222222222222',
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                sourceLanguage: 'en',
                targetLanguage: 'es',
                progress: { stage: 'terminal', percent: 100 },
                cancellationRequested: false,
                proposal: null,
                failure: {
                    code: 'generation_conflict',
                    message: 'Generation state changed. Try again.',
                    retryable: false,
                },
                outcome: null,
                createdAt: '2026-08-26T12:00:00.000Z',
                updatedAt: '2026-08-26T12:01:00.000Z',
                completedAt: '2026-08-26T12:01:00.000Z',
                expiresAt: null,
            }).failure,
        ).toMatchObject({ code: 'generation_conflict', retryable: false });
    });
});
