import type {
    DictionaryCard,
    DictionaryCardEffectiveSettings,
    DictionaryCardOverrides,
    DictionaryCardValues,
    DictionaryCardAuthoringGenerationJob,
    OwnedDictionary,
} from '@languon/contracts';
import type { languageLabel } from '@/fsd/entities/dictionary';

export type DictionaryCardAuthoringField = keyof DictionaryCardValues;
export type DictionaryCardAuthoringSelectedSuggestion = {
    field: DictionaryCardAuthoringField;
    suggestionId: string;
};
export type DictionaryCardAuthoringSuggestion = {
    basisSource?: string;
    field: DictionaryCardAuthoringField;
    id: string;
    value: string;
};
export type DictionaryCardAuthoringProposal = {
    source: string;
    sourceResult?:
        | { kind: 'unchanged' }
        | { kind: 'suggested'; suggestionId: string }
        | null;
    sourceSuggestions?: DictionaryCardAuthoringSuggestion[];
    suggestions: DictionaryCardAuthoringSuggestion[];
    translationContext?: string | null;
};
export interface DictionaryCardDraft {
    overrides: DictionaryCardOverrides;
    translationContext: string | null;
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
    format?:
        | 'card-authoring:v1'
        | 'card-authoring:v2'
        | 'card-authoring:v3'
        | undefined;
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
    ai:
        | Pick<
              DictionaryCardAuthoringAI,
              'available' | 'format' | 'pending' | 'proposal'
          >
        | undefined;
    active: boolean;
    canGenerate: boolean;
    stale: boolean;
    hiddenSuggestionIds: ReadonlySet<string>;
    reviewedSuggestionIds: ReadonlySet<string>;
    selectedSuggestions: Partial<Record<DictionaryCardAuthoringField, string>>;
    generatingScope:
        | { kind: 'all' }
        | { kind: 'field'; field: DictionaryCardAuthoringField }
        | null;
    acceptSuggestion(
        field: DictionaryCardAuthoringField,
        id: string,
        value: string,
    ): void;
    discardSuggestion(field: DictionaryCardAuthoringField, id: string): void;
    generateField(field: DictionaryCardAuthoringField): void;
};
