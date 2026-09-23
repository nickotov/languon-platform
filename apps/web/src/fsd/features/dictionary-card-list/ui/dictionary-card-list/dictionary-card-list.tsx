import { useI18n } from '@/fsd/shared/i18n';
import { EmptyState } from '@/fsd/shared/ui';
import type { DictionaryCard } from '@languon/contracts';
import type { DictionaryCardListProps } from '../../types';
import { DictionaryCardRow } from '../dictionary-card-row/dictionary-card-row';
import styles from './dictionary-card-list.module.css';

export function DictionaryCardList(props: DictionaryCardListProps) {
    const {
        cards,
        dictionary,
        languages,
        lifecycle,
        generationAvailable,
        onEdit,
        onGenerate,
        onLifecycle,
        pending,
        renderAudio,
    } = props;
    const { t } = useI18n();

    if (cards.length === 0) {
        return (
            <EmptyState title={t('dictionary.cards.empty')}>
                {t('dictionary.cards.emptyHelp')}
            </EmptyState>
        );
    }

    function renderCard(card: DictionaryCard, index: number) {
        return (
            <DictionaryCardRow
                key={card.id}
                card={card}
                index={index}
                dictionary={dictionary}
                languages={languages}
                lifecycle={lifecycle}
                generationAvailable={generationAvailable}
                onEdit={onEdit}
                onGenerate={onGenerate}
                onLifecycle={onLifecycle}
                pending={pending}
                renderAudio={renderAudio}
            />
        );
    }

    return <ol className={styles.list}>{cards.map(renderCard)}</ol>;
}
