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
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        const media = window.matchMedia('(max-width: 767px)');
        function update() {
            setNarrow(media.matches);
        }

        update();
        media.addEventListener('change', update);

        return () => media.removeEventListener('change', update);
    }, []);

    const target = useRef<EditorInsertionTarget | null>(null);
    const openedBySlash = useRef(false);
    function capture(from: number, to: number, slash: boolean) {
        openedBySlash.current = slash;
        target.current?.release();
        target.current = captureEditorInsertion(editor, from, to);
        setOpen(true);
    }

    useEffect(() => {
        function key(event: KeyboardEvent) {
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
                },
            }),
        );

        return () => {
            if (!editor.isDestroyed) {
                editor.unregisterPlugin(pluginKey);
            }
        };
    }, [editor, disabled]);

    useEffect(() => () => target.current?.release(), []);
    function show() {
        if (!disabled) {
            capture(
                editor.state.selection.to,
                editor.state.selection.to,
                false,
            );
        }
    }

    function close() {
        setOpen(false);
        target.current?.release();
        target.current = null;
        // Button-invoked pickers delegate return focus to Popover/Dialog.
        // Slash has no DOM invoker, so return to the editor's preserved caret.
        if (openedBySlash.current) {
            editor.commands.focus();
        }
    }

    function detach() {
        const value = target.current;
        target.current = null;
        setOpen(false);

        return value;
    }

    return {
        open,
        narrow,
        target,
        openedBySlash: openedBySlash.current,
        show,
        close,
        detach,
    };
}
