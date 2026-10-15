'use client';
import { ArchiveIcon, CheckIcon } from 'lucide-react';
import { textsApi } from '@/fsd/entities/texts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, DialogActions, InlineAlert } from '@/fsd/shared/ui';
import { useTextMutation } from '../hooks/use-text-mutation';
import type { MutationProps, TextResource } from '../types';
import styles from './dialogs.module.css';

type Props = MutationProps<TextResource> & {
    kind: 'folder' | 'text';
    resource: TextResource;
};
export function ArchiveTextDialog({
    open,
    kind,
    resource,
    onClose,
    onSaved,
    requestWithSession,
}: Props) {
    const { t } = useI18n();
    const mutation = useTextMutation(requestWithSession);
    const name = 'name' in resource ? resource.name : resource.title;
    function archive() {
        void mutation.run(
            async (token) =>
                kind === 'folder'
                    ? (
                          await textsApi.archiveFolder(token, resource.id, {
                              expectedVersion: resource.version,
                          })
                      ).folder
                    : (
                          await textsApi.archiveText(token, resource.id, {
                              expectedVersion: resource.version,
                          })
                      ).text,
            (value) => {
                onSaved(value);
                onClose();
            },
            t('texts.manage.archived'),
        );
    }
    const consequences = [
        t(
            kind === 'folder'
                ? 'texts.manage.archiveFolderEffect'
                : 'texts.manage.archiveTextEffect',
        ),
        t('texts.manage.archiveSharing'),
        t('texts.manage.restorePrivate'),
        t('texts.manage.independentUnaffected'),
    ];
    return (
        <Dialog
            open={open}
            onClose={onClose}
            dismissible={!mutation.busy}
            size='sm'
            title={t('texts.manage.archiveTitle', { name })}
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        onClick={onClose}
                        disabled={mutation.busy}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant='danger'
                        loading={mutation.busy}
                        onClick={archive}
                        leadingIcon={<ArchiveIcon size={16} />}
                    >
                        {t(
                            kind === 'folder'
                                ? 'texts.manage.archiveFolder'
                                : 'texts.manage.archiveText',
                        )}
                    </Button>
                </DialogActions>
            }
        >
            <div className={styles.stack}>
                <ul className={styles.consequences}>
                    {consequences.map((text) => (
                        <li key={text}>
                            <CheckIcon aria-hidden />
                            <span>{text}</span>
                        </li>
                    ))}
                </ul>
                {mutation.error && (
                    <InlineAlert tone='error'>{mutation.error}</InlineAlert>
                )}
            </div>
        </Dialog>
    );
}
