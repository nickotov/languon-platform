'use client';
import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { TextFolder } from '@languon/contracts';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    Select,
} from '@/fsd/shared/ui';
import { useTextDestinations } from '../../hooks/use-text-destinations';
import { FolderFormDialog } from '../folder-form-dialog';
import styles from '../dialogs.module.css';

type Props = {
    open: boolean;
    initialFolderId?: string | null;
    onClose(): void;
    requestWithSession: RequestWithTextSession;
};
export function NewTextDialog(props: Props) {
    return props.open ? <NewTextForm {...props} /> : null;
}
function NewTextForm({ initialFolderId, onClose, requestWithSession }: Props) {
    const { t, href } = useI18n();
    const router = useRouter();
    const folders = useTextDestinations(requestWithSession);
    const [destination, setDestination] = useState(initialFolderId ?? '');
    const [creating, setCreating] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const folder = folders.data?.find((item) => item.id === destination);
    const shared = Boolean(folder?.isShared);
    function confirm(event: ChangeEvent<HTMLInputElement>) {
        setConfirmed(event.target.checked);
    }
    const options = [
        { value: '', label: t('texts.organization.independent') },
        ...(folders.data ?? []).map((folder) => ({
            value: folder.id,
            label: folder.name,
        })),
    ];
    function change(event: ChangeEvent<HTMLSelectElement>) {
        setDestination(event.target.value);
        setConfirmed(false);
    }
    function create() {
        setCreating(true);
    }
    function closeCreate() {
        setCreating(false);
    }
    function created(folder: TextFolder) {
        setDestination(folder.id);
        setConfirmed(false);
        setCreating(false);
    }
    function proceed() {
        if ((shared && !confirmed) || (destination && !folder)) return;
        const params = new URLSearchParams();
        if (destination) params.set('folderId', destination);
        if (shared && folder?.shareId && folder.shareVersion != null) {
            params.set('shareId', folder.shareId);
            params.set('shareVersion', String(folder.shareVersion));
        }
        const path = params.size
            ? `/texts/new?${params.toString()}`
            : '/texts/new';
        onClose();
        router.push(href(path));
    }
    return (
        <>
            <Dialog
                open
                onClose={onClose}
                title={t('texts.organization.newText')}
                footer={
                    <DialogActions>
                        <Button variant='secondary' onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            onClick={proceed}
                            disabled={Boolean(
                                (shared && !confirmed) ||
                                (destination && !folder),
                            )}
                        >
                            {t('texts.organization.continue')}
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
                    />
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
                                />{' '}
                                {t('texts.organization.confirmShared')}
                            </label>
                        </>
                    )}
                    {folders.isPending && (
                        <p role='status'>{t('texts.organization.loading')}</p>
                    )}
                    {folders.isError && (
                        <InlineAlert tone='error'>
                            {t('texts.library.errorHelp')}
                        </InlineAlert>
                    )}
                    <Button variant='secondary' onClick={create}>
                        {t('texts.library.newFolder')}
                    </Button>
                </div>
            </Dialog>
            <FolderFormDialog
                open={creating}
                onClose={closeCreate}
                onSaved={created}
                requestWithSession={requestWithSession}
            />
        </>
    );
}
