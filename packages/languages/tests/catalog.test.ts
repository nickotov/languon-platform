import { describe, expect, it } from 'vitest';

import {
    canonicalizeLanguageTag,
    getLanguage,
    getLanguageDisplayName,
    INTERFACE_LOCALES,
    isLanguageTag,
    LANGUAGE_CATALOG,
    LANGUAGE_CATALOG_VERSION,
    SUPPORTED_LANGUAGE_TAGS,
} from '../src/index';

describe('language catalog', () => {
    it('publishes the immutable versioned starter catalog in canonical order', () => {
        expect(LANGUAGE_CATALOG_VERSION).toBe(1);
        expect(LANGUAGE_CATALOG.map(({ tag }) => tag)).toEqual([
            'ar',
            'de',
            'en',
            'es',
            'fr',
            'he',
            'hi',
            'it',
            'ja',
            'ko',
            'pl',
            'pt',
            'ru',
            'tr',
            'uk',
            'zh-Hans',
        ]);
        expect(Object.isFrozen(LANGUAGE_CATALOG)).toBe(true);
        expect(Object.isFrozen(LANGUAGE_CATALOG[0])).toBe(true);
        expect(Object.isFrozen(LANGUAGE_CATALOG[0]?.displayNames)).toBe(true);
        expect(Object.isFrozen(SUPPORTED_LANGUAGE_TAGS)).toBe(true);
        expect(Object.isFrozen(INTERFACE_LOCALES)).toBe(true);
        expect(SUPPORTED_LANGUAGE_TAGS).toHaveLength(16);
    });

    it('provides complete interface-locale names and direction metadata', () => {
        for (const language of LANGUAGE_CATALOG) {
            for (const locale of INTERFACE_LOCALES) {
                expect(language.displayNames[locale]).not.toBe('');
            }
        }

        expect(getLanguage('ar')?.direction).toBe('rtl');
        expect(getLanguage('he')?.direction).toBe('rtl');
        expect(getLanguage('en')?.direction).toBe('ltr');
        expect(getLanguageDisplayName('ZH-hans', 'ru')).toBe(
            'Китайский (упрощённый)',
        );
    });

    it('separates canonical persisted tags from canonical lookup', () => {
        expect(isLanguageTag('zh-Hans')).toBe(true);
        expect(isLanguageTag('ZH-hans')).toBe(false);
        expect(isLanguageTag('en-US')).toBe(false);
        expect(canonicalizeLanguageTag('ZH-hans')).toBe('zh-Hans');
        expect(canonicalizeLanguageTag('iw')).toBe('he');
        expect(canonicalizeLanguageTag('en-US')).toBeNull();
        expect(canonicalizeLanguageTag('not_a_tag')).toBeNull();
        expect(getLanguage('iw')?.tag).toBe('he');
    });
});
