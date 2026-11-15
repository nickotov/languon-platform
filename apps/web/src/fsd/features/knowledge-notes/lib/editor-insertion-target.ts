import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import type { LearningBlock } from '@languon/contracts';

export type EditorInsertionTarget = {
    resolve(): { from: number; to: number } | null;
    release(): void;
};

/** Keep the slash range anchored while a dialog is open; edited/deleted targets fail closed. */
export function captureEditorInsertion(
    editor: Editor,
    from: number,
    to: number,
): EditorInsertionTarget {
    let range = { from, to };
    let valid = true;
    function map({ transaction }: { transaction: Transaction }) {
        const start = transaction.mapping.mapResult(range.from, 1);
        const end = transaction.mapping.mapResult(range.to, -1);
        valid = valid && !start.deleted && !end.deleted;
        range = { from: start.pos, to: end.pos };
    }

    editor.on('transaction', map);

    return {
        resolve() {
            return valid &&
                !editor.isDestroyed &&
                editor.isEditable &&
                range.from <= range.to &&
                range.to <= editor.state.doc.content.size
                ? range
                : null;
        },
        release() {
            editor.off('transaction', map);
        },
    };
}

export function insertBlocksAtTarget(
    editor: Editor,
    target: EditorInsertionTarget,
    blocks: LearningBlock[],
) {
    const range = target.resolve();
    if (!range) {
        return false;
    }

    return editor
        .chain()
        .focus()
        .command(({ tr }) => {
            closeHistory(tr);

            return true;
        })
        .insertContentAt(
            range,
            blocks.map((block) => ({
                type: 'learningBlock',
                attrs: { block },
            })),
        )
        .run();
}
