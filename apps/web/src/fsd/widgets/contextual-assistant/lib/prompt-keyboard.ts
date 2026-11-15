import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** Give inline atoms a predictable select-then-cross arrow-key interaction. */
export function navigatePromptMention(
    view: EditorView,
    event: KeyboardEvent,
): boolean {
    if (
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
    ) {
        return false;
    }

    const { selection, doc } = view.state;
    const backward = event.key === 'ArrowLeft';
    if (
        selection instanceof NodeSelection &&
        selection.node.type.name === 'promptMention'
    ) {
        event.preventDefault();
        view.dispatch(
            view.state.tr.setSelection(
                TextSelection.create(
                    doc,
                    backward ? selection.from : selection.to,
                ),
            ),
        );

        return true;
    }

    if (!selection.empty) {
        return false;
    }

    const adjacent = backward
        ? selection.$from.nodeBefore
        : selection.$from.nodeAfter;

    if (adjacent?.type.name !== 'promptMention') {
        return false;
    }

    event.preventDefault();
    view.dispatch(
        view.state.tr.setSelection(
            NodeSelection.create(
                doc,
                backward ? selection.from - adjacent.nodeSize : selection.from,
            ),
        ),
    );

    return true;
}
