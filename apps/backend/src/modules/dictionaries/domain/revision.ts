import type { CardAuthorship, CardMutationKind } from './authorship';
import type { DictionaryCardValues } from './limits';
import type { CardSettingsOverrides, EffectiveCardSettings } from './settings';

export interface DictionaryCardRevisionSnapshotV1 {
    authorship: CardAuthorship;
    cardVersion: number;
    effectiveSettings: EffectiveCardSettings;
    rawOverrides: CardSettingsOverrides;
    schemaVersion: 1;
    settingsVersion: number;
    values: DictionaryCardValues;
}

export type DictionaryCardRevisionSnapshot = DictionaryCardRevisionSnapshotV1;

export type DictionaryCardRevisionMutationKind =
    CardMutationKind | 'ai_create' | 'deterministic_import' | 'manual_create';
