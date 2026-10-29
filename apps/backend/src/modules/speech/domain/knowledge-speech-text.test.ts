import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { knowledgeNarrationText } from './knowledge-speech-text';
it('uses explicit audio language, then transcript language, then note language', () => {
    const block = {
        id: randomUUID(),
        type: 'audio' as const,
        sourceText: 'Bonjour.',
    };
    expect(knowledgeNarrationText(block, 'en', 'ru')).toEqual({
        text: 'Bonjour.',
        language: 'en',
    });
    const transcribed = {
        ...block,
        transcript: {
            language: 'fr',
            segments: [{ id: randomUUID(), text: 'Bonjour.' }],
        },
    };
    expect(knowledgeNarrationText(transcribed, 'en', 'ru').language).toBe('fr');
    expect(
        knowledgeNarrationText(
            { ...transcribed, language: 'fr-CA' },
            'en',
            'ru',
        ).language,
    ).toBe('fr-CA');
    expect(
        knowledgeNarrationText({ ...block, language: 'fr-CA' }, null, 'ru')
            .language,
    ).toBe('fr-CA');
});
it('keeps vocabulary translation out of source-language narration', () => {
    expect(
        knowledgeNarrationText(
            {
                id: randomUUID(),
                type: 'vocabulary',
                language: 'fr',
                translationLanguage: 'ru',
                entries: [
                    {
                        id: randomUUID(),
                        term: 'bonjour',
                        translation: 'привет',
                        example: 'Bonjour Marie.',
                        exampleTranslation: 'Привет, Мари.',
                    },
                ],
            },
            'fr',
            'ru',
        ),
    ).toEqual({ text: 'bonjour\nBonjour Marie.', language: 'fr' });
});
it('narrates grammar examples in their language and requires explicit language for explanation-only rules', () => {
    expect(
        knowledgeNarrationText(
            {
                id: randomUUID(),
                type: 'grammar',
                language: 'fr',
                rule: 'Французское правило.',
                examples: [{ text: 'Je suis ici.', translation: 'Я здесь.' }],
            },
            'fr',
            'ru',
        ),
    ).toEqual({ text: 'Je suis ici.', language: 'fr' });
    const block = {
        id: randomUUID(),
        type: 'grammar' as const,
        language: 'fr',
        rule: 'Французское правило.',
    };
    expect(knowledgeNarrationText(block, 'fr', 'ru')).toEqual({
        text: block.rule,
        language: 'ru',
    });
    expect(() => knowledgeNarrationText(block, 'fr', null)).toThrow();
});
