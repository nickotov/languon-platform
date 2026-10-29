'use client';

import { Node } from '@tiptap/core';
import {
    NodeViewWrapper,
    ReactNodeViewRenderer,
    type NodeViewProps,
} from '@tiptap/react';
import { LearningBlockSchema } from '@languon/contracts';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import type { BlockAuthoringLabels } from './block-labels';
import { defaultAuthoringLabels } from './block-labels';

function LearningBlockNodeView({ node, extension }: NodeViewProps) {
    const block = LearningBlockSchema.parse(node.attrs.block);
    const labels = (extension.options as { labels: BlockAuthoringLabels })
        .labels;
    return (
        <NodeViewWrapper
            contentEditable={false}
            data-learning-block-id={block.id}
        >
            <LearningBlockView block={block} labels={labels.view} />
        </NodeViewWrapper>
    );
}

export const LearningBlockNode = Node.create<{ labels: BlockAuthoringLabels }>({
    name: 'learningBlock',
    group: 'block',
    atom: true,
    isolating: true,
    selectable: true,
    draggable: false,
    addOptions() {
        return { labels: defaultAuthoringLabels };
    },
    addAttributes() {
        return { block: { default: null, rendered: false } };
    },
    // Clipboard HTML is never an authority for structured blocks or media assets.
    parseHTML() {
        return [];
    },
    renderHTML({ node }) {
        const block = LearningBlockSchema.parse(node.attrs.block);
        return [
            'div',
            { 'data-learning-block': 'true' },
            block.title ?? this.options.labels.view.kinds[block.type],
        ];
    },
    addNodeView() {
        return ReactNodeViewRenderer(LearningBlockNodeView);
    },
});
