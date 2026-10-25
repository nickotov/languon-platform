import type {
    DictionaryCard,
    DictionaryGenerationCandidate,
    DictionarySingleCardGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';

export type GenerationReviewProps = {
    available: boolean;
    card?: DictionaryCard | undefined;
    conflict?: boolean | undefined;
    currentCard?: DictionaryCard | undefined;
    dictionary: OwnedDictionary;
    error?: string | null | undefined;
    job?: DictionarySingleCardGenerationJob | undefined;
    languages: readonly LanguageCatalogEntry[];
    onAccept(candidate: DictionaryGenerationCandidate): Promise<void>;
    onCancel(): Promise<void>;
    onClose(): void;
    onDiscard(): Promise<void>;
    onReloadCompare(): Promise<void>;
    onRegenerate(instruction?: string): Promise<void>;
    onStart(instruction?: string): Promise<void>;
    pendingAction: boolean;
};
