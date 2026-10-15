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
});
