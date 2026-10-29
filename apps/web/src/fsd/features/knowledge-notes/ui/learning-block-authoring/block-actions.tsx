'use client';
import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { LearningBlock } from '@languon/contracts';
import { Menu, InlineAlert, type MenuItem } from '@/fsd/shared/ui';
import {
    Copy,
    CopyPlus,
    Pencil,
    ArrowUp,
    ArrowDown,
    Trash2,
    Ellipsis,
} from 'lucide-react';
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
    onServerCopy,
    additionalActions = [],
}: {
    item: PositionedBlock;
    index: number;
    total: number;
    editor: Editor;
    labels: BlockAuthoringLabels;
    disabled: boolean;
    onEdit(block: LearningBlock): void;
    onServerDuplicate?: ((block: LearningBlock) => void) | undefined;
    onServerCopy?: ((block: LearningBlock) => void) | undefined;
    additionalActions?: MenuItem[] | undefined;
}) {
    const [copyError, setCopyError] = useState(false);
    function current() {
        return blocks(editor).find(
            (candidate) => candidate.block.id === item.block.id,
        );
    }
    function edit() {
        if (disabled) return;
        const found = current();
        if (found) onEdit(found.block);
    }
    function remove() {
        if (disabled) return;
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
        if (disabled) return;
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
        if (disabled) return;
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
        const found = current();
        if (!found) return;
        if (copyUnavailable) {
            if (!disabled) onServerCopy?.(found.block);
            return;
        }
        try {
            await navigator.clipboard.writeText(
                learningBlockClipboardPrefix +
                    JSON.stringify(current()?.block ?? item.block),
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
    const actions: MenuItem[] = [
        {
            label: labels.edit,
            icon: <Pencil size={16} />,
            disabled,
            onSelect: edit,
        },
        {
            label: labels.copy,
            icon: <Copy size={16} />,
            disabled: copyUnavailable && !onServerCopy,
            onSelect: copy,
        },
        {
            label: labels.duplicate,
            icon: <CopyPlus size={16} />,
            disabled: disabled || (copyUnavailable && !onServerDuplicate),
            onSelect: duplicate,
        },
        {
            label: labels.up,
            icon: <ArrowUp size={16} />,
            disabled: disabled || index === 0,
            separatorBefore: true,
            onSelect: up,
        },
        {
            label: labels.down,
            icon: <ArrowDown size={16} />,
            disabled: disabled || index === total - 1,
            onSelect: down,
        },
        ...additionalActions,
        {
            label: labels.remove,
            icon: <Trash2 size={16} />,
            disabled,
            separatorBefore: true,
            tone: 'danger',
            onSelect: remove,
        },
    ];
    const menuLabel = `${labels.field('Block settings')}: ${title}`;
    return (
        <div className={styles.blockMenu}>
            <Menu
                items={actions}
                label={menuLabel}
                trigger={<Ellipsis size={18} aria-hidden />}
                triggerClassName={styles.settingsTrigger}
                iconOnly
                allowDisabledItems
            />
            {copyError && (
                <InlineAlert tone='error'>{labels.error}</InlineAlert>
            )}
        </div>
    );
}
