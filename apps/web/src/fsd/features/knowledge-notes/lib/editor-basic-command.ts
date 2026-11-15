import type { Editor } from '@tiptap/react';
export type Basic =
    | 'paragraph'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'bulletList'
    | 'orderedList'
    | 'blockquote'
    | 'horizontalRule'
    | 'table';
export function applyEditorBasic(
    editor: Editor,
    range: { from: number; to: number },
    kind: Basic,
) {
    const chain = editor.chain().focus().deleteRange(range);
    if (kind === 'paragraph') {
        chain.setParagraph();
    } else if (kind.startsWith('heading')) {
        chain.setHeading({ level: Number(kind.slice(-1)) as 1 | 2 | 3 });
    } else if (kind === 'bulletList') {
        chain.toggleBulletList();
    } else if (kind === 'orderedList') {
        chain.toggleOrderedList();
    } else if (kind === 'blockquote') {
        chain.toggleBlockquote();
    } else if (kind === 'horizontalRule') {
        chain.setHorizontalRule();
    } else if (kind === 'table') {
        chain.insertTable({ rows: 3, cols: 2, withHeaderRow: true });
    }

    return chain.run();
}
