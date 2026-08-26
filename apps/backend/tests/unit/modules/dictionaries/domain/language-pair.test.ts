import { describe, expect, it } from 'vitest';

import {
    changeDictionaryLanguagePair,
    type InvalidDictionaryLanguagePairError,
    validateDictionaryLanguagePair,
} from '../../../../../src/modules/dictionaries/domain/language-pair';

const supportedTags = new Set(['de', 'en', 'fr', 'zh-Hans']);
const supports = (tag: string) => supportedTags.has(tag);

describe('dictionary language pair', () => {
    it('canonicalizes supported BCP 47 tags and requires distinct languages', () => {
        expect(
            validateDictionaryLanguagePair(
                {
                    sourceLanguageTag: ' zh-hans ',
                    targetLanguageTag: 'en',
                },
                supports,
            ),
        ).toEqual({
            sourceLanguageTag: 'zh-Hans',
            targetLanguageTag: 'en',
        });

        expect(() =>
            validateDictionaryLanguagePair(
                { sourceLanguageTag: 'en', targetLanguageTag: 'en' },
                supports,
            ),
        ).toThrowError(
            expect.objectContaining<
                Partial<InvalidDictionaryLanguagePairError>
            >({ reason: 'same_language' }),
        );
    });

    it('delegates catalog membership instead of embedding a database enum', () => {
        expect(() =>
            validateDictionaryLanguagePair(
                { sourceLanguageTag: 'en', targetLanguageTag: 'nl' },
                supports,
            ),
        ).toThrowError(
            expect.objectContaining<
                Partial<InvalidDictionaryLanguagePairError>
            >({ reason: 'unsupported_language' }),
        );
    });

    it('allows a pair change only while the dictionary has no cards', () => {
        const current = {
            sourceLanguageTag: 'en',
            targetLanguageTag: 'de',
        };
        const next = { sourceLanguageTag: 'en', targetLanguageTag: 'fr' };

        expect(
            changeDictionaryLanguagePair({
                cardCount: 0,
                current,
                next,
                supportsLanguageTag: supports,
            }),
        ).toEqual(next);
        expect(() =>
            changeDictionaryLanguagePair({
                cardCount: 1,
                current,
                next,
                supportsLanguageTag: supports,
            }),
        ).toThrowError(
            expect.objectContaining<
                Partial<InvalidDictionaryLanguagePairError>
            >({ reason: 'locked' }),
        );
        expect(
            changeDictionaryLanguagePair({
                cardCount: 1,
                current,
                next: { ...current },
                supportsLanguageTag: supports,
            }),
        ).toEqual(current);
    });
});
