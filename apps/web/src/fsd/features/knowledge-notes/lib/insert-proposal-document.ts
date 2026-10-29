import type { Editor, JSONContent } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Selection, type Transaction } from '@tiptap/pm/state';
import { normalizeEditorDocument } from './editor-document';

/** Build and validate away from the live editor: rejection must be atomic. */
export function prepareProposalDocument(
    editor: Editor,
    document: JSONContent,
    range: { from: number; to: number },
    append: boolean,
): Transaction | null {
    let touchesBlock = false;
    editor.state.doc.nodesBetween(range.from, range.to, (node) => {
        if (node.type.name === 'learningBlock') touchesBlock = true;
    });
    if (touchesBlock) return null;
    const nodes = (document.content ?? []).map((node) =>
        editor.schema.nodeFromJSON(node),
    );
    if (!nodes.length) return null;
    for (const node of nodes) node.check();

    const transaction = editor.state.tr;
    const start = transaction.doc.resolve(range.from);
    const end = transaction.doc.resolve(range.to);
    const inline =
        !append &&
        nodes.length === 1 &&
        nodes[0]?.type.name === 'paragraph' &&
        start.sameParent(end) &&
        start.parent.isTextblock;
    const content = inline ? nodes[0]!.content : Fragment.fromArray(nodes);
    transaction.replaceRange(range.from, range.to, new Slice(content, 0, 0));
    transaction.doc.check();
    const cursor = transaction.mapping.map(range.to, 1);
    transaction.setSelection(
        Selection.near(transaction.doc.resolve(cursor), -1),
    );
    // Include plugin-added nodes (for example StarterKit's trailing paragraph).
    // Applying to an immutable state does not dispatch or notify draft recovery.
    const candidate = editor.state.applyTransaction(transaction);
    if (!candidate.transactions.length) return null;
    normalizeEditorDocument(candidate.state.doc.toJSON());
    return transaction;
}
