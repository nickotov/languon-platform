import { useEffect, useRef, type RefObject } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type {
    ConversationPromptMention,
    ExerciseActivityId,
} from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import {
    promptDocument,
    serializePrompt,
    type PromptValue,
} from '../lib/prompt-document';
import { navigatePromptMention } from '../lib/prompt-keyboard';
import { promptCopy } from '../lib/prompt-copy';
import { PromptMention } from '../ui/contextual-assistant/ui/prompt-mention/prompt-mention';
import styles from '../ui/styles/contextual-assistant-prompt-common.module.css';

export function useRichPromptEditor(
    props: {
        content: string;
        mentions: ConversationPromptMention[];
        onChange(value: PromptValue): void;
        label: string;
        locale: Locale;
        contextOpen: boolean;
        contextDisabled?: boolean;
        canSend: boolean;
        onContext(): void;
        onDismissContext?(): void;
        onNavigateContext?(direction: 'ArrowDown' | 'ArrowUp'): void;
        onSend(): void;
    },
    selection: RefObject<{ from: number; to: number } | null>,
    onPreview: (id: ExerciseActivityId) => void,
) {
    const latest = useRef(props);
    latest.current = props;
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: false,
                blockquote: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
                codeBlock: false,
                horizontalRule: false,
                code: false,
                bold: false,
                italic: false,
                strike: false,
                link: false,
                underline: false,
            }),
            PromptMention.configure({
                onPreview,
                removeLabel: promptCopy(props.locale).remove,
                missingLabel: promptCopy(props.locale).missing,
            }),
        ],
        content: promptDocument(props.content, props.mentions),
        editorProps: {
            attributes: {
                role: 'textbox',
                'aria-label': props.label,
                'aria-multiline': 'true',
                class: styles.input ?? '',
            },
            handleKeyDown(view, event) {
                if (event.isComposing) {
                    if (latest.current.contextOpen) {
                        latest.current.onDismissContext?.();
                    }

                    return false;
                }

                const contextWasOpen = latest.current.contextOpen;
                if (contextWasOpen) {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        latest.current.onDismissContext?.();

                        return true;
                    }

                    if (
                        (event.key === 'ArrowDown' ||
                            event.key === 'ArrowUp') &&
                        !event.shiftKey &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.altKey
                    ) {
                        event.preventDefault();
                        latest.current.onNavigateContext?.(event.key);

                        return true;
                    }

                    const editsText =
                        event.key.length === 1 ||
                        [
                            'Backspace',
                            'Delete',
                            'ArrowLeft',
                            'ArrowRight',
                            'Home',
                            'End',
                        ].includes(event.key) ||
                        (event.key === 'Enter' && event.shiftKey);

                    if (editsText) {
                        latest.current.onDismissContext?.();
                    }
                }

                if (navigatePromptMention(view, event)) {
                    return true;
                }

                if (
                    !contextWasOpen &&
                    !latest.current.contextDisabled &&
                    event.key === '/' &&
                    /(?:^|\s)$/u.test(
                        view.state.doc.textBetween(
                            0,
                            view.state.selection.from,
                            '\n',
                        ),
                    )
                ) {
                    event.preventDefault();
                    const from = view.state.selection.from;
                    view.dispatch(
                        view.state.tr.insertText(
                            '/',
                            from,
                            view.state.selection.to,
                        ),
                    );

                    selection.current = { from, to: from + 1 };

                    latest.current.onContext();

                    return true;
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!latest.current.contextOpen && latest.current.canSend) {
                        latest.current.onSend();
                    }

                    return true;
                }

                return false;
            },
            handleDOMEvents: {
                pointerdown() {
                    if (latest.current.contextOpen) {
                        latest.current.onDismissContext?.();
                    }

                    return false;
                },
                compositionstart() {
                    if (latest.current.contextOpen) {
                        latest.current.onDismissContext?.();
                    }

                    return false;
                },
            },
            clipboardTextSerializer(slice) {
                return slice.content.textBetween(
                    0,
                    slice.content.size,
                    '\n',
                    (node) =>
                        node.type.name === 'promptMention'
                            ? node.attrs.label
                            : '',
                );
            },
            handlePaste(view, event) {
                if (latest.current.contextOpen) {
                    latest.current.onDismissContext?.();
                }

                const text = event.clipboardData?.getData('text/plain');
                if (text === undefined) {
                    return false;
                }

                event.preventDefault();
                view.dispatch(view.state.tr.insertText(text));

                return true;
            },
        },
        onUpdate({ editor: instance, transaction }) {
            const value = serializePrompt(instance.getJSON());
            if (
                value.content.length <= 20000 &&
                value.promptMentions.length <= 64
            ) {
                latest.current.onChange({
                    ...value,
                    synchronize: Boolean(transaction.getMeta('promptSync')),
                });
            } else {
                instance.commands.undo();
            }
        },
        onSelectionUpdate({ editor: instance }) {
            selection.current = {
                from: instance.state.selection.from,
                to: instance.state.selection.to,
            };
        },
    });

    useEffect(() => {
        if (!editor) {
            return;
        }

        const value = serializePrompt(editor.getJSON());
        if (
            value.content !== props.content ||
            JSON.stringify(value.promptMentions) !==
                JSON.stringify(props.mentions)
        ) {
            editor.commands.setContent(
                promptDocument(props.content, props.mentions, editor.getJSON()),
                { emitUpdate: false },
            );
        }
    }, [editor, props.content, props.mentions]);

    return editor;
}
