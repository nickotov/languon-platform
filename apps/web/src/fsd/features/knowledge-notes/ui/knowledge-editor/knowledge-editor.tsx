'use client';
import { LessonPartProvenance } from '../../lib/lesson-part-provenance';
import type { BlockInsertionBookmark } from '../../lib/block-insertion-bookmark';
import { MessageSquarePlus } from 'lucide-react';

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
import { InlineAlert, type MenuItem } from '@/fsd/shared/ui';
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
import { EditorToolbar } from './ui/editor-toolbar/editor-toolbar';
import styles from '../styles/knowledge-editor-common.module.css';
import { WorkspaceEditorChrome } from './ui/workspace-editor-chrome/workspace-editor-chrome';
import type { UploadBlockAudio } from '../learning-block-authoring/ui/audio-block-upload/audio-block-upload';
import { BlockAuthoringProvider } from '../learning-block-authoring/ui/block-authoring-context/block-authoring-context';
import { LearningBlockAuthoring } from '../learning-block-authoring/learning-block-authoring';
import { LearningBlockTextGaps } from '../learning-block-authoring/learning-block-text-gaps';
import { LearningBlockNode } from '../learning-block-authoring/ui/learning-block-node/learning-block-node';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';
import { ExerciseGroupDrag } from '../../lib/exercise-group-drag';
import { ProseBlockDrag } from './prose-block-drag';
import { rejectCopiedLearningBlockDrop } from '../../lib/learning-block-drop';
import { pasteLearningBlock } from '../../lib/learning-block-paste';
import type { KnowledgeWorkspaceEditorOptions } from '../knowledge-note-form/knowledge-note-form';

export type KnowledgeEditorHandle = {
    captureBlockInsertion(): BlockInsertionBookmark | null;
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
        getBlockActions?: ((block: LearningBlock) => MenuItem[]) | undefined;
        uploadAudio?: UploadBlockAudio | undefined;
        workspace?: KnowledgeWorkspaceEditorOptions | undefined;
        disabled?: boolean;
        toolbarVariant?: 'full' | 'tutor';
        label?: string;
        onValidityChange?: ((valid: boolean) => void) | undefined;
    } & (
        | { preview?: undefined; onChange(value: KnowledgeBody): void }
        | {
              preview: {
                  blockViewOptions: KnowledgeWorkspaceEditorOptions['blockViewOptions'];
              };
              onChange?: never;
          }
    )
>(function KnowledgeEditor(
    {
        value,
        getBlockActions,
        onChange,
        disabled: disabledProp = false,
        preview,
        onValidityChange,
        toolbarVariant = 'full',
        label,
        workspace,
        uploadAudio,
    },
    ref,
) {
    const isPreview = Boolean(preview);
    const disabled = isPreview || disabledProp;
    const { t, locale } = useI18n();
    const blockLabels = useMemo(() => localizedBlockLabels(locale), [locale]);
    const [invalid, setInvalid] = useState(false);
    // The block parser canonicalizes field order. Compare the same projection
    // on both sides so selecting a node cannot mark an unchanged draft dirty.
    const serializedValue = useMemo(
        () =>
            JSON.stringify(
                isPreview ? value : normalizeEditorDocument(value.document),
            ),
        [isPreview, value],
    );
    const acceptedValue = useRef(serializedValue);
    const targets = useRef(new Map<string, KnowledgeEditorTarget>());
    const extensions = useMemo(() => {
        const documentExtensions = [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                codeBlock: false,
                link: {
                    openOnClick: false,
                    autolink: false,
                    linkOnPaste: false,
                    isAllowedUri: (url) =>
                        KnowledgeLinkSchema.safeParse(url).success,
                },
            }),
            LessonPartProvenance,
            TableKit.configure({
                table: { resizable: false, allowTableNodeSelection: true },
            }),
            (isPreview
                ? LearningBlockNode.extend({
                      draggable: false,
                      selectable: false,
                  })
                : LearningBlockNode
            ).configure({ labels: blockLabels }),
        ];

        if (isPreview) {
            return documentExtensions;
        }

        return [
            ...documentExtensions,
            ExerciseGroupDrag,
            ProseBlockDrag.configure({
                label: (node) => {
                    let headingKey:
                        | 'knowledge.heading1'
                        | 'knowledge.heading2'
                        | 'knowledge.heading3' = 'knowledge.heading2';

                    if (node.attrs.level === 1) {
                        headingKey = 'knowledge.heading1';
                    }

                    if (node.attrs.level === 3) {
                        headingKey = 'knowledge.heading3';
                    }

                    const names: Record<string, string> = {
                        paragraph: t('knowledge.paragraph'),
                        horizontalRule: t('knowledge.horizontalRule'),
                        heading: t(headingKey),
                        bulletList: t('knowledge.bulletList'),
                        orderedList: t('knowledge.orderedList'),
                        blockquote: t('knowledge.blockquote'),
                        table: t('knowledge.table'),
                    };

                    return `${blockLabels.field('Select or drag block')}: ${names[node.type.name] ?? node.type.name}`;
                },
            }),
            LearningBlockTextGaps.configure({
                label: blockLabels.field('Write here…'),
            }),
        ];
    }, [blockLabels, t, isPreview]);
    const editor = useEditor({
        extensions,
        content: toEditorDocument(value.document),
        immediatelyRender: false,
        shouldRerenderOnTransaction: true,
        enableContentCheck: true,
        editable: !disabled,
        editorProps: {
            handleDrop: (_view, _event, slice, moved) =>
                rejectCopiedLearningBlockDrop(slice, moved),
            handlePaste: (view, event) => {
                if (disabled) {
                    return false;
                }

                const result = pasteLearningBlock(view, event);
                if (result !== 'none') {
                    setInvalid(result === 'invalid');
                }

                return result !== 'none';
            },
            attributes: {
                ...(isPreview
                    ? { role: 'group' }
                    : { role: 'textbox', 'aria-multiline': 'true' }),
                'aria-label': label ?? t('knowledge.explanation'),
                dir: 'auto',
            },
        },
        onContentError: () => setInvalid(true),
        onUpdate: ({ editor: current }) => {
            if (!onChange) {
                return;
            }

            try {
                const body = normalizeEditorDocument(current.getJSON());
                const serialized = JSON.stringify(body);
                if (serialized === acceptedValue.current) {
                    return;
                }

                acceptedValue.current = serialized;
                setInvalid(false);
                onChange(body);
            } catch {
                setInvalid(true);
            }
        },
        onTransaction: ({ transaction }) => {
            if (!transaction.docChanged) {
                return;
            }

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
        if (!editor) {
            return;
        }

        const serialized = serializedValue;

        if (serialized === acceptedValue.current) {
            return;
        }

        let cancelled = false;
        // React node views flush synchronously. Apply recovered content after
        // this effect, and discard superseded/unmounted updates before dispatch.
        queueMicrotask(() => {
            if (cancelled || editor.isDestroyed) {
                return;
            }

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
        });

        return () => {
            cancelled = true;
        };
    }, [editor, value, serializedValue]);

    const authoring =
        editor && !isPreview && toolbarVariant !== 'tutor' ? (
            <LearningBlockAuthoring
                editor={editor}
                disabled={disabled}
                labels={blockLabels}
                uploadAudio={uploadAudio ?? workspace?.uploadAudio}
                library={workspace?.library}
                blockCopy={workspace?.blockCopy}
                onGenerateExercise={workspace?.onGenerateExercise}
            />
        ) : null;

    let content;
    if (workspace && !isPreview && editor) {
        content = (
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
    } else {
        content = (
            <div
                className={styles.root}
                data-editor-preview={isPreview || undefined}
                aria-busy={!editor}
            >
                {editor && !isPreview && (
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
    }

    function blockActions(block: LearningBlock): MenuItem[] {
        const actions = [...(getBlockActions?.(block) ?? [])];
        if (workspace?.onMentionBlock) {
            actions.push({
                label: t('knowledge.addBlockToChat'),
                icon: <MessageSquarePlus size={16} aria-hidden />,
                onSelect() {
                    workspace.onMentionBlock?.(block.id);
                },
            });
        }

        return actions;
    }

    const authoringEnabled = !disabled && toolbarVariant !== 'tutor';

    return (
        <BlockAuthoringProvider
            enabled={authoringEnabled}
            library={workspace?.library}
            renderBlockMenu={workspace?.renderBlockMenu}
            blockAccents={workspace?.blockAccents}
            fieldAi={workspace?.fieldAi}
            languageDefaults={workspace?.languageDefaults}
            renderAudioPreparation={workspace?.renderAudioPreparation}
            blockViewOptions={
                preview?.blockViewOptions ?? workspace?.blockViewOptions
            }
            canDuplicateOnServer={Boolean(workspace?.blockCopy)}
            additionalActions={blockActions}
        >
            {content}
        </BlockAuthoringProvider>
    );
});
