'use client';

import {
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
} from 'react';
import { KnowledgeEmbedUrlSchema } from '@languon/contracts';
import { Button, Dialog, DialogActions, Input } from '@/fsd/shared/ui';
import type { editorInsertCopy } from '../../lib/editor-insert-copy';
import type { EditorEmbedKind } from '../../hooks/use-editor-embed-insertion';

export function InsertEmbedDialog({
    kind,
    copy,
    onClose,
    onInsert,
}: {
    kind: EditorEmbedKind;
    copy: ReturnType<typeof editorInsertCopy>;
    onClose(): void;
    onInsert(src: string): boolean;
}) {
    const formId = useId();
    const input = useRef<HTMLInputElement>(null);
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const label = kind === 'websiteEmbed' ? copy.websiteUrl : copy.imageUrl;

    useLayoutEffect(() => {
        input.current?.focus();
    }, []);

    function change(event: ChangeEvent<HTMLInputElement>) {
        setUrl(event.currentTarget.value);
        setError('');
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const parsed = KnowledgeEmbedUrlSchema.safeParse(url.trim());
        if (!parsed.success) {
            setError(copy.invalidUrl);
            input.current?.focus();

            return;
        }

        if (!onInsert(parsed.data)) {
            setError(copy.unavailable);
        }
    }

    const footer = (
        <DialogActions>
            <Button type='button' variant='secondary' onClick={onClose}>
                {copy.cancel}
            </Button>
            <Button type='submit' form={formId}>
                {copy.insert}
            </Button>
        </DialogActions>
    );

    return (
        <Dialog
            open
            size='sm'
            title={copy[kind]}
            onClose={onClose}
            showCloseButton={false}
            footer={footer}
        >
            <form id={formId} noValidate onSubmit={submit}>
                <Input
                    ref={input}
                    label={label}
                    type='url'
                    inputMode='url'
                    placeholder='https://…'
                    value={url}
                    onChange={change}
                    {...(error ? { error } : {})}
                />
            </form>
        </Dialog>
    );
}
