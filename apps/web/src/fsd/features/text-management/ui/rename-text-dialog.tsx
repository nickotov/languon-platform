'use client';
import { useId, useState } from 'react';
import { TextTitleSchema, type TextDocument } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    Input,
} from '@/fsd/shared/ui';
import { useTextMutation } from '../hooks/use-text-mutation';
import type { MutationProps } from '../types';
import styles from './dialogs.module.css';

type Props = MutationProps<TextDocument> & { document: TextDocument };

export function RenameTextDialog(props: Props) {
    return props.open ? (
        <RenameForm
            key={`${props.document.id}:${props.document.version}`}
            {...props}
        />
    ) : null;
}

function RenameForm({ document, onClose, onSaved, requestWithSession }: Props) {
    const { t } = useI18n();
    const formId = useId();
    const [value, setValue] = useState(document.title);
    const [invalid, setInvalid] = useState(false);
    const mutation = useTextMutation(requestWithSession);

    function submit(event: React.FormEvent) {
        event.preventDefault();
        const parsed = TextTitleSchema.safeParse(value);
        if (!parsed.success) {
            setInvalid(true);
            return;
        }
        void mutation.run(
            (token) =>
                textsApi.saveText(token, document.id, {
                    kind: 'metadata',
                    title: parsed.data,
                    expectedVersion: document.version,
                }),
            (result) => {
                onSaved(result.text);
                onClose();
            },
            t('texts.manage.titleSaved'),
        );
    }

    return (
        <Dialog
            open
            onClose={onClose}
            dismissible={!mutation.busy}
            size='sm'
            title={t('texts.manage.renameText')}
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        onClick={onClose}
                        disabled={mutation.busy}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button type='submit' form={formId} loading={mutation.busy}>
                        {t('texts.manage.saveTitle')}
                    </Button>
                </DialogActions>
            }
        >
            <form
                id={formId}
                className={styles.stack}
                onSubmit={submit}
                noValidate
            >
                <Input
                    label={t('texts.manage.title')}
                    autoFocus
                    required
                    maxLength={200}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    {...(invalid
                        ? { error: t('texts.manage.titleError') }
                        : {})}
                    hint={t('texts.manage.renameHint')}
                />
                {mutation.error && (
                    <InlineAlert tone='error'>{mutation.error}</InlineAlert>
                )}
            </form>
        </Dialog>
    );
}
