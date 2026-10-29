import type { Editor } from '@tiptap/react';
import type { KnowledgeEditorTarget } from './proposal-target';
import { editorLeafText } from './learning-block-text';
import { inlineProposalPosition } from './inline-proposal-position';

export function editorProposalPosition(
    editor: Editor | null,
    target: KnowledgeEditorTarget | undefined,
) {
    if (!editor || !target || target.changed) return null;
    const root = editor.view.dom.closest<HTMLElement>(
        '[data-workspace-editor]',
    );
    if (!root) return null;
    if (target.to > editor.state.doc.content.size) return null;
    const current = editor.state.doc.textBetween(
        target.from,
        target.to,
        '\n',
        editorLeafText,
    );
    if (current !== target.selectedText) return null;
    const bounds = root.getBoundingClientRect();
    const range = document.createRange();
    const start = editor.view.domAtPos(target.from);
    const end = editor.view.domAtPos(target.to);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rects = range.getClientRects();
    const last =
        rects.item?.(rects.length - 1) ??
        rects[rects.length - 1] ??
        editor.view.coordsAtPos(target.to);
    const fontSize =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return inlineProposalPosition(bounds, last, fontSize);
}
