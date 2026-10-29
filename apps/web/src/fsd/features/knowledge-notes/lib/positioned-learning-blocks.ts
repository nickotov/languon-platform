import type { Editor } from '@tiptap/react';
import type { Node } from '@tiptap/pm/model';
import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';
export type PositionedBlock = {
    block: LearningBlock;
    position: number;
    size: number;
    /** The previous top-level block is separated only by empty paragraph nodes. */
    joinsAfter?: string;
};
export function blocksInDocument(document: Node): PositionedBlock[] {
    const result: PositionedBlock[] = [];
    let emptyGap = true;
    document.forEach((node, position) => {
        if (node.type.name === 'learningBlock') {
            const previous = result[result.length - 1];
            result.push({
                block: LearningBlockSchema.parse(node.attrs.block),
                position,
                size: node.nodeSize,
                ...(previous && emptyGap
                    ? { joinsAfter: previous.block.id }
                    : {}),
            });
            emptyGap = true;
        } else if (node.type.name !== 'paragraph' || node.childCount > 0)
            emptyGap = false;
    });
    return result;
}
export function blocks(editor: Editor): PositionedBlock[] {
    return blocksInDocument(editor.state.doc);
}
export function joinsPreviousBlock(
    previous: PositionedBlock,
    next: PositionedBlock,
): boolean {
    return (
        previous.position + previous.size === next.position ||
        next.joinsAfter === previous.block.id
    );
}
