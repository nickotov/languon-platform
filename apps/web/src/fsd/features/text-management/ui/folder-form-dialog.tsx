'use client';
import { useId, useState } from 'react';
import {
    CreateTextFolderRequestSchema,
    type TextFolder,
} from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    Input,
    Textarea,
} from '@/fsd/shared/ui';
import { useTextMutation } from '../hooks/use-text-mutation';
import type { MutationProps } from '../types';
import styles from './dialogs.module.css';

type Props = MutationProps<TextFolder> & { initial?: TextFolder | undefined };
export function FolderFormDialog(props: Props) {
    return props.open ? (
        <FolderForm key={props.initial?.id ?? 'new'} {...props} />
    ) : null;
}
function FolderForm({ initial, onClose, onSaved, requestWithSession }: Props) {
    const { t } = useI18n();
    const formId = useId();
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [invalid, setInvalid] = useState(false);
    const mutation = useTextMutation(requestWithSession);
    function submit(event: React.FormEvent) {
        event.preventDefault();
        const parsed = CreateTextFolderRequestSchema.safeParse({
            name,
            description: description.trim() || null,
        });
        if (!parsed.success) {
            setInvalid(true);
            return;
        }
        void mutation.run(
            (token) =>
                initial
                    ? textsApi.updateFolder(token, initial.id, {
                          ...parsed.data,
                          expectedVersion: initial.version,
                      })
                    : textsApi.createFolder(token, parsed.data),
            (result) => {
                onSaved(result.folder);
                onClose();
            },
            t(
                initial
                    ? 'texts.manage.folderUpdated'
                    : 'texts.manage.folderCreated',
            ),
        );
    }
    return (
        <Dialog
            open
            onClose={onClose}
            dismissible={!mutation.busy}
            title={t(
                initial ? 'texts.manage.editFolder' : 'texts.manage.newFolder',
            )}
            {...(!initial
                ? { description: t('texts.manage.folderDescription') }
                : {})}
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        disabled={mutation.busy}
                        onClick={onClose}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button type='submit' form={formId} loading={mutation.busy}>
                        {t(
                            initial
                                ? 'texts.manage.saveChanges'
                                : 'texts.manage.createFolder',
                        )}
                    </Button>
                </DialogActions>
            }
        >
            <form
                className={styles.stack}
                id={formId}
                onSubmit={submit}
                noValidate
            >
                <Input
                    label={t('texts.manage.name')}
                    required
                    autoFocus
                    value={name}
                    maxLength={120}
                    onChange={(event) => {
                        setName(event.target.value);
                        setInvalid(false);
                    }}
                    {...(invalid ? { error: t('texts.manage.nameError') } : {})}
                    placeholder={t('texts.manage.namePlaceholder')}
                />
                <Textarea
                    label={t('texts.manage.description')}
                    value={description}
                    maxLength={2000}
                    rows={3}
                    showCount
                    resize='none'
                    onChange={(event) => setDescription(event.target.value)}
                    description={t('texts.manage.descriptionHint')}
                />
                {mutation.error && (
                    <InlineAlert tone='error'>{mutation.error}</InlineAlert>
                )}
            </form>
        </Dialog>
    );
}
