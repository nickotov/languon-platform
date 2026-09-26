import type {
    DictionaryCard,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import type { ReactNode } from 'react';
import type { DictionaryCardDeletionController } from './hooks/use-dictionary-card-deletion';
export type DictionaryCardListProps = {
    cards: readonly DictionaryCard[];
    dictionary: OwnedDictionary;
    languages: readonly LanguageCatalogEntry[];
    lifecycle: 'active' | 'archived';
    reorderEnabled?: boolean;
    generationAvailable?: boolean;
    onEdit(card: DictionaryCard): void;
    onGenerate?(card: DictionaryCard): void;
    onLifecycle(card: DictionaryCard): void;
    onMove(card: DictionaryCard, direction: -1 | 1): void;
    pending: boolean;
    renderAudio?(
        card: DictionaryCard,
        field: 'source' | 'translation' | 'example' | 'exampleTranslation',
    ): ReactNode;
    deletion?: DictionaryCardDeletionController;
};

export type DictionaryCardRowProps = Pick<
    DictionaryCardListProps,
    | 'dictionary'
    | 'languages'
    | 'lifecycle'
    | 'onEdit'
    | 'onLifecycle'
    | 'pending'
> & {
    card: DictionaryCard;
    index: number;
    generationAvailable: DictionaryCardListProps['generationAvailable'];
    onGenerate: DictionaryCardListProps['onGenerate'];
    renderAudio: DictionaryCardListProps['renderAudio'];
    deletion: DictionaryCardListProps['deletion'];
};
