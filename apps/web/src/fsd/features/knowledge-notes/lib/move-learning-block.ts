import type { Editor } from '@tiptap/react';
import { authoringBlockGroup } from './authoring-block-group';
import { normalizeEditorDocument } from './editor-document';
import { blocks } from './positioned-learning-blocks';

export function moveLearningBlock(
    editor: Editor,
    id: string,
    direction: -1 | 1,
): boolean {
    const all = blocks(editor);
    const group = authoringBlockGroup(all, id);
    const source = group[0];
    const last = group[group.length - 1];
    if (!source || !last || !editor.isEditable) return false;
    const index = all.findIndex((item) => item.block.id === source.block.id);
    const neighbor = direction < 0 ? all[index - 1] : all[index + group.length];
    if (!neighbor) return false;
    const neighbors = authoringBlockGroup(all, neighbor.block.id);
    const before = neighbors[0]!;
    const after = neighbors[neighbors.length - 1]!;
    const transaction = editor.state.tr;
    const content = transaction.doc.slice(
        source.position,
        last.position + last.size,
    ).content;
    const destination =
        direction < 0 ? before.position : after.position + after.size;
    transaction.delete(source.position, last.position + last.size);
    transaction.insert(transaction.mapping.map(destination), content);
    try {
        normalizeEditorDocument(transaction.doc.toJSON());
        editor.view.dispatch(transaction);
        return true;
    } catch {
        return false;
    }
}
