import { EyeOffIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { Button } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import type { LibraryController } from '../../hooks/use-sentence-library';
import componentStyles from './library-list.module.css';

type SelectionController = Pick<
    LibraryController,
    | 'selected'
    | 'selectedItems'
    | 'pending'
    | 'allMatching'
    | 'pageAllSelected'
    | 'openConfirmation'
    | 'chooseAllMatching'
    | 'onlyThisPage'
    | 'clearSelection'
>;

export function LibrarySelectionToolbar({ c }: { c: SelectionController }) {
    const { L } = useInterfaceText();

    function archiveSelected() {
        void c.openConfirmation('archive');
    }

    function restoreSelected() {
        void c.openConfirmation('restore');
    }

    const selectedArchive = c.selectedItems.some((item) => !item.archivedByMe);
    const selectedRestore = c.selectedItems.some((item) => item.archivedByMe);

    return (
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
                            className={componentStyles.selectionLink}
                        >
                            {L('scopeAll')}
                        </button>
                    ) : null}
                    {c.allMatching ? (
                        <button
                            type='button'
                            onClick={c.onlyThisPage}
                            className={componentStyles.selectionLink}
                        >
                            {L('onlyThisPage')}
                        </button>
                    ) : null}
                    <div className={componentStyles.selectionActions}>
                        {selectedArchive ? (
                            <Button
                                size='compact'
                                disabled={c.pending}
                                leadingIcon={
                                    <EyeOffIcon
                                        aria-hidden
                                        className={componentStyles.icon}
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
                                        className={componentStyles.icon}
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
    );
}
