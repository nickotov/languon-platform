import { resolveTranslationContext } from '../../../domain/translation-context';
import {
    normalizeCardSettingsOverrides,
    resolveCardSettings,
    type CardSettingsOverrides,
    type DictionarySettings,
} from '../../../domain/settings';
import { DictionaryCardRevisionSnapshotSchema } from './revision-snapshot-schema';
import type { SettingsRow, CardRow } from './generation-context';

export function domainSettings(row: SettingsRow): DictionarySettings {
    return {
        customNotationLabel: row.customNotationLabel,
        definitionEnabled: row.definitionEnabled,
        definitionLanguageRole: row.definitionLanguageRole,
        exampleEnabled: row.exampleEnabled,
        exampleLanguageRole: row.exampleLanguageRole,
        exampleTranslationEnabled: row.exampleTranslationEnabled,
        transcriptionEnabled: row.transcriptionEnabled,
        transcriptionNotation: row.transcriptionNotation,
        version: row.version,
    };
}

export function domainOverrides(input: {
    definitionEnabled: 'disabled' | 'enabled' | null;
    definitionLanguage: 'source' | 'target' | null;
    exampleEnabled: 'disabled' | 'enabled' | null;
    exampleLanguage: 'source' | 'target' | null;
    exampleTranslationEnabled: 'disabled' | 'enabled' | null;
    transcriptionCustomLabel: string | null;
    transcriptionEnabled: 'disabled' | 'enabled' | null;
    transcriptionNotation: 'custom' | 'ipa' | 'romanization' | null;
}): CardSettingsOverrides {
    return normalizeCardSettingsOverrides({
        customNotationLabel: input.transcriptionCustomLabel,
        definitionEnabled: input.definitionEnabled,
        definitionLanguageRole: input.definitionLanguage,
        exampleEnabled: input.exampleEnabled,
        exampleLanguageRole: input.exampleLanguage,
        exampleTranslationEnabled: input.exampleTranslationEnabled,
        transcriptionEnabled: input.transcriptionEnabled,
        transcriptionNotation: input.transcriptionNotation,
    });
}

export function wireOverrides(row: CardRow) {
    return {
        definitionEnabled: row.definitionEnabledOverride,
        definitionLanguage: row.definitionLanguageRoleOverride,
        exampleEnabled: row.exampleEnabledOverride,
        exampleLanguage: row.exampleLanguageRoleOverride,
        exampleTranslationEnabled: row.exampleTranslationEnabledOverride,
        transcriptionCustomLabel: row.customNotationLabelOverride,
        transcriptionEnabled: row.transcriptionEnabledOverride,
        transcriptionNotation: row.transcriptionNotationOverride,
    };
}

export function values(row: CardRow) {
    return {
        definition: row.definition,
        example: row.example,
        exampleTranslation: row.exampleTranslation,
        source: row.source,
        transcription: row.transcription,
        translation: row.translation,
    };
}

export function wireEffectiveSettings(settings: SettingsRow) {
    const effective = resolveCardSettings({
        dictionary: domainSettings(settings),
        overrides: normalizeCardSettingsOverrides({
            customNotationLabel: null,
            definitionEnabled: null,
            definitionLanguageRole: null,
            exampleEnabled: null,
            exampleLanguageRole: null,
            exampleTranslationEnabled: null,
            transcriptionEnabled: null,
            transcriptionNotation: null,
        }),
    });

    return {
        definitionEnabled: effective.definitionEnabled,
        definitionLanguage: effective.definitionLanguageRole,
        exampleEnabled: effective.exampleEnabled,
        exampleLanguage: effective.exampleLanguageRole,
        exampleTranslationEnabled: effective.exampleTranslationEnabled,
        exampleTranslationLanguage: effective.exampleTranslationLanguageRole,
        transcriptionCustomLabel: effective.customNotationLabel,
        transcriptionEnabled: effective.transcriptionEnabled,
        transcriptionNotation: effective.transcriptionNotation,
    };
}

export function wireEffectiveSettingsForOverrides(
    settings: SettingsRow,
    overrides: ReturnType<typeof domainOverrides>,
) {
    const effective = resolveCardSettings({
        dictionary: domainSettings(settings),
        overrides,
    });

    return {
        definitionEnabled: effective.definitionEnabled,
        definitionLanguage: effective.definitionLanguageRole,
        exampleEnabled: effective.exampleEnabled,
        exampleLanguage: effective.exampleLanguageRole,
        exampleTranslationEnabled: effective.exampleTranslationEnabled,
        exampleTranslationLanguage: effective.exampleTranslationLanguageRole,
        transcriptionCustomLabel: effective.customNotationLabel,
        transcriptionEnabled: effective.transcriptionEnabled,
        transcriptionNotation: effective.transcriptionNotation,
    };
}

export function revisionSnapshot(
    row: CardRow,
    settings: SettingsRow,
    dictionaryTranslationContext: string | null,
) {
    return DictionaryCardRevisionSnapshotSchema.parse({
        authorship: row.authorship,
        cardVersion: row.version,
        effectiveSettings: resolveCardSettings({
            dictionary: domainSettings(settings),
            overrides: domainOverrides(wireOverrides(row)),
        }),
        effectiveTranslationContext: resolveTranslationContext({
            card: row.translationContext,
            dictionary: dictionaryTranslationContext,
        }),
        rawOverrides: domainOverrides(wireOverrides(row)),
        rawTranslationContext: row.translationContext,
        schemaVersion: 2,
        settingsVersion: settings.version,
        values: values(row),
    });
}
