'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent } from '@tiptap/react';
import {
    getExerciseActivity,
    type ConversationPromptMention,
    type ExerciseActivityId,
    type SubmitConversationTurnRequest,
} from '@languon/contracts';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { ExerciseActivityPreview } from '@/fsd/entities/learning-blocks';
import { Button } from '@/fsd/shared/ui';
import type { Locale } from '@/fsd/shared/i18n';
import {
    serializePrompt,
    type PromptValue,
} from '../../../../lib/prompt-document';
import { promptCopy } from '../../../../lib/prompt-copy';
import { usePromptSources } from '../../../../hooks/use-prompt-sources';
import { usePromptExerciseRequest } from '../../../../hooks/use-prompt-exercise-request';
import { useRichPromptEditor } from '../../../../hooks/use-rich-prompt-editor';
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
    const [preview, setPreview] = useState<ExerciseActivityId | null>(null);
    const [limit, setLimit] = useState(false);
    const lastRequest = useRef<string | null>(null);
    const previewTrigger = useRef<HTMLElement | null>(null);
    const selection = useRef<{ from: number; to: number } | null>(null);
    const copy = promptCopy(props.locale);
    const editor = useRichPromptEditor(props, selection, showPreview);
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

    function close() {
        props.onClose();
        editor?.commands.focus();
    }

    function showPreview(id: ExerciseActivityId) {
        previewTrigger.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        setPreview(id);
    }

    function closePreview() {
        setPreview(null);
        requestAnimationFrame(() =>
            previewTrigger.current?.focus({ preventScroll: true }),
        );
    }

    function usePreview() {
        if (preview) {
            insertActivity(preview);
        }

        setPreview(null);
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
        <div className={styles.root}>
            {props.contextOpen && (
                <div hidden={Boolean(preview)}>
                    <PromptPicker
                        locale={props.locale}
                        blocks={props.blocks}
                        texts={props.texts}
                        onExercise={chooseExercise}
                        onBlock={chooseBlock}
                        onPreview={showPreview}
                        onClose={close}
                    />
                </div>
            )}
            {limit && <p role='alert'>{copy.limit}</p>}
            <EditorContent editor={editor} />
            {preview && (
                <ExerciseActivityPreview
                    activityId={preview}
                    locale={props.locale}
                    open
                    onClose={closePreview}
                    footer={footer}
                />
            )}
        </div>
    );
}
