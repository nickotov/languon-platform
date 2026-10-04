import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    AlertDialog,
    Button,
    Checkbox,
    DialogActions,
    InlineAlert,
} from '@/fsd/shared/ui';
import type { DictionaryCardDeletionController } from '../../hooks/use-dictionary-card-deletion';
import type { ChangeEvent } from 'react';
import styles from '../dictionary-card-list-common.module.css';

export function CardDeletionDialog({
    deletion,
}: {
    deletion: DictionaryCardDeletionController;
}) {
    const { t } = useI18n();

    const target = deletion.deletion;

    if (!target) return null;

    const count = target.kind === 'all' ? target.count : target.cards.length;

    const singleCard =
        target.kind === 'selected' && target.cards.length === 1
            ? target.cards[0]
            : null;

    const error = deletion.remove.error;

    const conflict =
        error instanceof DictionaryApiError &&
        (error.detail.code === 'version_conflict' ||
            error.detail.code === 'idempotency_conflict');

    const busy =
        error instanceof DictionaryApiError &&
        error.detail.code === 'deletion_busy';

    function resolveMessage() {
        if (busy) {
            return t('dictionary.deletion.busy');
        }

        if (error) {
            return dictionaryErrorMessage(error, t);
        }

        return null;
    }

    const message = resolveMessage();

    const pending = deletion.remove.isPending;

    function submitDeletion() {
        deletion.remove.mutate();
    }

    function changeAcknowledgement(event: ChangeEvent<HTMLInputElement>) {
        deletion.setAcknowledged(event.currentTarget.checked);
    }

    function reloadConflict() {
        void deletion.reloadConflict();
    }

    return (
        <AlertDialog
            closeLabel={t('dictionary.dialog.close')}
            description={
                singleCard
                    ? t('dictionary.deletion.cardIdentity', {
                          source: singleCard.values.source,
                          translation: singleCard.values.translation,
                      })
                    : t('dictionary.deletion.cardHelp', { count })
            }
            dismissible={!pending}
            footer={
                <DialogActions>
                    <Button
                        disabled={pending}
                        onClick={deletion.close}
                        type='button'
                        variant='secondary'
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        disabled={!deletion.acknowledged}
                        loading={pending}
                        onClick={submitDeletion}
                        type='button'
                        variant='danger'
                    >
                        {t('dictionary.deletion.deletePermanently')}
                    </Button>
                </DialogActions>
            }
            onClose={deletion.close}
            open
            showCloseButton={!pending}
            size='sm'
            title={t('dictionary.deletion.cardTitle', { count })}
        >
            <Checkbox
                checked={deletion.acknowledged}
                disabled={pending}
                label={t('dictionary.deletion.cardAcknowledge', { count })}
                onChange={changeAcknowledgement}
            />
            {message ? (
                <InlineAlert
                    className={styles.deletionError}
                    tone='danger'
                    title={t('dictionary.deletion.failed')}
                >
                    <p>{message}</p>
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
