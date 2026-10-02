import { describe, expect, it } from 'vitest';
import {
    defaultFlashcardConfiguration,
    projectFlashcard,
    type FlashcardProjectionInput,
} from '../../../../../src/modules/learning/domain/flashcard-projection';
import {
    defaultDictionarySettings,
    inheritedCardSettingsOverrides,
    resolveCardSettings,
} from '../../../../../src/modules/dictionaries/domain/settings';

function fixture(): FlashcardProjectionInput {
    return {
        entryId: '00000000-0000-4000-8000-000000000001',
        learningVersion: 1,
        sourceLanguage: 'en',
        targetLanguage: 'ar',
        values: {
            source: 'book',
            translation: 'كتاب',
            transcription: null,
            definition: 'A book',
            example: 'A book.',
            exampleTranslation: 'كتاب.',
        },
        settings: resolveCardSettings({
            dictionary: {
                ...defaultDictionarySettings,
                definitionEnabled: true,
            },
            overrides: { ...inheritedCardSettingsOverrides },
        }),
        configuration: defaultFlashcardConfiguration,
    };
}
describe('flashcard projection', () => {
    it('uses semantic examples and the language direction, not physical field names', () => {
        const input = fixture();
        const item = projectFlashcard(input)!;
        expect(item.front[0]).toMatchObject({
            text: 'كتاب.',
            language: 'ar',
            direction: 'rtl',
            fallback: false,
        });
        expect(item.back[0]?.text).toBe('A book.');
        input.settings.exampleLanguageRole = 'target';
        input.settings.exampleTranslationLanguageRole = 'source';
        input.values.example = 'كتاب.';
        input.values.exampleTranslation = 'A book.';
        expect(projectFlashcard(input)).toEqual(item);
    });
    it('falls back when examples are absent or disabled without exposing dormant values', () => {
        const input = fixture();
        input.settings.exampleEnabled = false;
        input.settings.exampleTranslationEnabled = false;
        expect(projectFlashcard(input)!.front[0]).toMatchObject({
            field: 'translation',
            text: 'كتاب',
            fallback: true,
        });
        input.values.example = null;
        input.values.exampleTranslation = '   ';
        input.settings.exampleEnabled = true;
        input.settings.exampleTranslationEnabled = true;
        expect(projectFlashcard(input)!.back[0]).toMatchObject({
            field: 'source',
            text: 'book',
            fallback: true,
        });
    });
    it('deduplicates a word selected explicitly and as an example fallback', () => {
        const input = fixture();
        input.values.exampleTranslation = null;
        input.configuration = {
            front: ['targetExample', 'translation'],
            back: ['source'],
        };
        expect(projectFlashcard(input)!.front).toEqual([
            {
                field: 'translation',
                requestedFields: ['translation', 'targetExample'],
                text: 'كتاب',
                language: 'ar',
                direction: 'rtl',
                fallback: true,
            },
        ]);
    });
    it('omits missing optional fields and excludes an empty side', () => {
        const input = fixture();
        input.configuration = {
            front: ['transcription'],
            back: ['definition'],
        };
        expect(projectFlashcard(input)).toBeNull();
        input.configuration.front.push('source');
        expect(
            projectFlashcard(input)!.front.map((field) => field.field),
        ).toEqual(['source']);
        input.settings.definitionEnabled = false;
        expect(projectFlashcard(input)).toBeNull();
    });
    it('keeps fixed display order and content as plaintext', () => {
        const input = fixture();
        input.values.source = '<img src=x onerror=alert(1)>';
        input.configuration = {
            front: ['definition', 'source'],
            back: ['source'],
        };
        expect(
            projectFlashcard(input)!.front.map((field) => field.field),
        ).toEqual(['source', 'definition']);
        expect(projectFlashcard(input)!.front[0]?.text).toBe(
            input.values.source,
        );
    });
});
