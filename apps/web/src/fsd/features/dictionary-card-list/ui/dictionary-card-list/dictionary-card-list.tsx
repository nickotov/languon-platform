import { useI18n } from '@/fsd/shared/i18n';
import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import { Button, Checkbox, EmptyState, InlineAlert } from '@/fsd/shared/ui';
import type { DictionaryCard } from '@languon/contracts';
import { dictionaryDeletionSelectedTargetLimit } from '@languon/contracts';
import { Trash2 } from 'lucide-react';
import type { DictionaryCardListProps } from '../../types';
import { DictionaryCardRow } from '../dictionary-card-row/dictionary-card-row';
import { CardDeletionDialog } from '../card-deletion-dialog/card-deletion-dialog';
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
        deletion,
    } = props;
    const { t } = useI18n();

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
                deletion={deletion}
            />
        );
    }

    function openSelectedDeletion() {
        deletion?.openSelected();
    }

    const allLoadedSelected =
        Boolean(deletion) &&
        cards.length > 0 &&
        cards.every((card) => deletion!.selected.has(card.id));
    const someLoadedSelected =
        Boolean(deletion) &&
        cards.some((card) => deletion!.selected.has(card.id));

    return (
        <>
            {deletion && cards.length > 0 ? (
                <>
                    <div className={styles.selectionToolbar}>
                        <Checkbox
                            checked={allLoadedSelected}
                            disabled={deletion.remove.isPending}
                            indeterminate={
                                someLoadedSelected && !allLoadedSelected
                            }
                            label={t('dictionary.deletion.selectLoaded')}
                            onChange={deletion.toggleAllLoaded}
                        />
                        <span className={styles.selectionCount}>
                            {t('dictionary.deletion.selectedCount', {
                                count: deletion.selected.size,
                            })}
                        </span>
                        <div className={styles.selectionActions}>
                            <Button
                                disabled={!deletion.selected.size}
                                leadingIcon={<Trash2 aria-hidden size={16} />}
                                onClick={openSelectedDeletion}
                                size='compact'
                                type='button'
                                variant='danger'
                            >
                                {t('dictionary.deletion.deleteSelected')}
                            </Button>
                            <Button
                                loading={deletion.preview.isPending}
                                onClick={deletion.openAll}
                                size='compact'
                                type='button'
                                variant='secondary'
                            >
                                {t('dictionary.deletion.deleteAllArchived')}
                            </Button>
                        </div>
                    </div>
                    {deletion.preview.error ? (
                        <InlineAlert
                            tone='danger'
                            title={t('dictionary.deletion.failed')}
                        >
                            {dictionaryErrorMessage(deletion.preview.error, t)}
                        </InlineAlert>
                    ) : null}
                    {deletion.selectionLimitReached ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.deletion.selectionLimit', {
                                count: dictionaryDeletionSelectedTargetLimit,
                            })}
                        </InlineAlert>
                    ) : null}
                </>
            ) : null}
            {cards.length ? (
                <ol className={styles.list}>{cards.map(renderCard)}</ol>
            ) : (
                <EmptyState title={t('dictionary.cards.empty')}>
                    {t('dictionary.cards.emptyHelp')}
                </EmptyState>
            )}
            {deletion ? <CardDeletionDialog deletion={deletion} /> : null}
        </>
    );
}
