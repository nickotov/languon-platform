import type {
    DictionaryCard,
    DictionaryCardOverrides,
    DictionaryCardValues,
    DictionarySettingsValues,
    DictionarySummary,
    OwnedDictionary,
} from '@languon/contracts';
import { normalizeDictionaryCardSourceForSearch } from '../../../domain/limits';
import {
    resolveCardSettings,
    type CardSettingsOverrides,
    type DictionarySettings,
} from '../../../domain/settings';
import { resolveTranslationContext } from '../../../domain/translation-context';
import type { CardRow, DictionaryRow, SettingsRow } from './dictionary-context';
import { DictionaryCardRevisionSnapshotSchema } from './revision-snapshot-schema';

export function iso(value: Date): string {
    return value.toISOString();
}

export function normalizedSource(value: string): string {
    return normalizeDictionaryCardSourceForSearch(value);
}

export function settingsFromRow(row: SettingsRow): DictionarySettings {
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

export function settingsValues(row: SettingsRow): DictionarySettingsValues {
    return {
        definitionEnabled: row.definitionEnabled,
        definitionLanguage: row.definitionLanguageRole,
        exampleEnabled: row.exampleEnabled,
        exampleLanguage: row.exampleLanguageRole,
        exampleTranslationEnabled: row.exampleTranslationEnabled,
        transcriptionCustomLabel: row.customNotationLabel,
        transcriptionEnabled: row.transcriptionEnabled,
        transcriptionNotation: row.transcriptionNotation,
    };
}

export function overridesFromRow(row: CardRow): CardSettingsOverrides {
    return {
        customNotationLabel: row.customNotationLabelOverride,
        definitionEnabled: row.definitionEnabledOverride,
        definitionLanguageRole: row.definitionLanguageRoleOverride,
        exampleEnabled: row.exampleEnabledOverride,
        exampleLanguageRole: row.exampleLanguageRoleOverride,
        exampleTranslationEnabled: row.exampleTranslationEnabledOverride,
        transcriptionEnabled: row.transcriptionEnabledOverride,
        transcriptionNotation: row.transcriptionNotationOverride,
    };
}

export function wireOverrides(row: CardRow): DictionaryCardOverrides {
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

export function cardValues(row: CardRow): DictionaryCardValues {
    return {
        definition: row.definition,
        example: row.example,
        exampleTranslation: row.exampleTranslation,
        source: row.source,
        transcription: row.transcription,
        translation: row.translation,
    };
}

export function mapCard(row: CardRow, settings: SettingsRow): DictionaryCard {
    const effective = resolveCardSettings({
        dictionary: settingsFromRow(settings),
        overrides: overridesFromRow(row),
    });

    return {
        archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
        authorship: row.authorship,
        createdAt: iso(row.createdAt),
        dictionaryId: row.dictionaryId,
        effectiveSettings: {
            definitionEnabled: effective.definitionEnabled,
            definitionLanguage: effective.definitionLanguageRole,
            exampleEnabled: effective.exampleEnabled,
            exampleLanguage: effective.exampleLanguageRole,
            exampleTranslationEnabled: effective.exampleTranslationEnabled,
            exampleTranslationLanguage:
                effective.exampleTranslationLanguageRole,
            transcriptionCustomLabel: effective.customNotationLabel,
            transcriptionEnabled: effective.transcriptionEnabled,
            transcriptionNotation: effective.transcriptionNotation,
        },
        id: row.id,
        lifecycle: row.lifecycle,
        overrides: wireOverrides(row),
        position: row.sortKey.toString(),
        settingsVersion: settings.version,
        translationContext: row.translationContext,
        updatedAt: iso(row.updatedAt),
        values: cardValues(row),
        version: row.version,
    };
}

export function mapSummary(
    row: DictionaryRow,
    settings: SettingsRow,
    activeCardCount: number,
    languagePairLocked: boolean,
): DictionarySummary {
    return {
        activeCardCount,
        archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
        createdAt: iso(row.createdAt),
        description: row.description,
        id: row.id,
        lifecycle: row.lifecycle,
        languagePairLocked,
        name: row.name,
        settingsVersion: settings.version,
        sourceLanguage:
            row.sourceLanguageTag as DictionarySummary['sourceLanguage'],
        targetLanguage:
            row.targetLanguageTag as DictionarySummary['targetLanguage'],
        updatedAt: iso(row.updatedAt),
        version: row.version,
        visibility: row.visibility,
    };
}

export function mapOwned(
    row: DictionaryRow,
    settings: SettingsRow,
    activeCardCount: number,
    languagePairLocked: boolean,
): OwnedDictionary {
    return {
        ...mapSummary(row, settings, activeCardCount, languagePairLocked),
        settings: {
            updatedAt: iso(settings.updatedAt),
            values: settingsValues(settings),
            version: settings.version,
        },
        sourceDictionaryId: row.sourceDictionaryId,
        translationContext: row.translationContext,
    };
}

export function revisionSnapshot(
    row: CardRow,
    settings: SettingsRow,
    dictionaryTranslationContext: string | null,
) {
    const effective = resolveCardSettings({
        dictionary: settingsFromRow(settings),
        overrides: overridesFromRow(row),
    });

    return DictionaryCardRevisionSnapshotSchema.parse({
        authorship: row.authorship,
        cardVersion: row.version,
        effectiveSettings: effective,
        effectiveTranslationContext: resolveTranslationContext({
            card: row.translationContext,
            dictionary: dictionaryTranslationContext,
        }),
        rawOverrides: overridesFromRow(row),
        rawTranslationContext: row.translationContext,
        schemaVersion: 2,
        settingsVersion: settings.version,
        values: cardValues(row),
    });
}
