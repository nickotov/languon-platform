import { describe, it, expect } from 'vitest';
import {
    selectionProviderInput,
    selectionCardValues,
    SelectionOccurrenceSchema,
} from '../../../../../src/modules/dictionaries/domain/text-selection';
import { defaultDictionarySettings } from '../../../../../src/modules/dictionaries/domain/settings';
const occurrence = {
    phrase: 'bank',
    sentence: 'The bank is not the river bank.',
    startOffset: 4,
    endOffset: 8,
    previousSentence: 'She needed money.',
    nextSentence: 'She went inside.',
    sourceLanguageTag: 'en',
    targetLanguageTag: 'fr',
};
describe('text selection contextual card authoring', () => {
    it('retains the exact occurrence and complete neighboring context independently of semantic dictionary context', () => {
        const longSentence = 'x'.repeat(5000) + ' bank.';
        const input = selectionProviderInput(
            {
                ...occurrence,
                sentence: longSentence,
                startOffset: 5001,
                endOffset: 5005,
            },
            defaultDictionarySettings,
            'Financial vocabulary',
        );
        expect(input.occurrenceContext).toEqual({
            sentence: longSentence,
            previousSentence: occurrence.previousSentence,
            nextSentence: occurrence.nextSentence,
            startOffset: 5001,
            endOffset: 5005,
        });
        expect(input.translationContext).toBe('Financial vocabulary');
    });
    it('enables every requested card field and preserves dictionary field languages and transcription settings', () => {
        const settings = {
            ...defaultDictionarySettings,
            definitionEnabled: false,
            exampleEnabled: false,
            exampleTranslationEnabled: false,
            definitionLanguageRole: 'source' as const,
            exampleLanguageRole: 'target' as const,
            transcriptionEnabled: false,
        };
        const input = selectionProviderInput(occurrence, settings, null);
        expect(input.requestedFields).toEqual([
            'source',
            'translation',
            'definition',
            'example',
            'exampleTranslation',
        ]);
        expect(input.effectiveSettings).toMatchObject({
            definitionEnabled: true,
            exampleEnabled: true,
            exampleTranslationEnabled: true,
            definitionLanguage: 'source',
            exampleLanguage: 'target',
            exampleTranslationLanguage: 'source',
            transcriptionEnabled: false,
        });
        expect(settings.exampleEnabled).toBe(false);
    });
    it('rejects a phrase that does not identify the exact selected substring', () => {
        expect(() =>
            SelectionOccurrenceSchema.parse({
                ...occurrence,
                startOffset: 0,
                endOffset: 4,
            }),
        ).toThrow();
        expect(() =>
            SelectionOccurrenceSchema.parse({ ...occurrence, phrase: ' bank' }),
        ).toThrow();
    });
    it('requires all generated card fields before saving and rejects unrequested output', () => {
        const input = selectionProviderInput(
            occurrence,
            { ...defaultDictionarySettings, transcriptionEnabled: false },
            null,
        );
        const output = {
            sourceResult: { kind: 'unchanged' as const },
            suggestions: [
                { field: 'translation' as const, value: 'banque' },
                {
                    field: 'definition' as const,
                    value: 'A financial institution',
                },
                { field: 'example' as const, value: 'She went to the bank.' },
                {
                    field: 'exampleTranslation' as const,
                    value: 'Elle est allée à la banque.',
                },
            ],
        };
        expect(selectionCardValues(input, output)).toMatchObject({
            translation: 'banque',
            definition: 'A financial institution',
            transcription: null,
        });
        expect(() =>
            selectionCardValues(input, {
                ...output,
                suggestions: output.suggestions.slice(0, 3),
            }),
        ).toThrow();
    });
    it.each([
        ['parasol', 'Le parasol est ouvert.', 'le parasol'],
        ['femme', 'La femme est arrivée.', 'la femme'],
        ['a mangé', 'La femme a mangé.', 'a mangé'],
        ['femme a mangé', 'Cette femme a mangé.', 'la femme a mangé'],
    ])(
        'uses shared canonical Source output for %s without changing the occurrence',
        (phrase, sentence, canonical) => {
            const startOffset = sentence.indexOf(phrase);
            const input = selectionProviderInput(
                {
                    ...occurrence,
                    phrase,
                    sentence,
                    startOffset,
                    endOffset: startOffset + phrase.length,
                    sourceLanguageTag: 'fr',
                    targetLanguageTag: 'en',
                },
                { ...defaultDictionarySettings, transcriptionEnabled: false },
                null,
            );
            const values = selectionCardValues(input, {
                sourceResult:
                    canonical === phrase
                        ? { kind: 'unchanged' }
                        : { kind: 'suggested', value: canonical },
                suggestions: [
                    { field: 'translation', value: 'contextual translation' },
                    { field: 'definition', value: 'contextual definition' },
                    { field: 'example', value: 'contextual example' },
                    {
                        field: 'exampleTranslation',
                        value: 'translated example',
                    },
                ],
            });
            expect(values.source).toBe(canonical);
            expect(input.source).toBe(phrase);
            expect(input.occurrenceContext).toMatchObject({
                sentence,
                startOffset,
                endOffset: startOffset + phrase.length,
            });
            expect(
                input.fieldContext.find((entry) => entry.field === 'source')
                    ?.currentValue,
            ).toBe(phrase);
        },
    );
    it('supports queued legacy inputs that did not request Source', () => {
        const current = selectionProviderInput(
            occurrence,
            { ...defaultDictionarySettings, transcriptionEnabled: false },
            null,
        );
        const legacy = {
            ...current,
            requestedFields: current.requestedFields.filter(
                (field) => field !== 'source',
            ),
            fieldContext: current.fieldContext.filter(
                (entry) => entry.field !== 'source',
            ),
        };
        const delta = {
            suggestions: legacy.requestedFields.map((field) => ({
                field: field as 'translation',
                value: `generated ${field}`,
            })),
        };
        expect(selectionCardValues(legacy, delta).source).toBe(
            occurrence.phrase,
        );
        expect(() => selectionCardValues(current, delta)).toThrow(
            'Source exactly when requested',
        );
    });
});
