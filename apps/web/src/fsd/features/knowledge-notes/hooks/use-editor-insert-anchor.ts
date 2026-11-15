import { useMemo, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import type { EditorInsertionTarget } from '../lib/editor-insertion-target';

export function useEditorInsertAnchor(
    editor: Editor,
    target: RefObject<EditorInsertionTarget | null>,
) {
    return useMemo(
        () => ({
            contextElement: editor.view.dom,
            getBoundingClientRect() {
                const range = target.current?.resolve();
                const point = editor.view.coordsAtPos(
                    range?.from ?? editor.state.selection.from,
                );

                return DOMRect.fromRect({
                    x: point.left,
                    y: point.top,
                    width: 1,
                    height: point.bottom - point.top,
                });
            },
        }),
        [editor, target],
    );
}
