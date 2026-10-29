import type { Editor } from '@tiptap/react';
import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';
export type PositionedBlock = {
    block: LearningBlock;
    position: number;
    size: number;
};
export function blocks(editor: Editor): PositionedBlock[] {
    const result: PositionedBlock[] = [];
    editor.state.doc.forEach((node, position) => {
        if (node.type.name === 'learningBlock')
            result.push({
                block: LearningBlockSchema.parse(node.attrs.block),
                position,
                size: node.nodeSize,
            });
    });
    return result;
}
