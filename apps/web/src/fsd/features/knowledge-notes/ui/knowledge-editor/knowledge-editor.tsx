'use client';

import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
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
import {
    editorPlainOffset,
    editorPlainText,
    hashEditorText,
    restoreEditorPositions,
    type EditorTargetAnchor,
} from '../../lib/editor-target-anchor';
import { EditorToolbar } from './editor-toolbar';
import styles from './knowledge-editor.module.css';

export type KnowledgeEditorHandle = {
    getSnapshot(): {
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

    useImperativeHandle(
        ref,
        () => ({
            getSnapshot() {
                if (!editor)
                    throw new Error('The document editor is still loading.');
                const { from, to } = editor.state.selection;
                const selectedText = editor.state.doc.textBetween(
                    from,
                    to,
                    '\n',
                    '\n',
                );
                const targetId = crypto.randomUUID();
                targets.current.set(targetId, {
                    id: targetId,
                    from,
                    to,
                    selectedText,
                    changed: false,
                });
                const content = editorPlainText(editor.state.doc);
                const plainFrom = editorPlainOffset(editor.state.doc, from);
                const plainTo = editorPlainOffset(editor.state.doc, to);
                return {
                    content,
                    ...(selectedText ? { selectedPassage: selectedText } : {}),
                    targetId,
                    editorTarget: {
                        from: plainFrom,
                        to: plainTo,
                        originalText: content.slice(plainFrom, plainTo),
                    },
                };
            },
            async restoreTarget(anchor) {
                if (!editor) return null;
                const doc = editor.state.doc;
                const content = editorPlainText(doc);
                if ((await hashEditorText(content)) !== anchor.documentHash)
                    return null;
                if (editor.state.doc !== doc) return null;
                const positions = restoreEditorPositions(doc, anchor);
                if (!positions) return null;
                const targetId = crypto.randomUUID();
                targets.current.set(targetId, {
                    id: targetId,
                    ...positions,
                    selectedText: anchor.originalText,
                    changed: false,
                });
                return targetId;
            },
            applyProposal(text, action, targetId) {
                if (!editor || disabled) return 'missing';
                let from = editor.state.doc.content.size;
                let to = from;
                if (action !== 'append') {
                    const target = targetId
                        ? targets.current.get(targetId)
                        : null;
                    if (!target) return 'missing';
                    if (target.changed) return 'changed';
                    if (action === 'replace' && target.from === target.to)
                        return 'missing';
                    if (
                        target.from > editor.state.doc.content.size ||
                        target.to > editor.state.doc.content.size ||
                        target.from > target.to
                    )
                        return 'missing';
                    const current = editor.state.doc.textBetween(
                        target.from,
                        target.to,
                        '\n',
                        '\n',
                    );
                    if (current !== target.selectedText) return 'changed';
                    from = target.from;
                    to = action === 'replace' ? target.to : target.from;
                }
                const content = text.split('\n').map((line) => ({
                    type: 'paragraph',
                    ...(line
                        ? { content: [{ type: 'text', text: line }] }
                        : {}),
                }));
                const applied = editor
                    .chain()
                    .focus()
                    .insertContentAt({ from, to }, content)
                    .run();
                if (!applied) return 'missing';
                if (targetId) targets.current.delete(targetId);
                return 'applied';
            },
            getTargetComparison(targetId) {
                const target = targetId ? targets.current.get(targetId) : null;
                if (!editor || !target) return null;
                const from = Math.min(
                    target.from,
                    target.to,
                    editor.state.doc.content.size,
                );
                const to = Math.min(
                    Math.max(target.from, target.to),
                    editor.state.doc.content.size,
                );
                const current = editor.state.doc.textBetween(
                    from,
                    to,
                    '\n',
                    '\n',
                );
                return { original: target.selectedText, current };
            },
        }),
        [editor, disabled],
    );

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
