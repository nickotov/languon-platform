import type { Node } from '@tiptap/pm/model';
import { authoringBlockGroup } from './authoring-block-group';
import { blocksInDocument } from './positioned-learning-blocks';

/** Prose moves cross complete authoring groups, never between their members. */
export function editorBlockRange(document: Node, position: number) {
    const node = document.nodeAt(position);
    if (!node) return null;
    if (node.type.name !== 'learningBlock')
        return { from: position, to: position + node.nodeSize };
    const group = authoringBlockGroup(
        blocksInDocument(document),
        node.attrs.block.id,
    );
    const first = group[0];
    const last = group.at(-1);
    if (!first || !last) return null;
    return { from: first.position, to: last.position + last.size };
}

export function adjacentBlockDestination(
    document: Node,
    position: number,
    direction: -1 | 1,
) {
    const node = document.nodeAt(position);
    if (!node) return null;
    const index = document.resolve(position).index();
    const neighbor = document.maybeChild(index + direction);
    if (!neighbor) return null;
    const at =
        direction === -1
            ? position - neighbor.nodeSize
            : position + node.nodeSize;
    const range = editorBlockRange(document, at);
    return range ? (direction === -1 ? range.from : range.to) : null;
}
