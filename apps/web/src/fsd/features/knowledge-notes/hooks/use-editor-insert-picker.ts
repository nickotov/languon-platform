import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
    captureEditorInsertion,
    type EditorInsertionTarget,
} from '../lib/editor-insertion-target';

/** Slash is actual user text until an insertion action is accepted. */
export function useEditorInsertPicker(editor: Editor, disabled: boolean) {
    const [open, setOpen] = useState(false);
    const target = useRef<EditorInsertionTarget | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const isOpen = useRef(open);
    isOpen.current = open;
    const openedBySlash = useRef(false);
    function capture(from: number, to: number, slash: boolean) {
        openedBySlash.current = slash;
        target.current?.release();
        target.current = captureEditorInsertion(editor, from, to);
        isOpen.current = true;
        setOpen(true);
    }

    useEffect(() => {
        function key(event: KeyboardEvent) {
            if (isOpen.current) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close();

                    return;
                }

                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    const items =
                        panelRef.current?.querySelectorAll<HTMLElement>(
                            '[data-command-item]:not(:disabled)',
                        );
                    const item =
                        event.key === 'ArrowDown'
                            ? items?.[0]
                            : items?.[items.length - 1];

                    event.preventDefault();
                    item?.focus();

                    return;
                }

                // Ordinary typing stays in the source editor, including IME.
                dismiss();

                return;
            }

            const target = event.target;
            if (
                target instanceof HTMLElement &&
                (target.closest('[contenteditable="false"]') ||
                    target.closest('input,textarea,select,button'))
            ) {
                return;
            }

            const selection = editor.state.selection;
            if (
                disabled ||
                !editor.isEditable ||
                event.isComposing ||
                event.key !== '/' ||
                !selection.empty ||
                editor.isActive('link') ||
                editor.isActive('code') ||
                !selection.$from.parent.isTextblock
            ) {
                return;
            }

            const before = selection.$from.parent.textBetween(
                0,
                selection.$from.parentOffset,
            );

            if (before && !/\s$/u.test(before)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            const from = selection.from;
            editor.chain().focus().insertContent('/').run();
            capture(from, from + 1, true);
        }

        const pluginKey = new PluginKey('knowledgeInsertPicker');
        editor.registerPlugin(
            new Plugin({
                key: pluginKey,
                props: {
                    handleKeyDown(_view, event) {
                        key(event);

                        return event.defaultPrevented;
                    },
                    handleTextInput() {
                        dismiss();

                        return false;
                    },
                    handleDOMEvents: {
                        mousedown() {
                            dismiss();

                            return false;
                        },
                        compositionstart() {
                            dismiss();

                            return false;
                        },
                        paste() {
                            dismiss();

                            return false;
                        },
                    },
                },
            }),
            (plugin, plugins) => [plugin, ...plugins],
        );

        return () => {
            if (!editor.isDestroyed) {
                editor.unregisterPlugin(pluginKey);
            }
        };
    }, [editor, disabled]);

    useEffect(() => () => target.current?.release(), []);
    function show() {
        if (!disabled && editor.isEditable) {
            capture(
                editor.state.selection.to,
                editor.state.selection.to,
                false,
            );
        }
    }

    function dismiss() {
        if (!isOpen.current) {
            return;
        }

        isOpen.current = false;
        setOpen(false);
        target.current?.release();
        target.current = null;
    }

    function resumeTyping(text: string) {
        const position =
            target.current?.resolve()?.to ?? editor.state.selection.to;

        dismiss();
        editor
            .chain()
            .focus()
            .setTextSelection(position)
            .insertContent({ type: 'text', text })
            .run();
    }

    function close() {
        dismiss();
        // Button-invoked pickers delegate return focus to Popover/Dialog.
        // Slash has no DOM invoker, so return to the editor's preserved caret.
        if (openedBySlash.current) {
            editor.commands.focus();
        } else if (!editor.view.hasFocus()) {
            triggerRef.current?.focus({ preventScroll: true });
        }
    }

    function detach() {
        const value = target.current;
        target.current = null;
        isOpen.current = false;
        setOpen(false);

        return value;
    }

    return {
        open,
        target,
        openedBySlash: openedBySlash.current,
        panelRef,
        triggerRef,
        resumeTyping,
        show,
        close,
        detach,
    };
}
