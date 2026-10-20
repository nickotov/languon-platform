'use client';

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
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
import {
    mapProposalTarget,
    type KnowledgeEditorTarget,
} from '../../lib/proposal-target';
import { type EditorTargetAnchor } from '../../lib/editor-target-anchor';
import { useKnowledgeEditorHandle } from '../../hooks/use-knowledge-editor-handle';
import { EditorToolbar } from './editor-toolbar';
import styles from './knowledge-editor.module.css';
import { WorkspaceEditorChrome } from './workspace-editor-chrome';
import type { KnowledgeWorkspaceEditorOptions } from '../knowledge-note-form/knowledge-note-form';

export type KnowledgeEditorHandle = {
    getSnapshot(targetId?: string | null): {
        content: string;
        selectedPassage?: string;
        targetId?: string;
        editorTarget: Omit<EditorTargetAnchor, 'documentHash'>;
    };
    restoreTarget(anchor: EditorTargetAnchor): Promise<string | null>;
    applyProposal(
        text: string,
        action: 'insert' | 'append' | 'replace',
        targetId?: string,
    ): 'applied' | 'changed' | 'missing';
    getProposalPreview(targetId?: string): {
        original: string;
        current: string;
        before: string;
        after: string;
        end: string;
        changed: boolean;
    } | null;
    getProposalPosition(
        targetId: string,
    ): { top: number; left: number; width: number } | null;
    showTarget(targetId: string): void;
    getTargetComparison(targetId?: string): {
        original: string;
        current: string;
    } | null;
};

export const KnowledgeEditor = forwardRef<
    KnowledgeEditorHandle,
    {
        value: KnowledgeBody;
        onChange(value: KnowledgeBody): void;
        workspace?: KnowledgeWorkspaceEditorOptions | undefined;
        disabled?: boolean;
        toolbarVariant?: 'full' | 'tutor';
        label?: string;
        onValidityChange?: ((valid: boolean) => void) | undefined;
    }
>(function KnowledgeEditor(
    {
        value,
        onChange,
        disabled = false,
        onValidityChange,
        toolbarVariant = 'full',
        label,
        workspace,
    },
    ref,
) {
    const { t } = useI18n();
    const [invalid, setInvalid] = useState(false);
    const acceptedValue = useRef(JSON.stringify(value));
    const targets = useRef(new Map<string, KnowledgeEditorTarget>());
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
                'aria-label': label ?? t('knowledge.explanation'),
                dir: 'auto',
            },
        },
        onContentError: () => setInvalid(true),
        onUpdate: ({ editor: current }) => {
            try {
                const body = normalizeEditorDocument(current.getJSON());
                const serialized = JSON.stringify(body);
                if (serialized === acceptedValue.current) return;
                acceptedValue.current = serialized;
                setInvalid(false);
                onChange(body);
            } catch {
                setInvalid(true);
            }
        },
        onTransaction: ({ transaction }) => {
            if (!transaction.docChanged) return;
            for (const [id, target] of targets.current) {
                targets.current.set(
                    id,
                    mapProposalTarget(target, transaction.mapping),
                );
            }
        },
    });

    useKnowledgeEditorHandle(editor, disabled, ref, targets);

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

    if (workspace && editor)
        return (
            <WorkspaceEditorChrome
                editor={editor}
                disabled={disabled}
                workspace={workspace}
            >
                <EditorContent
                    editor={editor}
                    className={styles.workspaceContent}
                />
                {invalid && (
                    <InlineAlert tone='error'>
                        {t('knowledge.editorError')}
                    </InlineAlert>
                )}
            </WorkspaceEditorChrome>
        );

    return (
        <div className={styles.root} aria-busy={!editor}>
            {editor && (
                <EditorToolbar
                    editor={editor}
                    disabled={disabled}
                    variant={toolbarVariant}
                    label={label}
                />
            )}
            <EditorContent editor={editor} className={styles.content} />
            {invalid && (
                <InlineAlert tone='error'>
                    {t('knowledge.editorError')}
                </InlineAlert>
            )}
        </div>
    );
});
