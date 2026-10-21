'use client';
import { useState, type ChangeEvent } from 'react';
import type { TextDocument } from '@languon/contracts';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    Select,
} from '@/fsd/shared/ui';
import { useTextDestinations } from '../../hooks/use-text-destinations';
import { useTextMutation } from '../../hooks/use-text-mutation';
import styles from '../dialogs.module.css';

type Props = {
    document: TextDocument;
    onClose(): void;
    onSaved(document: TextDocument): void;
    requestWithSession: RequestWithTextSession;
};
export function MoveTextDialog({
    document,
    onClose,
    onSaved,
    requestWithSession,
}: Props) {
    const { t } = useI18n();
    const folders = useTextDestinations(requestWithSession);
    const mutation = useTextMutation(requestWithSession);
    const [destination, setDestination] = useState(document.folderId ?? '');
    const [confirmed, setConfirmed] = useState(false);
    const folder = folders.data?.find((item) => item.id === destination);
    const shared = Boolean(folder?.isShared);
    const options = [
        { value: '', label: t('texts.organization.independent') },
        ...(folders.data ?? []).map((item) => ({
            value: item.id,
            label: item.name,
        })),
    ];
    const disabled =
        mutation.busy ||
        document.lifecycle !== 'active' ||
        destination === (document.folderId ?? '') ||
        Boolean(destination && !folder) ||
        (shared && !confirmed);
    function change(event: ChangeEvent<HTMLSelectElement>) {
        setDestination(event.target.value);
        setConfirmed(false);
    }
    function confirm(event: ChangeEvent<HTMLInputElement>) {
        setConfirmed(event.target.checked);
    }
    function refresh() {
        void mutation.run(
            (token) => textsApi.getText(token, document.id),
            (result) => {
                onSaved(result.text);
                onClose();
            },
        );
    }
    function retryFolders() {
        void folders.refetch();
        setConfirmed(false);
    }
    function move() {
        if (disabled) return;
        void mutation.run(
            (token) =>
                textsApi.moveText(token, document.id, {
                    folderId: destination || null,
                    expectedVersion: document.version,
                    ...(shared && folder?.shareId && folder.shareVersion != null
                        ? {
                              sharedFolderConfirmation: {
                                  shareId: folder.shareId,
                                  shareVersion: folder.shareVersion!,
                              },
                          }
                        : {}),
                }),
            (result) => {
                onSaved(result.text);
                onClose();
            },
        );
    }
    return (
        <Dialog
            open
            onClose={onClose}
            dismissible={!mutation.busy}
            title={t('texts.organization.moveTitle')}
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        disabled={mutation.busy}
                        onClick={onClose}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={move}
                        disabled={disabled}
                        loading={mutation.busy}
                    >
                        {t('texts.organization.moveSubmit')}
                    </Button>
                </DialogActions>
            }
        >
            <div className={styles.stack}>
                <Select
                    label={t('texts.organization.destination')}
                    value={destination}
                    options={options}
                    onChange={change}
                    disabled={mutation.busy}
                />
                {folders.isPending && (
                    <p role='status'>{t('texts.organization.loading')}</p>
                )}
                {folders.isError && (
                    <InlineAlert
                        tone='error'
                        actions={
                            <Button onClick={retryFolders}>
                                {t('texts.library.retry')}
                            </Button>
                        }
                    >
                        {t('texts.library.errorHelp')}
                    </InlineAlert>
                )}
                {shared && (
                    <>
                        <InlineAlert tone='warning'>
                            {t('texts.organization.sharedWarning')}
                        </InlineAlert>
                        <label>
                            <input
                                type='checkbox'
                                checked={confirmed}
                                onChange={confirm}
                                disabled={mutation.busy}
                            />{' '}
                            {t('texts.organization.confirmShared')}
                        </label>
                    </>
                )}
                {mutation.error && (
                    <InlineAlert
                        tone='error'
                        actions={
                            <Button onClick={refresh} disabled={mutation.busy}>
                                {t('texts.library.retry')}
                            </Button>
                        }
                    >
                        {mutation.error}
                    </InlineAlert>
                )}
            </div>
        </Dialog>
    );
}
