'use client';

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import {
    KnowledgeLinkSchema,
    type KnowledgeBody,
    type LearningBlock,
} from '@languon/contracts';
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
import type { UploadBlockAudio } from '../learning-block-authoring/audio-block-upload';
import { LearningBlockAuthoring } from '../learning-block-authoring/learning-block-authoring';
import { LearningBlockNode } from '../learning-block-authoring/learning-block-node';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';
import { pasteLearningBlock } from '../../lib/learning-block-paste';
import type { KnowledgeWorkspaceEditorOptions } from '../knowledge-note-form/knowledge-note-form';

export type KnowledgeEditorHandle = {
    appendLearningBlock(block: LearningBlock): boolean;
    replaceLearningBlock(
        expected: LearningBlock,
        replacement: LearningBlock,
    ): 'applied' | 'changed' | 'missing' | 'invalid';
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
        format?: 'markdown' | 'plain-text',
    ): 'applied' | 'changed' | 'missing' | 'invalid';
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
        uploadAudio?: UploadBlockAudio | undefined;
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
        uploadAudio,
    },
    ref,
) {
    const { t, locale } = useI18n();
    const blockLabels = useMemo(() => localizedBlockLabels(locale), [locale]);
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
            LearningBlockNode.configure({ labels: blockLabels }),
        ],
        [blockLabels],
    );
    const editor = useEditor({
        extensions,
        content: toEditorDocument(value.document),
        immediatelyRender: false,
        shouldRerenderOnTransaction: true,
        enableContentCheck: true,
        editable: !disabled,
        editorProps: {
            handlePaste: (view, event) => {
                if (disabled) return false;
                const result = pasteLearningBlock(view, event);
                if (result !== 'none') setInvalid(result === 'invalid');
                return result !== 'none';
            },
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

    const authoring =
        editor && toolbarVariant !== 'tutor' ? (
            <LearningBlockAuthoring
                editor={editor}
                disabled={disabled}
                labels={blockLabels}
                uploadAudio={uploadAudio ?? workspace?.uploadAudio}
                library={workspace?.library}
                blockCopy={workspace?.blockCopy}
            />
        ) : null;

    if (workspace && editor)
        return (
            <WorkspaceEditorChrome
                editor={editor}
                disabled={disabled}
                workspace={workspace}
                authoring={authoring}
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
            {authoring}
            {invalid && (
                <InlineAlert tone='error'>
                    {t('knowledge.editorError')}
                </InlineAlert>
            )}
        </div>
    );
});
