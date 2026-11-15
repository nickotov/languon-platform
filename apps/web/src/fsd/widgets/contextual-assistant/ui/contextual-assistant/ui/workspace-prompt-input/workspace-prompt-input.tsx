'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import {
    getExerciseActivity,
    type ConversationPromptMention,
    type ExerciseActivityId,
    type SubmitConversationTurnRequest,
} from '@languon/contracts';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { ExerciseActivityPreview } from '@/fsd/entities/learning-blocks';
import { Button, PopoverAnchor, PopoverContent } from '@/fsd/shared/ui';
import type { Locale } from '@/fsd/shared/i18n';
import {
    serializePrompt,
    type PromptValue,
} from '../../../../lib/prompt-document';
import { promptCopy } from '../../../../lib/prompt-copy';
import { usePromptSources } from '../../../../hooks/use-prompt-sources';
import { usePromptExerciseRequest } from '../../../../hooks/use-prompt-exercise-request';
import { useRichPromptEditor } from '../../../../hooks/use-rich-prompt-editor';
import { usePromptPickerOverlay } from '../../../../hooks/use-prompt-picker-overlay';
import { PromptPicker } from '../prompt-picker/prompt-picker';
import styles from '../../../styles/contextual-assistant-prompt-common.module.css';

export function WorkspacePromptInput(props: {
    content: string;
    mentions: ConversationPromptMention[];
    onChange(value: PromptValue): void;
    label: string;
    locale: Locale;
    canSend: boolean;
    onSend(): void;
    contextOpen: boolean;
    onPreviewOpenChange?: ((open: boolean) => void) | undefined;
    contextDisabled?: boolean;
    onContext(): void;
    onClose(): void;
    texts: ReactNode;
    blocks: KnowledgeBlockReference[];
    selectedBlocks: KnowledgeBlockReference[];
    externalRequest?:
        | { id: string; exerciseActivityId?: ExerciseActivityId | undefined }
        | undefined;
    exerciseRequest?: SubmitConversationTurnRequest['exerciseRequest'];
}) {
    const [limit, setLimit] = useState(false);
    const lastRequest = useRef<string | null>(null);
    const selection = useRef<{ from: number; to: number } | null>(null);
    const copy = promptCopy(props.locale);
    const editorRef = useRef<Editor | null>(null);
    const overlay = usePromptPickerOverlay({
        editor: editorRef,
        open: props.contextOpen,
        onOpen: props.onContext,
        onClose: props.onClose,
        onPreviewOpenChange: props.onPreviewOpenChange,
    });
    const editor = useRichPromptEditor(
        {
            ...props,
            onContext: overlay.openFromSlash,
            onDismissContext: overlay.dismiss,
            onNavigateContext: overlay.navigate,
        },
        selection,
        overlay.showPreview,
    );

    editorRef.current = editor;
    function insertActivity(id: ExerciseActivityId, generate = false) {
        if (!editor) {
            return;
        }

        const activity = getExerciseActivity(id);
        const range = selection.current ?? editor.state.selection;
        editor
            .chain()
            .focus()
            .setTextSelection(range)
            .insertContent([
                ...(generate
                    ? [
                          {
                              type: 'text',
                              text: editor.isEmpty
                                  ? copy.generate
                                  : `\n\n${copy.generate}`,
                          },
                      ]
                    : []),
                {
                    type: 'promptMention',
                    attrs: {
                        kind: 'exercise',
                        activityId: id,
                        catalogVersion: 1,
                        label: activity.locales[props.locale].name,
                    },
                },
                { type: 'text', text: ' ' },
            ])
            .run();

        props.onClose();
    }

    function chooseExercise(id: ExerciseActivityId) {
        insertActivity(id);
    }

    function chooseBlock(id: string) {
        if (!editor) {
            return;
        }

        const current = serializePrompt(editor.getJSON()).promptMentions.filter(
            (item) => item.kind === 'block',
        );

        if (
            new Set(current.map((item) => item.blockId)).size >= 8 &&
            !current.some((item) => item.blockId === id)
        ) {
            setLimit(true);

            return;
        }

        const block = props.blocks.find((item) => item.id === id);
        if (!block) {
            return;
        }

        editor
            .chain()
            .focus()
            .setTextSelection(selection.current ?? editor.state.selection)
            .insertContent([
                {
                    type: 'promptMention',
                    attrs: { kind: 'block', blockId: id, label: block.title },
                },
                { type: 'text', text: ' ' },
            ])
            .run();

        props.onClose();
        setLimit(false);
    }

    function usePreview() {
        if (overlay.preview) {
            insertActivity(overlay.preview);
        }

        overlay.setPreview(null);
    }

    useEffect(() => {
        if (!editor) {
            return;
        }

        const request = props.externalRequest;
        if (request?.exerciseActivityId && request.id !== lastRequest.current) {
            selection.current = {
                from: editor.state.doc.content.size - 1,
                to: editor.state.doc.content.size - 1,
            };

            const activityId = request.exerciseActivityId;
            const frame = requestAnimationFrame(() => {
                lastRequest.current = request.id;
                insertActivity(activityId, true);
            });

            return () => cancelAnimationFrame(frame);
        }
    }, [editor, props.externalRequest]);

    usePromptSources(editor, props.selectedBlocks, props.blocks);
    usePromptExerciseRequest(
        editor,
        props.exerciseRequest,
        props.locale,
        props.selectedBlocks,
    );

    const footer = <Button onClick={usePreview}>{copy.use}</Button>;

    return (
        <div className={styles.root} ref={overlay.anchor}>
            <PopoverAnchor
                className={styles.anchor}
                virtualRef={overlay.virtualAnchor}
            />
            <PopoverContent
                ref={overlay.panel}
                side='top'
                align='start'
                autoFocus={false}
                returnFocus={false}
                closeOnFocusOut={false}
                dismissOnEscape={false}
                className={styles.overlay}
                aria-label={copy.title}
                hidden={Boolean(overlay.preview)}
            >
                <PromptPicker
                    locale={props.locale}
                    blocks={props.blocks}
                    texts={props.texts}
                    keepSourceFocus={overlay.slash}
                    onResumeTyping={overlay.resume}
                    onExercise={chooseExercise}
                    onBlock={chooseBlock}
                    onPreview={overlay.showPreview}
                    onClose={overlay.close}
                />
            </PopoverContent>

            {limit && <p role='alert'>{copy.limit}</p>}
            <EditorContent editor={editor} />
            {overlay.preview && (
                <ExerciseActivityPreview
                    activityId={overlay.preview}
                    locale={props.locale}
                    open
                    onClose={overlay.closePreview}
                    footer={footer}
                />
            )}
        </div>
    );
}
