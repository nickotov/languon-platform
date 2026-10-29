'use client';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { LearningBlockSchema } from '@languon/contracts';
import type { BlockAuthoringLabels } from './block-labels';
import { defaultAuthoringLabels } from './block-labels';
import { LearningBlockNodeView } from './learning-block-node-view';

export const LearningBlockNode = Node.create<{ labels: BlockAuthoringLabels }>({
    name: 'learningBlock',
    group: 'block',
    atom: true,
    isolating: true,
    selectable: true,
    draggable: true,
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
