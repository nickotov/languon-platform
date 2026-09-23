import type {
    DictionaryCard,
    DictionaryCardEffectiveSettings,
    DictionaryCardOverrides,
    DictionaryCardValues,
    DictionaryCardAuthoringField,
    DictionaryCardAuthoringGenerationJob,
    DictionaryCardAuthoringProposal,
    DictionaryCardAuthoringSelectedSuggestion,
    OwnedDictionary,
} from '@languon/contracts';
import type { languageLabel } from '@/fsd/entities/dictionary';
export interface DictionaryCardDraft {
    overrides: DictionaryCardOverrides;
    values: DictionaryCardValues;
}

export type DictionaryCardAuthoringAction =
    | { kind: 'cancel' }
    | {
          discardedSuggestionIds: string[];
          draft: DictionaryCardDraft;
          kind: 'generate';
          scope:
              | { kind: 'all' }
              | { kind: 'field'; field: DictionaryCardAuthoringField };
          successor: boolean;
      };

export interface DictionaryCardAuthoringAI {
    available: boolean;
    error?: string | null;
    job?: DictionaryCardAuthoringGenerationJob | null;
    onAction(action: DictionaryCardAuthoringAction): Promise<void>;
    pending: boolean;
    proposal?: DictionaryCardAuthoringProposal | null;
    successorActive?: boolean;
}

export type DictionaryCardFormProps = {
    card?: DictionaryCard | undefined;
    ai?: DictionaryCardAuthoringAI | undefined;
    dictionary: OwnedDictionary;
    embedded?: boolean;
    error?: string | null;
    existingSources?: readonly string[];
    languages: Parameters<typeof languageLabel>[0];
    onCancel(): void;
    onDirtyChange?: ((dirty: boolean) => void) | undefined;
    onReloadConflict?: (() => Promise<void> | void) | undefined;
    onSave(
        draft: DictionaryCardDraft,
        selectedSuggestions: DictionaryCardAuthoringSelectedSuggestion[],
    ): Promise<void>;
    pending: boolean;
    showHeading?: boolean;
};

export type AuthoringFieldContent = {
    effective: DictionaryCardEffectiveSettings;
    values: DictionaryCardValues;
    setValue<K extends keyof DictionaryCardValues>(
        key: K,
        value: DictionaryCardValues[K],
    ): void;
};

export type AuthoringFieldSuggestions = {
    ai: Pick<DictionaryCardAuthoringAI, 'pending' | 'proposal'> | undefined;
    active: boolean;
    stale: boolean;
    hiddenSuggestionIds: ReadonlySet<string>;
    selectedSuggestions: Partial<Record<DictionaryCardAuthoringField, string>>;
    acceptSuggestion(
        field: DictionaryCardAuthoringField,
        id: string,
        value: string,
    ): void;
    discardSuggestion(field: DictionaryCardAuthoringField, id: string): void;
    regenerateField(field: DictionaryCardAuthoringField): void;
};
