import { describe, expect, it } from 'vitest';

import {
    hasLearningContentChanged,
    type DictionaryLearningContent,
} from '../../../../../src/modules/dictionaries/domain/learning-content';
import {
    defaultDictionarySettings,
    inheritedCardSettingsOverrides,
    resolveCardSettings,
} from '../../../../../src/modules/dictionaries/domain/settings';

const content = (): DictionaryLearningContent => ({
    values: {
        source: 'hello',
        translation: 'hola',
        definition: 'greeting',
        example: 'Hello!',
        exampleTranslation: '¡Hola!',
        transcription: 'həˈləʊ',
    },
    settings: resolveCardSettings({
        dictionary: { ...defaultDictionarySettings },
        overrides: { ...inheritedCardSettingsOverrides },
    }),
});

describe('canonical learning content', () => {
    it('ignores dormant values, language settings and custom label', () => {
        const previous = content();
        const next = content();
        next.values.definition = 'another dormant definition';
        next.values.transcription = 'different dormant transcription';
        next.settings.definitionLanguageRole = 'target';
        next.settings.transcriptionNotation = 'custom';
        next.settings.customNotationLabel = 'phonetic';
        expect(hasLearningContentChanged({ previous, next })).toBe(false);
    });

    it.each([
        'source',
        'translation',
        'example',
        'exampleTranslation',
    ] as const)('invalidates an active %s change', (field) => {
        const previous = content();
        const next = content();
        next.values[field] = 'changed';
        expect(hasLearningContentChanged({ previous, next })).toBe(true);
    });

    it('invalidates enablement and active language-role changes, even without values', () => {
        const previous = content();
        const next = content();
        next.settings.definitionEnabled = true;
        next.values.definition = null;
        expect(hasLearningContentChanged({ previous, next })).toBe(true);
        next.settings.definitionEnabled = false;
        next.settings.exampleLanguageRole = 'target';
        next.settings.exampleTranslationLanguageRole = 'source';
        expect(hasLearningContentChanged({ previous, next })).toBe(true);
    });

    it('ignores dependent example data while the parent is disabled', () => {
        const previous = content();
        previous.settings.exampleEnabled = false;
        previous.settings.exampleTranslationEnabled = false;
        const next = structuredClone(previous);
        next.values.example = 'dormant';
        next.values.exampleTranslation = 'dormant';
        next.settings.exampleLanguageRole = 'target';
        expect(hasLearningContentChanged({ previous, next })).toBe(false);
    });

    it('compares notation and only applicable custom labels for enabled transcription', () => {
        const previous = content();
        previous.settings.transcriptionEnabled = true;
        const next = structuredClone(previous);
        next.settings.customNotationLabel = 'inactive label';
        expect(hasLearningContentChanged({ previous, next })).toBe(false);
        next.settings.transcriptionNotation = 'custom';
        expect(hasLearningContentChanged({ previous, next })).toBe(true);
        previous.settings.transcriptionNotation = 'custom';
        previous.settings.customNotationLabel = 'different';
        expect(hasLearningContentChanged({ previous, next })).toBe(true);
    });
});
