import type {
    DictionaryCardOverrides,
    DictionaryCardValues,
} from '@languon/contracts';
import { DictionaryVersionConflictError } from '../../../application/dictionary-errors';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import { type CardSettingsOverrides } from '../../../domain/settings';
import type {
    CardRow,
    DictionaryPersistenceContext,
    DictionaryRow,
    DictionaryTransaction,
    SettingsRow,
} from './dictionary-context';
import { revisionSnapshot } from './dictionary-rows';
import { dictionaryCardRevisionsTable } from './schema';

export function domainOverrides(
    overrides: DictionaryCardOverrides,
): CardSettingsOverrides {
    return {
        customNotationLabel: overrides.transcriptionCustomLabel,
        definitionEnabled: overrides.definitionEnabled,
        definitionLanguageRole: overrides.definitionLanguage,
        exampleEnabled: overrides.exampleEnabled,
        exampleLanguageRole: overrides.exampleLanguage,
        exampleTranslationEnabled: overrides.exampleTranslationEnabled,
        transcriptionEnabled: overrides.transcriptionEnabled,
        transcriptionNotation: overrides.transcriptionNotation,
    };
}

export function mergeCardValues(
    current: DictionaryCardValues,
    patch: Parameters<DictionaryStore['updateCard']>[0]['request']['values'],
): DictionaryCardValues {
    if (!patch) return current;

    return {
        definition:
            patch.definition === undefined
                ? current.definition
                : patch.definition,
        example: patch.example === undefined ? current.example : patch.example,
        exampleTranslation:
            patch.exampleTranslation === undefined
                ? current.exampleTranslation
                : patch.exampleTranslation,
        source: patch.source ?? current.source,
        transcription:
            patch.transcription === undefined
                ? current.transcription
                : patch.transcription,
        translation: patch.translation ?? current.translation,
    };
}

export function mergeOverrides(
    current: DictionaryCardOverrides,
    patch: Parameters<DictionaryStore['updateCard']>[0]['request']['overrides'],
): DictionaryCardOverrides {
    if (!patch) return current;

    return {
        definitionEnabled:
            patch.definitionEnabled === undefined
                ? current.definitionEnabled
                : patch.definitionEnabled,
        definitionLanguage:
            patch.definitionLanguage === undefined
                ? current.definitionLanguage
                : patch.definitionLanguage,
        exampleEnabled:
            patch.exampleEnabled === undefined
                ? current.exampleEnabled
                : patch.exampleEnabled,
        exampleLanguage:
            patch.exampleLanguage === undefined
                ? current.exampleLanguage
                : patch.exampleLanguage,
        exampleTranslationEnabled:
            patch.exampleTranslationEnabled === undefined
                ? current.exampleTranslationEnabled
                : patch.exampleTranslationEnabled,
        transcriptionCustomLabel:
            patch.transcriptionCustomLabel === undefined
                ? current.transcriptionCustomLabel
                : patch.transcriptionCustomLabel,
        transcriptionEnabled:
            patch.transcriptionEnabled === undefined
                ? current.transcriptionEnabled
                : patch.transcriptionEnabled,
        transcriptionNotation:
            patch.transcriptionNotation === undefined
                ? current.transcriptionNotation
                : patch.transcriptionNotation,
    };
}

export function cardInsertValues(
    values: DictionaryCardValues,
    overrides: CardSettingsOverrides,
    translationContext: string | null = null,
) {
    return {
        customNotationLabelOverride: overrides.customNotationLabel,
        definition: values.definition,
        definitionEnabledOverride: overrides.definitionEnabled,
        definitionLanguageRoleOverride: overrides.definitionLanguageRole,
        example: values.example,
        exampleEnabledOverride: overrides.exampleEnabled,
        exampleLanguageRoleOverride: overrides.exampleLanguageRole,
        exampleTranslation: values.exampleTranslation,
        exampleTranslationEnabledOverride: overrides.exampleTranslationEnabled,
        source: values.source,
        transcription: values.transcription,
        transcriptionEnabledOverride: overrides.transcriptionEnabled,
        transcriptionNotationOverride: overrides.transcriptionNotation,
        translation: values.translation,
        translationContext,
    };
}

export async function insertRevision(
    context: DictionaryPersistenceContext,
    tx: DictionaryTransaction,
    row: CardRow,
    settings: SettingsRow,
    dictionaryTranslationContext: string | null,
    actorUserId: string,
    mutationKind: 'fork' | 'manual_create' | 'manual_edit',
    now: Date,
) {
    const snapshot = revisionSnapshot(
        row,
        settings,
        dictionaryTranslationContext,
    );

    await tx.insert(dictionaryCardRevisionsTable).values({
        actorUserId,
        authorship: row.authorship,
        cardId: row.id,
        cardVersion: row.version,
        createdAt: now,
        dictionaryId: row.dictionaryId,
        id: context.ids.generate(),
        mutationKind,
        revisionNumber: row.version,
        schemaVersion: 2,
        settingsVersion: settings.version,
        snapshot,
    });
}

export function assertAggregateVersions(
    current: { dictionary: DictionaryRow; settings: SettingsRow },
    dictionaryVersion: number,
    settingsVersion: number,
) {
    if (
        current.dictionary.version !== dictionaryVersion ||
        current.settings.version !== settingsVersion
    )
        throw new DictionaryVersionConflictError();
}
