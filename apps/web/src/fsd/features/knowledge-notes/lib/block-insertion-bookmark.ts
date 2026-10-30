import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
export type BlockInsertionBookmark = {
    resolve(): number | null;
    release(): void;
};

/** Preserve the insertion cursor through asynchronous draft flushes, then detach. */
export function captureBlockInsertion(
    editor: Editor | null,
): BlockInsertionBookmark | null {
    if (!editor || editor.isDestroyed || !editor.isEditable) return null;
    let position = editor.state.selection.to;
    let valid = true;
    function map({ transaction }: { transaction: Transaction }) {
        const next = transaction.mapping.mapResult(position, 1);
        position = next.pos;
        valid = valid && !next.deleted;
    }
    editor.on('transaction', map);
    return {
        resolve() {
            return valid &&
                !editor.isDestroyed &&
                position <= editor.state.doc.content.size
                ? position
                : null;
        },
        release() {
            editor.off('transaction', map);
        },
    };
}
