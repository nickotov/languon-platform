import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { DictionaryAudioControl } from '@/fsd/features/dictionary-audio';
import { DictionaryCardList } from '@/fsd/features/dictionary-card-list';
import { Button, ErrorState } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import { syncGenerationUrl } from '../../lib/generation-url';
import styles from '../dictionary-editor/dictionary-editor.module.css';
import { EditorEmptyCards } from '../editor-empty-cards/editor-empty-cards';

type ListProps = ComponentProps<typeof DictionaryCardList>;

export function EditorCards({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'current'
        | 'catalog'
        | 'cardList'
        | 'cards'
        | 'cardLifecycle'
        | 'generationCapabilities'
        | 'audio'
        | 'setEditing'
        | 'setGenerationTarget'
        | 'setGenerationCompared'
        | 'generationAction'
        | 'cardLifecycleMutation'
        | 'cardMutation'
        | 'reorder'
        | 'cardsQueryKey'
        | 'queryClient'
    > & { emptyState: ComponentProps<typeof EditorEmptyCards>['model'] };
}) {
    const {
        t,
        current,
        catalog,
        cardList,
        cards,
        cardLifecycle,
        generationCapabilities,
        audio,
        setEditing,
        setGenerationTarget,
        setGenerationCompared,
        generationAction,
        cardLifecycleMutation,
        cardMutation,
        reorder,
        cardsQueryKey,
        queryClient,
    } = model;

    const archived = current.lifecycle === 'archived';

    const pending =
        archived ||
        cardMutation.isPending ||
        cardLifecycleMutation.isPending ||
        reorder.isPending;

    const generationAvailable =
        generationCapabilities.data?.singleCardGeneration.available === true;

    const loadMoreConflict =
        cards.error instanceof DictionaryApiError &&
        cards.error.detail.code === 'version_conflict';

    const errorTitle = t('dictionary.error.title');

    const errorMessage = cards.error
        ? dictionaryErrorMessage(cards.error, t)
        : null;

    const shownSummary = t('dictionary.editor.allCardsShown', {
        count: cardList.length,
        lifecycle: t(`dictionary.lifecycle.${cardLifecycle}`),
    });

    const renderAudio: ListProps['renderAudio'] = (card, field) => {
        const available =
            generationCapabilities.data?.pronunciationAudio
                ?.playbackAvailable &&
            !archived &&
            card.lifecycle === 'active' &&
            cardLifecycle === 'active' &&
            card.values[field]?.trim();

        return available ? (
            <DictionaryAudioControl
                card={card}
                field={field}
                playback={audio}
            />
        ) : null;
    };

    const generate: NonNullable<ListProps['onGenerate']> = (card) => {
        const nextTarget = { cardId: card.id };
        setEditing(null);
        setGenerationTarget(nextTarget);
        setGenerationCompared(false);
        syncGenerationUrl(nextTarget);
        generationAction.reset();
    };

    const toggleLifecycle: ListProps['onLifecycle'] = (card) =>
        cardLifecycleMutation.mutate(card);

    const move: ListProps['onMove'] = (card, direction) =>
        reorder.mutate({ card, direction });

    function loadMore() {
        void cards.fetchNextPage();
    }

    function reload() {
        void queryClient.resetQueries({ exact: true, queryKey: cardsQueryKey });
    }

    return (
        <section className={styles.cardsSection}>
            {cards.isError ? (
                <ErrorState title={errorTitle}>{errorMessage}</ErrorState>
            ) : null}
            {cardList.length ? (
                <DictionaryCardList
                    cards={cardList}
                    dictionary={current}
                    languages={catalog}
                    lifecycle={cardLifecycle}
                    generationAvailable={generationAvailable}
                    reorderEnabled={false}
                    onEdit={setEditing}
                    onGenerate={generate}
                    onLifecycle={toggleLifecycle}
                    onMove={move}
                    pending={pending}
                    renderAudio={renderAudio}
                />
            ) : (
                <EditorEmptyCards model={model.emptyState} />
            )}
            {cards.hasNextPage ? (
                <Button
                    loading={cards.isFetchingNextPage}
                    onClick={loadMore}
                    type='button'
                    variant='secondary'
                >
                    {t('dictionary.cards.loadMore')}
                </Button>
            ) : null}
            {!cards.hasNextPage && cardList.length > 0 ? (
                <p className={styles.shownSummary}>{shownSummary}</p>
            ) : null}
            {cards.isFetchNextPageError ? (
                <div role='alert'>
                    <p>{t('dictionary.cards.loadMoreFailed')}</p>
                    {loadMoreConflict ? (
                        <Button
                            onClick={reload}
                            type='button'
                            variant='secondary'
                        >
                            {t('dictionary.conflict.reload')}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
