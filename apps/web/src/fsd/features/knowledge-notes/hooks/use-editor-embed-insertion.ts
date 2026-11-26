import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
    insertNodesAtTarget,
    type EditorInsertionTarget,
} from '../lib/editor-insertion-target';

export type EditorEmbedKind = 'websiteEmbed' | 'imageEmbed';

export function useEditorEmbedInsertion(editor: Editor) {
    const [insertion, setInsertion] = useState<{
        kind: EditorEmbedKind;
        target: EditorInsertionTarget;
    } | null>(null);

    useEffect(() => () => insertion?.target.release(), [insertion]);

    function open(kind: EditorEmbedKind, target: EditorInsertionTarget) {
        setInsertion({ kind, target });
    }

    function close() {
        setInsertion(null);
        editor.commands.focus();
    }

    function insert(src: string) {
        if (!insertion) {
            return false;
        }

        const inserted = insertNodesAtTarget(editor, insertion.target, [
            { type: insertion.kind, attrs: { src } },
        ]);

        if (inserted) {
            close();
        }

        return inserted;
    }

    return { kind: insertion?.kind, open, close, insert };
}
