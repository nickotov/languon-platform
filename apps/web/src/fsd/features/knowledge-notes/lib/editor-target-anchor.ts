import { editorLeafText } from './learning-block-text';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type EditorTargetAnchor = {
    from: number;
    to: number;
    originalText: string;
    documentHash: string;
};

export function editorPlainText(doc: ProseMirrorNode): string {
    return doc.textBetween(0, doc.content.size, '\n', editorLeafText);
}

export function editorPlainOffset(
    doc: ProseMirrorNode,
    position: number,
): number {
    return doc.textBetween(0, position, '\n', editorLeafText).length;
}

export async function hashEditorText(content: string): Promise<string> {
    const bytes = new TextEncoder().encode(content);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

function splitsSurrogatePair(content: string, offset: number): boolean {
    if (offset <= 0 || offset >= content.length) return false;
    const before = content.charCodeAt(offset - 1);
    const after = content.charCodeAt(offset);
    return (
        before >= 0xd800 &&
        before <= 0xdbff &&
        after >= 0xdc00 &&
        after <= 0xdfff
    );
}

function positionsAtOffset(doc: ProseMirrorNode, offset: number): number[] {
    let low = 0;
    let high = doc.content.size;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (editorPlainOffset(doc, middle) < offset) low = middle + 1;
        else high = middle;
    }
    const first = low;
    if (editorPlainOffset(doc, first) !== offset) return [];
    low = first;
    high = doc.content.size + 1;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (editorPlainOffset(doc, middle) <= offset) low = middle + 1;
        else high = middle;
    }
    const last = low - 1;
    if (last - first > 8) return [];
    return Array.from(
        { length: last - first + 1 },
        (_, index) => first + index,
    ).filter((position) => doc.resolve(position).parent.isTextblock);
}

/** Ambiguous block boundaries require manual target selection. */
export function restoreEditorPositions(
    doc: ProseMirrorNode,
    anchor: EditorTargetAnchor,
): { from: number; to: number } | null {
    const content = editorPlainText(doc);
    if (
        anchor.from > anchor.to ||
        anchor.to > content.length ||
        splitsSurrogatePair(content, anchor.from) ||
        splitsSurrogatePair(content, anchor.to) ||
        content.slice(anchor.from, anchor.to) !== anchor.originalText
    )
        return null;
    const from = positionsAtOffset(doc, anchor.from);
    const to = positionsAtOffset(doc, anchor.to);
    const matches: { from: number; to: number }[] = [];
    for (const start of from) {
        for (const end of to) {
            if (start > end) continue;
            if (
                doc.textBetween(start, end, '\n', editorLeafText) ===
                anchor.originalText
            )
                matches.push({ from: start, to: end });
        }
    }
    return matches.length === 1 ? matches[0]! : null;
}
