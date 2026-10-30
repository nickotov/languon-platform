import type { Node as DocumentNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';
import { normalizeEditorDocument } from './editor-document';

export function moveEditorBlock(
    view: EditorView,
    active: { position: number; node: DocumentNode },
    target: number,
    copy = false,
) {
    if (
        !view.editable ||
        view.state.doc.nodeAt(active.position) !== active.node
    )
        return;
    const end = active.position + active.node.nodeSize;
    if (target >= active.position && target <= end) return;
    const transaction = closeHistory(view.state.tr);
    if (!copy) transaction.delete(active.position, end);
    const destination = transaction.mapping.map(target);
    transaction.insert(destination, active.node);
    try {
        normalizeEditorDocument(transaction.doc.toJSON());
    } catch {
        // A bounded invalid copy/move never mutates the document.
        return;
    }
    transaction.setSelection(
        NodeSelection.create(transaction.doc, destination),
    );
    view.dispatch(transaction);
    view.dispatch(closeHistory(view.state.tr));
    view.focus();
}
