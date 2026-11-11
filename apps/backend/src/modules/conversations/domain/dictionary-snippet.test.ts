import { describe, expect, it } from 'vitest';
import { DictionaryChatGenerationContextSchema } from '@languon/contracts';
import { validateDictionaryChatSnippet } from './dictionary-snippet';

const context = DictionaryChatGenerationContextSchema.parse({
    sourceLanguage: 'es',
    targetLanguage: 'en',
    translationContext: null,
    dictionaryVersion: 1,
    settingsVersion: 1,
    settings: {
        definitionEnabled: true,
        definitionLanguage: 'source',
        exampleEnabled: true,
        exampleLanguage: 'source',
        exampleTranslationEnabled: true,
        transcriptionEnabled: true,
        transcriptionNotation: 'ipa',
        transcriptionCustomLabel: null,
    },
});
const card = {
    source: 'uno',
    translation: 'one',
    definition: 'A number',
    transcription: 'uno',
    example: 'Tengo uno.',
    exampleTranslation: 'I have one.',
};

describe('dictionary snippet completeness', () => {
    it.each([
        'definition',
        'transcription',
        'example',
        'exampleTranslation',
    ] as const)('rejects missing enabled %s', (field) => {
        expect(() =>
            validateDictionaryChatSnippet(
                { title: 'Words', cards: [{ ...card, [field]: null }] },
                context,
            ),
        ).toThrow('every enabled field');
    });

    it('normalizes canonical text and permits bounded disabled fields', () => {
        const result = validateDictionaryChatSnippet(
            { title: 'Words', cards: [{ ...card, source: ' uno ' }] },
            context,
        );

        expect(result.cards[0]?.source).toBe('uno');
        expect(
            validateDictionaryChatSnippet(
                {
                    title: 'Words',
                    cards: [
                        { ...card, example: null, exampleTranslation: null },
                    ],
                },
                {
                    ...context,
                    settings: {
                        ...context.settings,
                        exampleEnabled: false,
                        exampleTranslationEnabled: false,
                    },
                },
            ).cards,
        ).toHaveLength(1);
    });
});
