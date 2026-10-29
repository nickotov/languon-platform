import type { EditorView } from '@tiptap/pm/view';
import {
    copyLearningBlock,
    learningBlockClipboardPrefix,
    learningBlockClipboardType,
} from './learning-block-copy';
import { normalizeEditorDocument } from './editor-document';

export function pasteLearningBlock(
    view: EditorView,
    event: ClipboardEvent,
): 'none' | 'applied' | 'invalid' {
    const typed = event.clipboardData?.getData(learningBlockClipboardType);
    const plain = event.clipboardData?.getData('text/plain') ?? '';
    const serialized =
        typed ||
        (plain.startsWith(learningBlockClipboardPrefix)
            ? plain.slice(learningBlockClipboardPrefix.length)
            : '');
    if (!serialized) return 'none';
    event.preventDefault();
    try {
        if (serialized.length > 512_000) return 'invalid';
        const block = copyLearningBlock(JSON.parse(serialized));
        const transaction = view.state.tr;
        transaction.insert(
            transaction.doc.content.size,
            view.state.schema.nodes.learningBlock!.create({ block }),
        );
        normalizeEditorDocument(transaction.doc.toJSON());
        view.dispatch(transaction);
        return 'applied';
    } catch {
        return 'invalid';
    }
}
