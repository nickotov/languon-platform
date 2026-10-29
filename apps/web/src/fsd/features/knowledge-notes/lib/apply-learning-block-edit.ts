import type { Editor } from '@tiptap/react';
import type { LearningBlock } from '@languon/contracts';
import { normalizeEditorDocument } from './editor-document';
import { blocks, joinsPreviousBlock } from './positioned-learning-blocks';
import { authoringBlockGroup } from './authoring-block-group';

/** Replace one captured block or an uninterrupted captured question set as one undoable edit. */
export function applyLearningBlockEdit(
    editor: Editor,
    previous: LearningBlock[],
    next: LearningBlock[],
): boolean {
    if (!editor.isEditable || next.length === 0) return false;
    const current = blocks(editor);
    const firstPrevious = previous[0];
    if (
        firstPrevious?.type === 'audio' ||
        (firstPrevious?.type === 'exercise' && firstPrevious.group)
    ) {
        const actual = authoringBlockGroup(current, firstPrevious.id);
        if (
            JSON.stringify(actual.map((item) => item.block.id)) !==
            JSON.stringify(previous.map((block) => block.id))
        )
            return false;
    }
    const found = previous.map((block) =>
        current.find((item) => item.block.id === block.id),
    );
    if (
        found.some(
            (item, index) =>
                !item ||
                JSON.stringify(item.block) !== JSON.stringify(previous[index]),
        )
    )
        return false;
    const transaction = editor.state.tr;
    const nodes = next.map((block) =>
        editor.schema.nodes.learningBlock!.create({ block }),
    );
    if (found.length) {
        const first = found[0]!;
        const last = found[found.length - 1]!;
        if (
            !first ||
            !last ||
            found.some(
                (item, index) =>
                    index > 0 && !joinsPreviousBlock(found[index - 1]!, item!),
            )
        )
            return false;
        transaction.replaceWith(
            first.position,
            last.position + last.size,
            nodes,
        );
    } else transaction.insert(transaction.doc.content.size, nodes);
    try {
        normalizeEditorDocument(transaction.doc.toJSON());
        editor.view.dispatch(transaction);
        return true;
    } catch {
        return false;
    }
}
