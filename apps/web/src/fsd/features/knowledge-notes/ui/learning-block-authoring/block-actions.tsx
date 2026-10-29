'use client';
import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { LearningBlock } from '@languon/contracts';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { normalizeEditorDocument } from '../../lib/editor-document';
import {
    copyLearningBlock,
    learningBlockClipboardPrefix,
} from '../../lib/learning-block-copy';
import type { BlockAuthoringLabels } from './block-labels';
import {
    blocks,
    type PositionedBlock,
} from '../../lib/positioned-learning-blocks';
import styles from './learning-block-authoring.module.css';

export function BlockActions({
    item,
    index,
    total,
    editor,
    labels,
    disabled,
    onEdit,
    onServerDuplicate,
}: {
    item: PositionedBlock;
    index: number;
    total: number;
    editor: Editor;
    labels: BlockAuthoringLabels;
    disabled: boolean;
    onEdit(block: LearningBlock): void;
    onServerDuplicate?: ((block: LearningBlock) => void) | undefined;
}) {
    const [copyError, setCopyError] = useState(false);
    function current() {
        return blocks(editor).find(
            (candidate) => candidate.block.id === item.block.id,
        );
    }
    function edit() {
        const found = current();
        if (found) onEdit(found.block);
    }
    function remove() {
        const found = current();
        if (!found) return;
        const transaction = editor.state.tr.delete(
            found.position,
            found.position + found.size,
        );
        if (transaction.doc.childCount === 0)
            transaction.insert(0, editor.schema.nodes.paragraph!.create());
        try {
            normalizeEditorDocument(transaction.doc.toJSON());
            editor.view.dispatch(transaction);
        } catch {
            setCopyError(true);
        }
    }
    function duplicate() {
        const found = current();
        if (
            found &&
            (found.block.type === 'audio' ||
                (found.block.type === 'exercise' && found.block.source))
        ) {
            onServerDuplicate?.(found.block);
            return;
        }
        if (!found) return;
        const copied = copyLearningBlock(found.block);
        const node = editor.schema.nodes.learningBlock!.create({
            block: copied,
        });
        const transaction = editor.state.tr.insert(
            found.position + found.size,
            node,
        );
        try {
            normalizeEditorDocument(transaction.doc.toJSON());
            editor.view.dispatch(transaction);
        } catch {
            setCopyError(true);
        }
    }
    function move(direction: -1 | 1) {
        const all = blocks(editor);
        const sourceIndex = all.findIndex(
            (candidate) => candidate.block.id === item.block.id,
        );
        const source = all[sourceIndex];
        const neighbor = all[sourceIndex + direction];
        if (!source || !neighbor) return;
        const transaction = editor.state.tr;
        const node = transaction.doc.nodeAt(source.position);
        if (!node) return;
        transaction.delete(source.position, source.position + source.size);
        const destination =
            direction < 0
                ? neighbor.position
                : neighbor.position + neighbor.size - source.size;
        transaction.insert(destination, node);
        normalizeEditorDocument(transaction.doc.toJSON());
        editor.view.dispatch(transaction);
    }
    function up() {
        move(-1);
    }
    function down() {
        move(1);
    }
    async function copy() {
        try {
            await navigator.clipboard.writeText(
                learningBlockClipboardPrefix + JSON.stringify(item.block),
            );
            setCopyError(false);
        } catch {
            setCopyError(true);
        }
    }
    const copyUnavailable =
        item.block.type === 'audio' ||
        (item.block.type === 'exercise' && Boolean(item.block.source));
    const title = item.block.title ?? labels.view.kinds[item.block.type];
    return (
        <div className={styles.block}>
            <div className={styles.actions}>
                <strong className={styles.blockTitle}>{title}</strong>
                <Button
                    type='button'
                    variant='ghost'
                    size='small'
                    disabled={disabled}
                    onClick={edit}
                >
                    {labels.edit}
                </Button>
                <Button
                    type='button'
                    variant='ghost'
                    size='small'
                    disabled={
                        disabled || (copyUnavailable && !onServerDuplicate)
                    }
                    onClick={duplicate}
                >
                    {labels.duplicate}
                </Button>
                <Button
                    type='button'
                    variant='ghost'
                    size='small'
                    disabled={disabled || index === 0}
                    onClick={up}
                >
                    {labels.up}
                </Button>
                <Button
                    type='button'
                    variant='ghost'
                    size='small'
                    disabled={disabled || index === total - 1}
                    onClick={down}
                >
                    {labels.down}
                </Button>
                <Button
                    type='button'
                    variant='ghost'
                    size='small'
                    disabled={disabled}
                    onClick={remove}
                >
                    {labels.remove}
                </Button>
                <Button
                    type='button'
                    variant='ghost'
                    size='small'
                    disabled={copyUnavailable}
                    onClick={copy}
                >
                    {labels.copy}
                </Button>
            </div>
            {copyError && (
                <InlineAlert tone='error'>{labels.error}</InlineAlert>
            )}
        </div>
    );
}
