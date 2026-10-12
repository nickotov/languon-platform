import { EyeOffIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import componentStyles from './library-list.module.css';
import { Button, Checkbox, InlineAlert } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import type { LibraryController } from '../../hooks/use-sentence-library';
import type { SavedSentence } from '../../types';
import { SentenceRow } from '../sentence-row/sentence-row';
import {
    LibrarySkeleton,
    LibraryLoadError,
    LibraryEmpty,
} from '../library-states/library-states';
export function LibraryList({
    c,
    practice,
    openDetail,
    singleToggle,
}: {
    c: LibraryController;
    practice(): void;
    openDetail(id: string, trigger: HTMLElement): void;
    singleToggle(sentence: SavedSentence): void;
}) {
    const { L } = useInterfaceText();
    function removeAll() {
        void c.openConfirmation('archive', true);
    }
    function archiveSelected() {
        void c.openConfirmation('archive');
    }
    function restoreSelected() {
        void c.openConfirmation('restore');
    }
    const selectedArchive = c.selectedItems.some((item) => !item.archivedByMe);
    const selectedRestore = c.selectedItems.some((item) => item.archivedByMe);
    let body;
    if (c.query.isPending || (!c.items.length && c.presence.isPending))
        body = <LibrarySkeleton />;
    else if (c.query.isError || (!c.items.length && c.presence.isError))
        body = <LibraryLoadError onRetry={c.retry} />;
    else if (!c.items.length)
        body = (
            <LibraryEmpty
                kind={
                    c.filters.personalArchive === 'archived'
                        ? 'archive-empty'
                        : c.presence.data?.items.length
                          ? 'no-results'
                          : 'none'
                }
                onReset={c.resetFilters}
                onPractice={practice}
            />
        );
    else
        body = (
            <section aria-label={L('title')} className={componentStyles.root}>
                <div className={componentStyles.toolbar}>
                    <Checkbox
                        size='sm'
                        label={L(
                            c.items.length > 100
                                ? 'selectFirstPage'
                                : 'selectPage',
                        )}
                        checked={c.pageAllSelected}
                        indeterminate={
                            c.selected.length > 0 && !c.pageAllSelected
                        }
                        disabled={c.pending}
                        onChange={c.togglePage}
                    />
                    {c.filters.personalArchive === 'active' &&
                    !c.selected.length ? (
                        <Button
                            size='compact'
                            variant='secondary'
                            disabled={c.pending}
                            leadingIcon={
                                <EyeOffIcon
                                    aria-hidden
                                    className={componentStyles.icon}
                                />
                            }
                            onClick={removeAll}
                        >
                            {L('removeAllMatching')}
                        </Button>
                    ) : null}
                </div>
                <ul className={componentStyles.rows}>
                    {c.items.map((sentence) => (
                        <SentenceRow
                            key={sentence.id}
                            sentence={sentence}
                            selected={c.selected.includes(sentence.id)}
                            locked={c.pending}
                            onToggle={c.toggle}
                            onView={openDetail}
                            onArchiveToggle={singleToggle}
                        />
                    ))}
                </ul>
                {c.selected.length > 0 ? (
                    <div className={componentStyles.selectionDock}>
                        <div
                            role='region'
                            aria-label={L('selectionToolbar')}
                            className={componentStyles.selectionPanel}
                        >
                            <div className={componentStyles.selectionToolbar}>
                                <p
                                    aria-live='polite'
                                    className={componentStyles.selectionCount}
                                >
                                    {c.allMatching
                                        ? L('scopeAll')
                                        : L('selIds', { n: c.selected.length })}
                                </p>
                                {c.pageAllSelected && !c.allMatching ? (
                                    <button
                                        type='button'
                                        onClick={c.chooseAllMatching}
                                        className={
                                            componentStyles.selectionLink
                                        }
                                    >
                                        {L('scopeAll')}
                                    </button>
                                ) : null}
                                {c.allMatching ? (
                                    <button
                                        type='button'
                                        onClick={c.onlyThisPage}
                                        className={
                                            componentStyles.selectionLink
                                        }
                                    >
                                        {L('onlyThisPage')}
                                    </button>
                                ) : null}
                                <div
                                    className={componentStyles.selectionActions}
                                >
                                    {selectedArchive ? (
                                        <Button
                                            size='compact'
                                            disabled={c.pending}
                                            leadingIcon={
                                                <EyeOffIcon
                                                    aria-hidden
                                                    className={
                                                        componentStyles.icon
                                                    }
                                                />
                                            }
                                            onClick={archiveSelected}
                                        >
                                            {L('removeMine')}
                                        </Button>
                                    ) : null}
                                    {selectedRestore ? (
                                        <Button
                                            size='compact'
                                            disabled={c.pending}
                                            leadingIcon={
                                                <RotateCcwIcon
                                                    aria-hidden
                                                    className={
                                                        componentStyles.icon
                                                    }
                                                />
                                            }
                                            onClick={restoreSelected}
                                        >
                                            {L('restore')}
                                        </Button>
                                    ) : null}
                                    <Button
                                        size='compact'
                                        variant='secondary'
                                        leadingIcon={
                                            <XIcon
                                                aria-hidden
                                                className={componentStyles.icon}
                                            />
                                        }
                                        onClick={c.clearSelection}
                                    >
                                        {L('clearSelection')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
                <div className={componentStyles.root}>
                    {c.query.isFetchNextPageError ? (
                        <InlineAlert
                            tone='warning'
                            title={L('nextPageFailed')}
                            actions={
                                <Button
                                    size='compact'
                                    variant='secondary'
                                    onClick={c.loadMore}
                                >
                                    {L('retry')}
                                </Button>
                            }
                        />
                    ) : null}
                    <div className={componentStyles.pagination}>
                        <p className={componentStyles.paginationHelp}>
                            {L('shownCount', { shown: c.items.length })}
                        </p>
                        {c.query.hasNextPage ? (
                            <Button
                                variant='secondary'
                                loading={c.query.isFetchingNextPage}
                                onClick={c.loadMore}
                            >
                                {L('showMore')}
                            </Button>
                        ) : (
                            <p className={componentStyles.secondaryHelp}>
                                {L('allShown')}
                            </p>
                        )}
                    </div>
                </div>
            </section>
        );
    return body;
}
