import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    AlertDialog,
    Button,
    DialogActions,
    InlineAlert,
    Input,
} from '@/fsd/shared/ui';
import type { LibraryState } from '../../hooks/use-dictionary-library';
import type { ChangeEvent } from 'react';
import styles from '../dictionary-library-common.module.css';

export function LibraryDeletionDialog({ state }: { state: LibraryState }) {
    const { t } = useI18n();

    const deletion = state.deletion;

    if (!deletion) return null;

    const count =
        deletion.kind === 'all' ? deletion.count : deletion.targets.length;

    const single = deletion.kind === 'selected' && count === 1;

    const phrase = single
        ? deletion.targets[0]!.name
        : t('dictionary.deletion.dictionaryPhrase', { count });

    const pending = state.deleteDictionaries.isPending;

    const error = state.deleteDictionaries.error;

    const conflict =
        error instanceof DictionaryApiError &&
        (error.detail.code === 'version_conflict' ||
            error.detail.code === 'idempotency_conflict');

    const busy =
        error instanceof DictionaryApiError &&
        error.detail.code === 'deletion_busy';

    function resolveErrorMessage() {
        if (busy) {
            return t('dictionary.deletion.busy');
        }

        if (error) {
            return dictionaryErrorMessage(error, t);
        }

        return null;
    }

    const errorMessage = resolveErrorMessage();

    function submitDeletion() {
        state.deleteDictionaries.mutate();
    }

    function changeConfirmation(event: ChangeEvent<HTMLInputElement>) {
        state.setDeletionConfirmation(event.currentTarget.value);
    }

    function reloadConflict() {
        void state.reloadDeletionConflict();
    }

    return (
        <AlertDialog
            closeLabel={t('dictionary.dialog.close')}
            description={t('dictionary.deletion.dictionaryHelp', { count })}
            dismissible={!pending}
            footer={
                <DialogActions>
                    <Button
                        disabled={pending}
                        onClick={state.closeDeletion}
                        type='button'
                        variant='secondary'
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        disabled={state.deletionConfirmation !== phrase}
                        loading={pending}
                        onClick={submitDeletion}
                        type='button'
                        variant='danger'
                    >
                        {t('dictionary.deletion.deletePermanently')}
                    </Button>
                </DialogActions>
            }
            onClose={state.closeDeletion}
            open
            showCloseButton={!pending}
            size='sm'
            title={t('dictionary.deletion.dictionaryTitle', { count })}
        >
            <p className={styles.deletionWarning}>
                {t('dictionary.deletion.dictionaryConsequences')}
            </p>
            <Input
                autoComplete='off'
                disabled={pending}
                label={t('dictionary.deletion.typePhrase', { phrase })}
                onChange={changeConfirmation}
                value={state.deletionConfirmation}
            />
            {errorMessage ? (
                <InlineAlert
                    tone='danger'
                    title={t('dictionary.deletion.failed')}
                >
                    <p>{errorMessage}</p>
                    {conflict ? (
                        <Button
                            onClick={reloadConflict}
                            size='compact'
                            type='button'
                            variant='secondary'
                        >
                            {t('dictionary.conflict.reload')}
                        </Button>
                    ) : null}
                </InlineAlert>
            ) : null}
        </AlertDialog>
    );
}
