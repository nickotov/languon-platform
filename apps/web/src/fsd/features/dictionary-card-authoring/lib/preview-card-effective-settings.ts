import type {
    DictionaryCardEffectiveSettings,
    DictionaryCardOverrides,
    DictionarySettingsValues,
} from '@languon/contracts';

/**
 * Produces an immediate form preview only. The server remains authoritative and
 * validates/resolves the same raw overrides during every card write.
 */
export function previewCardEffectiveSettings(
    defaults: DictionarySettingsValues,
    overrides: DictionaryCardOverrides,
): DictionaryCardEffectiveSettings {
    const enabled = (
        override: 'disabled' | 'enabled' | null,
        fallback: boolean,
    ) => (override === null ? fallback : override === 'enabled');
    const transcriptionEnabled = enabled(
        overrides.transcriptionEnabled,
        defaults.transcriptionEnabled,
    );
    const definitionEnabled = enabled(
        overrides.definitionEnabled,
        defaults.definitionEnabled,
    );
    const exampleEnabled = enabled(
        overrides.exampleEnabled,
        defaults.exampleEnabled,
    );
    const requestedExampleTranslation = enabled(
        overrides.exampleTranslationEnabled,
        defaults.exampleTranslationEnabled,
    );
    const exampleLanguage =
        overrides.exampleLanguage ?? defaults.exampleLanguage;
    return {
        transcriptionEnabled,
        transcriptionNotation:
            overrides.transcriptionNotation ?? defaults.transcriptionNotation,
        transcriptionCustomLabel:
            overrides.transcriptionCustomLabel ??
            defaults.transcriptionCustomLabel,
        definitionEnabled,
        definitionLanguage:
            overrides.definitionLanguage ?? defaults.definitionLanguage,
        exampleEnabled,
        exampleLanguage,
        exampleTranslationEnabled:
            exampleEnabled && requestedExampleTranslation,
        exampleTranslationLanguage:
            exampleLanguage === 'source' ? 'target' : 'source',
    };
}
