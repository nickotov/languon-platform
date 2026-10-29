import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';
import { normalizeEditorDocument } from './editor-document';

export type ReplaceLearningBlockResult =
    'applied' | 'changed' | 'missing' | 'invalid';
/** Replace one exact captured block, preserving unrelated newer draft content. */
export function replaceLearningBlock(
    editor: Editor,
    captured: LearningBlock,
    next: LearningBlock,
): ReplaceLearningBlockResult {
    try {
        const expected = LearningBlockSchema.parse(captured);
        const replacement = LearningBlockSchema.parse(next);
        if (
            expected.id !== replacement.id ||
            expected.type !== replacement.type
        )
            return 'invalid';
        if (
            expected.type === 'audio' &&
            replacement.type === 'audio' &&
            expected.assetId !== replacement.assetId
        )
            return 'invalid';
        let position: number | undefined;
        editor.state.doc.forEach((node, offset) => {
            if (
                node.type.name === 'learningBlock' &&
                node.attrs.block?.id === expected.id
            )
                position = offset;
        });
        if (position === undefined) return 'missing';
        const current = editor.state.doc.nodeAt(position);
        if (!current) return 'missing';
        if (
            JSON.stringify(LearningBlockSchema.parse(current.attrs.block)) !==
            JSON.stringify(expected)
        )
            return 'changed';
        const transaction = editor.state.tr.replaceWith(
            position,
            position + current.nodeSize,
            editor.schema.nodes.learningBlock!.create({ block: replacement }),
        );
        const candidate = editor.state.applyTransaction(transaction);
        if (candidate.transactions.length === 0) return 'invalid';
        normalizeEditorDocument(candidate.state.doc.toJSON());
        editor.view.dispatch(closeHistory(transaction));
        editor.view.dispatch(closeHistory(editor.state.tr));
        return 'applied';
    } catch {
        return 'invalid';
    }
}
