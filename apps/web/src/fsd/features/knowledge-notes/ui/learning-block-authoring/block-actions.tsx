'use client';
import { useState, type ReactNode } from 'react';
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
import { moveLearningBlock } from '../../lib/move-learning-block';
import { authoringBlockGroup } from '../../lib/authoring-block-group';
import { normalizeEditorDocument } from '../../lib/editor-document';
import {
    copyLearningBlocks,
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
    renderBlockMenu,
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
    renderBlockMenu?:
        ((block: LearningBlock, items: MenuItem[]) => ReactNode) | undefined;
}) {
    const [copyError, setCopyError] = useState(false);
    function current() {
        return blocks(editor).find(
            (candidate) => candidate.block.id === item.block.id,
        );
    }
    function currentGroup() {
        return authoringBlockGroup(blocks(editor), item.block.id);
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
        const group = currentGroup();
        const last = group[group.length - 1] ?? found;
        const transaction = editor.state.tr.delete(
            found.position,
            last.position + last.size,
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
        if (!found) return;
        const group = currentGroup();
        if (
            group.some(
                ({ block }) =>
                    block.type === 'audio' ||
                    (block.type === 'exercise' && block.source),
            )
        ) {
            onServerDuplicate?.(found.block);
            return;
        }
        const copied = copyLearningBlocks(group.map((item) => item.block));
        const nodes = copied.map((block) =>
            editor.schema.nodes.learningBlock!.create({ block }),
        );
        const last = group[group.length - 1] ?? found;
        const transaction = editor.state.tr.insert(
            last.position + last.size,
            nodes,
        );
        try {
            normalizeEditorDocument(transaction.doc.toJSON());
            editor.view.dispatch(transaction);
        } catch {
            setCopyError(true);
        }
    }
    function move(direction: -1 | 1) {
        if (!disabled && !moveLearningBlock(editor, item.block.id, direction))
            setCopyError(true);
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
    const groupSize = currentGroup().length;
    const duplicateUnavailable = currentGroup().some(
        ({ block }) =>
            block.type === 'audio' ||
            (block.type === 'exercise' && Boolean(block.source)),
    );
    const copyUnavailable =
        groupSize > 1 ||
        item.block.type === 'audio' ||
        (item.block.type === 'exercise' && Boolean(item.block.source));
    const title =
        (item.block.type === 'exercise'
            ? item.block.group?.title
            : undefined) ??
        item.block.title ??
        labels.view.kinds[item.block.type];
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
            disabled: disabled || (duplicateUnavailable && !onServerDuplicate),
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
            disabled: disabled || index + groupSize >= total,
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
    const customMenu = renderBlockMenu?.(item.block, actions);
    const menu = customMenu ?? (
        <Menu
            items={actions}
            label={menuLabel}
            trigger={<Ellipsis size={18} aria-hidden />}
            triggerClassName={styles.settingsTrigger}
            iconOnly
            allowDisabledItems
        />
    );
    return (
        <div className={styles.blockMenu}>
            {menu}
            {copyError && (
                <InlineAlert tone='error'>{labels.error}</InlineAlert>
            )}
        </div>
    );
}
