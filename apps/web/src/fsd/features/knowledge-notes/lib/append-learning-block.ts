import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';
import { prepareProposalDocument } from './insert-proposal-document';

/** Validate the full prospective document, including plugins, before one undoable edit. */
export function appendLearningBlock(
    editor: Editor,
    candidate: LearningBlock,
): boolean {
    try {
        const block = LearningBlockSchema.parse(candidate);
        const end = editor.state.doc.content.size;
        const transaction = prepareProposalDocument(
            editor,
            {
                type: 'doc',
                content: [{ type: 'learningBlock', attrs: { block } }],
            },
            { from: end, to: end },
            true,
        );
        if (!transaction) return false;
        editor.view.dispatch(closeHistory(transaction));
        editor.view.dispatch(closeHistory(editor.state.tr));
        return true;
    } catch {
        return false;
    }
}
