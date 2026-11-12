import { Trash2 } from 'lucide-react';
import { dictionaryDeletionSelectedTargetLimit } from '@languon/contracts';
import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Checkbox, InlineAlert } from '@/fsd/shared/ui';
import type { LibraryState } from '../../../../hooks/use-dictionary-library';
import styles from '../../../styles/dictionary-library-common.module.css';

type SelectionState = Pick<
    LibraryState,
    | 'list'
    | 'selected'
    | 'deleteDictionaries'
    | 'deletionPreview'
    | 'selectionLimitReached'
    | 'toggleAllLoaded'
    | 'openSelectedDeletion'
    | 'openAllDeletion'
>;

export function ArchivedDictionarySelection({
    state,
}: {
    state: SelectionState;
}) {
    const { t } = useI18n();

    const allLoadedSelected =
        state.list.length > 0 &&
        state.list.every((entry) => state.selected.has(entry.id));

    const someLoadedSelected = state.list.some((entry) =>
        state.selected.has(entry.id),
    );

    function openSelectedDeletion() {
        state.openSelectedDeletion();
    }

    return (
        <div>
            <div className={styles.selectionToolbar}>
                <Checkbox
                    checked={allLoadedSelected}
                    disabled={
                        !state.list.length || state.deleteDictionaries.isPending
                    }
                    indeterminate={someLoadedSelected && !allLoadedSelected}
                    label={t('dictionary.deletion.selectLoaded')}
                    onChange={state.toggleAllLoaded}
                />
                <span className={styles.selectionCount}>
                    {t('dictionary.deletion.selectedCount', {
                        count: state.selected.size,
                    })}
                </span>
                <div className={styles.selectionActions}>
                    <Button
                        disabled={!state.selected.size}
                        leadingIcon={<Trash2 aria-hidden size={16} />}
                        onClick={openSelectedDeletion}
                        size='compact'
                        type='button'
                        variant='danger'
                    >
                        {t('dictionary.deletion.deleteSelected')}
                    </Button>
                    <Button
                        loading={state.deletionPreview.isPending}
                        onClick={state.openAllDeletion}
                        size='compact'
                        type='button'
                        variant='secondary'
                    >
                        {t('dictionary.deletion.deleteAllArchived')}
                    </Button>
                </div>
            </div>
            {state.deletionPreview.error ? (
                <InlineAlert
                    tone='danger'
                    title={t('dictionary.deletion.failed')}
                >
                    {dictionaryErrorMessage(state.deletionPreview.error, t)}
                </InlineAlert>
            ) : null}
            {state.selectionLimitReached ? (
                <InlineAlert tone='warning'>
                    {t('dictionary.deletion.selectionLimit', {
                        count: dictionaryDeletionSelectedTargetLimit,
                    })}
                </InlineAlert>
            ) : null}
        </div>
    );
}
