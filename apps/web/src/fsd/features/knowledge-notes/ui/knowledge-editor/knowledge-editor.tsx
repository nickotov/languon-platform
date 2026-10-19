'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { KnowledgeLinkSchema, type KnowledgeBody } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { InlineAlert } from '@/fsd/shared/ui';
import {
    normalizeEditorDocument,
    toEditorDocument,
} from '../../lib/editor-document';
import { EditorToolbar } from './editor-toolbar';
import styles from './knowledge-editor.module.css';

export function KnowledgeEditor({
    value,
    onChange,
    disabled = false,
    onValidityChange,
}: {
    value: KnowledgeBody;
    onChange(value: KnowledgeBody): void;
    disabled?: boolean;
    onValidityChange?: ((valid: boolean) => void) | undefined;
}) {
    const { t } = useI18n();
    const [invalid, setInvalid] = useState(false);
    const acceptedValue = useRef(JSON.stringify(value));
    const extensions = useMemo(
        () => [
            StarterKit.configure({
                heading: { levels: [2, 3] },
                codeBlock: false,
                horizontalRule: false,
                link: {
                    openOnClick: false,
                    autolink: false,
                    linkOnPaste: false,
                    isAllowedUri: (url) =>
                        KnowledgeLinkSchema.safeParse(url).success,
                },
            }),
            TableKit.configure({ table: { resizable: false } }),
        ],
        [],
    );
    const editor = useEditor({
        extensions,
        content: toEditorDocument(value.document),
        immediatelyRender: false,
        shouldRerenderOnTransaction: true,
        enableContentCheck: true,
        editable: !disabled,
        editorProps: {
            attributes: {
                role: 'textbox',
                'aria-multiline': 'true',
                'aria-label': t('knowledge.explanation'),
                dir: 'auto',
            },
        },
        onContentError: () => setInvalid(true),
        onUpdate: ({ editor: current }) => {
            try {
                const body = normalizeEditorDocument(current.getJSON());
                acceptedValue.current = JSON.stringify(body);
                setInvalid(false);
                onChange(body);
            } catch {
                setInvalid(true);
            }
        },
    });

    useEffect(() => {
        editor?.setEditable(!disabled);
    }, [editor, disabled]);
    useEffect(() => {
        onValidityChange?.(!invalid);
    }, [invalid, onValidityChange]);
    useEffect(() => {
        if (!editor) return;
        const serialized = JSON.stringify(value);
        if (serialized === acceptedValue.current) return;
        try {
            editor.commands.setContent(toEditorDocument(value.document), {
                emitUpdate: false,
                errorOnInvalidContent: true,
            });
            acceptedValue.current = serialized;
            setInvalid(false);
        } catch {
            setInvalid(true);
        }
    }, [editor, value]);

    return (
        <div className={styles.root} aria-busy={!editor}>
            {editor && <EditorToolbar editor={editor} disabled={disabled} />}
            <EditorContent editor={editor} className={styles.content} />
            {invalid && (
                <InlineAlert tone='error'>
                    {t('knowledge.editorError')}
                </InlineAlert>
            )}
        </div>
    );
}
