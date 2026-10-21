import type { ChangeEvent } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    Input,
    Select,
} from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import {
    useSharedTextCopy,
    type SharedCopyTarget,
} from '../../hooks/use-shared-text-copy';
import styles from './public-page.module.css';

import copyStyles from './copy-dialog.module.css';

export function PublicCopyDialog(props: {
    target: SharedCopyTarget;
    kind: 'text' | 'folder';
    shareId: string;
    shareKey: string;
    requestWithSession: RequestWithTextSession;
    onDone(folderId: string): void;
    onClose(): void;
}) {
    const { t } = useI18n();
    const copy = useSharedTextCopy(props);
    const working = copy.state === 'working';
    const locked = copy.state !== 'idle';
    const title = t(
        props.target.mode === 'folder'
            ? 'texts.public.folderCopyTitle'
            : 'texts.public.copyTitle',
    );
    const options = (copy.folders.data ?? []).map((folder) => ({
        value: folder.id,
        label: folder.name,
    }));
    const canChoose = props.target.mode === 'text';

    function close() {
        if (!working) props.onClose();
    }

    function destination(event: ChangeEvent<HTMLInputElement>) {
        copy.setDestination(event.target.value);
    }

    function confirmShare(event: ChangeEvent<HTMLInputElement>) {
        copy.confirmShare(event.target.checked);
    }
    function name(event: ChangeEvent<HTMLInputElement>) {
        copy.setName(event.target.value);
    }

    function folder(event: ChangeEvent<HTMLSelectElement>) {
        copy.setFolderId(event.target.value);
    }

    function retryFolders() {
        void copy.folders.refetch();
    }

    let destinationField = null;
    if (copy.destination === 'existing')
        destinationField = (
            <Select
                label={t('texts.public.folder')}
                value={copy.folderId}
                options={options}
                onChange={folder}
                disabled={locked}
                placeholder={t('texts.public.folder')}
            />
        );
    else if (copy.destination === 'new')
        destinationField = (
            <Input
                label={t('texts.public.name')}
                value={copy.name}
                onChange={name}
                disabled={locked}
                maxLength={120}
                required
            />
        );

    const footer = (
        <DialogActions>
            <Button variant='secondary' onClick={close} disabled={working}>
                {t('texts.public.cancel')}
            </Button>
            <Button
                desktopIconOnly
                loading={working}
                disabled={copy.overLimit || !copy.valid}
                onClick={copy.submit}
                leadingIcon={<Copy size={16} aria-hidden />}
            >
                {t('texts.public.makeCopy')}
            </Button>
        </DialogActions>
    );

    return (
        <Dialog
            open
            onClose={close}
            title={title}
            closeLabel={t('texts.public.close')}
            dismissOnEscape={!working}
            dismissOnOverlayClick={!working}
            dismissible={!working}
            footer={footer}
        >
            <div className={styles.stack}>
                <p className={styles.notice}>{t('texts.public.independent')}</p>
                {copy.overLimit && (
                    <InlineAlert tone='warning'>
                        {t('texts.public.limit')}
                    </InlineAlert>
                )}
                {copy.folders.isError && (
                    <InlineAlert
                        tone='error'
                        actions={
                            <Button variant='secondary' onClick={retryFolders}>
                                {t('texts.public.retry')}
                            </Button>
                        }
                    >
                        {t('texts.public.failed')}
                    </InlineAlert>
                )}
                {canChoose && (
                    <fieldset className={copyStyles.destinations}>
                        <legend>{t('texts.public.destination')}</legend>
                        <label>
                            <input
                                type='radio'
                                name='copyDestination'
                                value='independent'
                                checked={copy.destination === 'independent'}
                                onChange={destination}
                                disabled={locked}
                            />
                            {t('texts.organization.independent')}
                        </label>
                        <label>
                            <input
                                type='radio'
                                name='copyDestination'
                                value='existing'
                                checked={copy.destination === 'existing'}
                                onChange={destination}
                                disabled={locked}
                            />
                            {t('texts.public.existing')}
                        </label>
                        <label>
                            <input
                                type='radio'
                                name='copyDestination'
                                value='new'
                                checked={copy.destination === 'new'}
                                onChange={destination}
                                disabled={locked}
                            />
                            {t('texts.public.new')}
                        </label>
                    </fieldset>
                )}
                {destinationField}
                {copy.sharedDestination && (
                    <>
                        <InlineAlert tone='warning'>
                            {t('texts.organization.sharedWarning')}
                        </InlineAlert>
                        <label>
                            <input
                                type='checkbox'
                                checked={copy.confirmedShare}
                                onChange={confirmShare}
                                disabled={locked}
                            />{' '}
                            {t('texts.organization.confirmShared')}
                        </label>
                    </>
                )}
                {working && <p role='status'>{t('texts.public.working')}</p>}
                {copy.state === 'failed' && (
                    <InlineAlert
                        tone='error'
                        actions={
                            <Button
                                desktopIconOnly
                                variant='secondary'
                                size='compact'
                                onClick={copy.submit}
                                leadingIcon={
                                    <RefreshCw size={16} aria-hidden />
                                }
                            >
                                {t('texts.public.retry')}
                            </Button>
                        }
                    >
                        {t('texts.public.failed')}
                    </InlineAlert>
                )}
            </div>
        </Dialog>
    );
}
