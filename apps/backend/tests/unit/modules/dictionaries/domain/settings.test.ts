import { describe, expect, it } from 'vitest';

import {
    assertCardSettingsOverrideTransition,
    assertDictionarySettingsTransition,
    defaultDictionarySettings,
    inheritedCardSettingsOverrides,
    type InvalidDictionarySettingsError,
    resolveCardSettings,
} from '../../../../../src/modules/dictionaries/domain/settings';

describe('dictionary card settings inheritance', () => {
    it('resolves inherited defaults and derives the opposite example translation role', () => {
        expect(
            resolveCardSettings({
                dictionary: { ...defaultDictionarySettings },
                overrides: { ...inheritedCardSettingsOverrides },
            }),
        ).toEqual({
            customNotationLabel: null,
            definitionEnabled: false,
            definitionLanguageRole: 'source',
            exampleEnabled: true,
            exampleLanguageRole: 'source',
            exampleTranslationEnabled: true,
            exampleTranslationLanguageRole: 'target',
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
        });

        expect(
            resolveCardSettings({
                dictionary: { ...defaultDictionarySettings },
                overrides: {
                    ...inheritedCardSettingsOverrides,
                    exampleLanguageRole: 'target',
                },
            }).exampleTranslationLanguageRole,
        ).toBe('source');
    });

    it('preserves raw values and subordinate overrides while a parent is disabled', () => {
        const overrides = {
            ...inheritedCardSettingsOverrides,
            exampleEnabled: 'disabled' as const,
            exampleLanguageRole: 'target' as const,
            exampleTranslationEnabled: 'enabled' as const,
        };

        const effective = resolveCardSettings({
            dictionary: { ...defaultDictionarySettings },
            overrides,
        });

        expect(overrides).toMatchObject({
            exampleLanguageRole: 'target',
            exampleTranslationEnabled: 'enabled',
        });
        expect(effective).toMatchObject({
            exampleEnabled: false,
            exampleLanguageRole: 'target',
            exampleTranslationEnabled: false,
            exampleTranslationLanguageRole: 'source',
        });
    });

    it('rejects a new direct translation enable under a disabled example', () => {
        expect(() =>
            assertCardSettingsOverrideTransition({
                dictionary: {
                    ...defaultDictionarySettings,
                    exampleEnabled: false,
                    exampleTranslationEnabled: false,
                },
                next: {
                    ...inheritedCardSettingsOverrides,
                    exampleTranslationEnabled: 'enabled',
                },
                previous: null,
            }),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionarySettingsError>>({
                reason: 'example_translation_requires_example',
            }),
        );
    });

    it('allows a later parent disable to leave an enabled child dormant', () => {
        expect(() =>
            assertDictionarySettingsTransition({
                previous: { ...defaultDictionarySettings },
                next: {
                    ...defaultDictionarySettings,
                    exampleEnabled: false,
                    version: 2,
                },
            }),
        ).not.toThrow();
        expect(() =>
            assertCardSettingsOverrideTransition({
                dictionary: {
                    ...defaultDictionarySettings,
                    exampleEnabled: false,
                    version: 2,
                },
                next: {
                    ...inheritedCardSettingsOverrides,
                    exampleTranslationEnabled: 'enabled',
                },
                previous: {
                    ...inheritedCardSettingsOverrides,
                    exampleTranslationEnabled: 'enabled',
                },
            }),
        ).not.toThrow();
    });

    it('requires a resolved custom label only while custom transcription is enabled', () => {
        expect(() =>
            resolveCardSettings({
                dictionary: { ...defaultDictionarySettings },
                overrides: {
                    ...inheritedCardSettingsOverrides,
                    transcriptionEnabled: 'enabled',
                    transcriptionNotation: 'custom',
                },
            }),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionarySettingsError>>({
                reason: 'custom_label_required',
            }),
        );

        expect(
            resolveCardSettings({
                dictionary: { ...defaultDictionarySettings },
                overrides: {
                    ...inheritedCardSettingsOverrides,
                    customNotationLabel: '  Pinyin  ',
                    transcriptionEnabled: 'disabled',
                    transcriptionNotation: 'custom',
                },
            }),
        ).toMatchObject({
            customNotationLabel: 'Pinyin',
            transcriptionEnabled: false,
            transcriptionNotation: 'custom',
        });
    });
});
