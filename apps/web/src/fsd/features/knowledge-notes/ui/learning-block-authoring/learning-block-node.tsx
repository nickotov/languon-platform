'use client';

import { Node } from '@tiptap/core';
import type { KeyboardEvent } from 'react';
import {
    NodeViewWrapper,
    ReactNodeViewRenderer,
    useEditorState,
    type NodeViewProps,
} from '@tiptap/react';
import { GripVertical } from 'lucide-react';
import { LearningBlockSchema } from '@languon/contracts';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import type { BlockAuthoringLabels } from './block-labels';
import { defaultAuthoringLabels } from './block-labels';
import { useBlockAuthoring } from './block-authoring-context';
import { BlockActions } from './block-actions';
import { blocks } from '../../lib/positioned-learning-blocks';
import type { LearningBlock } from '@languon/contracts';
import styles from './learning-block-node.module.css';

function LearningBlockNodeView({
    node,
    extension,
    editor,
    getPos,
    selected,
}: NodeViewProps) {
    // A moved atom may keep its node identity; refresh action availability from
    // the current document rather than retaining its old neighbor positions.
    useEditorState({
        editor,
        selector: ({ editor: current }) => current.state.doc,
    });
    const block = LearningBlockSchema.parse(node.attrs.block);
    const labels = (extension.options as { labels: BlockAuthoringLabels })
        .labels;
    const authoring = useBlockAuthoring();
    const editable = Boolean(authoring?.enabled && editor.isEditable);
    const items = blocks(editor);
    const index = items.findIndex((item) => item.block.id === block.id);
    const item = items[index];
    const className = selected
        ? `${styles.root} ${styles.selected}`
        : styles.root;
    function select() {
        if (!editable) return;
        const position = getPos();
        if (typeof position === 'number')
            editor.commands.setNodeSelection(position);
    }
    function selectWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        select();
    }
    function edit(value: LearningBlock) {
        authoring?.setEditing({
            kind: value.type,
            block: value,
            existing: true,
        });
    }
    function duplicateOnServer(value: LearningBlock) {
        authoring?.setCopyToAnotherNote(false);
        authoring?.setServerDuplicate(value);
    }
    function copyOnServer(value: LearningBlock) {
        authoring?.setCopyToAnotherNote(true);
        authoring?.setServerDuplicate(value);
    }
    const dragLabel = `${labels.field('Select or drag block')}: ${block.title ?? labels.view.kinds[block.type]}`;
    const handle = editable ? (
        // TipTap treats native buttons as input controls before initializing
        // drag state. A keyboard-accessible handle lets its native drag path run.
        <div
            role='button'
            tabIndex={0}
            draggable
            className={styles.dragHandle}
            data-drag-handle
            aria-label={dragLabel}
            aria-pressed={selected}
            onClick={select}
            onKeyDown={selectWithKeyboard}
        >
            <GripVertical size={18} aria-hidden />
        </div>
    ) : undefined;
    const additionalActions = authoring?.additionalActions?.(block);
    const serverDuplicate = authoring?.canDuplicateOnServer
        ? duplicateOnServer
        : undefined;
    const serverCopy = authoring?.canDuplicateOnServer
        ? copyOnServer
        : undefined;
    const actions =
        editable && item ? (
            <BlockActions
                item={item}
                index={index}
                total={items.length}
                editor={editor}
                labels={labels}
                disabled={!editable}
                onEdit={edit}
                onServerDuplicate={serverDuplicate}
                onServerCopy={serverCopy}
                additionalActions={additionalActions}
            />
        ) : undefined;
    return (
        <NodeViewWrapper
            contentEditable={false}
            data-learning-block-id={block.id}
            data-selected={selected || undefined}
            className={className}
        >
            <LearningBlockView
                block={block}
                labels={labels.view}
                headingLeading={handle}
                headingActions={actions}
            />
        </NodeViewWrapper>
    );
}

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
