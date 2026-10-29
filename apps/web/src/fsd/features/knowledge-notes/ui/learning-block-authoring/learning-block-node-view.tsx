'use client';

import type { DragEvent, KeyboardEvent } from 'react';
import {
    NodeViewWrapper,
    useEditorState,
    type NodeViewProps,
} from '@tiptap/react';
import { GripVertical } from 'lucide-react';
import { LearningBlockSchema } from '@languon/contracts';
import {
    LearningBlockView,
    exercisePracticeIdentity,
} from '@/fsd/entities/learning-blocks';
import { AuthorExerciseSummary } from './author-exercise-summary';
import type { BlockAuthoringLabels } from './block-labels';
import { useBlockAuthoring } from './block-authoring-context';
import { blockAuthoringMenuActions } from './block-authoring-menu-actions';
import { BlockActions } from './block-actions';
import { moveLearningBlock } from '../../lib/move-learning-block';
import { exerciseGroupDragType } from '../../lib/exercise-group-drag';
import { authoringBlockGroup } from '../../lib/authoring-block-group';
import { blocks } from '../../lib/positioned-learning-blocks';
import type { LearningBlock } from '@languon/contracts';
import styles from './learning-block-node.module.css';

export function LearningBlockNodeView({
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
    const group = authoringBlockGroup(items, block.id);
    const groupIndex = group.findIndex((item) => item.block.id === block.id);
    const parent = group[0]?.block;
    const mediaGroup =
        group.length > 1 &&
        (parent?.type === 'audio' || parent?.type === 'video');
    const grouped =
        mediaGroup || (block.type === 'exercise' && Boolean(block.group));
    const questionCount = group.filter(
        (item) => item.block.type === 'exercise',
    ).length;
    const firstInGroup = !grouped || groupIndex === 0;
    const expansionId = mediaGroup
        ? parent!.id
        : grouped && block.type === 'exercise'
          ? block.group!.id
          : block.id;
    const expansion = authoring?.expansions[expansionId];
    const viewOptions = authoring?.blockViewOptions?.(block);
    function toggleExpansion() {
        authoring?.toggleExpansion(expansionId);
    }
    function attempted(id: string, value: boolean) {
        if (block.type !== 'exercise') return;
        authoring?.recordAttempt(
            id,
            value,
            exercisePracticeIdentity(block, viewOptions?.exerciseRevision),
        );
        viewOptions?.onAttemptedChange?.(id, value);
    }
    const groupSummary =
        block.type === 'exercise' &&
        (mediaGroup ? groupIndex === 1 : firstInGroup) ? (
            <AuthorExerciseSummary
                group={group}
                expansionId={expansionId}
                labels={labels}
            />
        ) : undefined;
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
        if (
            editable &&
            event.altKey &&
            (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
            event.preventDefault();
            moveLearningBlock(
                editor,
                block.id,
                event.key === 'ArrowUp' ? -1 : 1,
            );
            return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        select();
    }
    function dragGroup(event: DragEvent<HTMLDivElement>) {
        if (grouped && group.length > 1)
            event.dataTransfer.setData(
                exerciseGroupDragType,
                JSON.stringify(group.map((item) => item.block.id)),
            );
    }
    function edit(value: LearningBlock) {
        authoring?.setEditing({
            kind: value.type,
            block: value,
            existing: true,
            ...(value.type === 'exercise' || value.type === 'audio'
                ? { members: group.map((item) => item.block) }
                : {}),
        });
    }
    function duplicateOnServer(value: LearningBlock) {
        authoring?.setServerDuplicateMembers(group.map((item) => item.block));
        authoring?.setCopyToAnotherNote(false);
        authoring?.setServerDuplicate(value);
    }
    function copyOnServer(value: LearningBlock) {
        authoring?.setServerDuplicateMembers(group.map((item) => item.block));
        authoring?.setCopyToAnotherNote(true);
        authoring?.setServerDuplicate(value);
    }
    const dragTitle =
        (block.type === 'exercise' ? block.group?.title : undefined) ??
        block.title ??
        labels.view.kinds[block.type];
    const dragLabel = `${labels.field('Select or drag block')}: ${dragTitle}`;
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
            onDragStart={dragGroup}
        >
            <GripVertical size={18} aria-hidden />
        </div>
    ) : undefined;
    function saveLibrary() {
        const current = blocks(editor).find(
            (item) => item.block.id === block.id,
        )?.block;
        if (
            current?.type === 'vocabulary' ||
            current?.type === 'bilingual-text'
        )
            authoring?.setLibraryBlock(current);
    }
    const additionalActions = blockAuthoringMenuActions({
        block,
        labels,
        external: authoring?.additionalActions?.(block) ?? [],
        canSave: Boolean(authoring?.library),
        expanded: Boolean(expansion?.open),
        onSave: saveLibrary,
        onToggle: toggleExpansion,
    });
    const serverDuplicate = authoring?.canDuplicateOnServer
        ? duplicateOnServer
        : undefined;
    const serverCopy = authoring?.canDuplicateOnServer
        ? copyOnServer
        : undefined;
    const actions =
        editable && item && firstInGroup ? (
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
                renderBlockMenu={authoring?.renderBlockMenu}
            />
        ) : undefined;
    return (
        <NodeViewWrapper
            contentEditable={false}
            data-learning-block-id={block.id}
            data-selected={selected || undefined}
            data-group-position={
                grouped
                    ? group.length === 1
                        ? 'single'
                        : groupIndex === 0
                          ? 'start'
                          : groupIndex === group.length - 1
                            ? 'end'
                            : 'middle'
                    : undefined
            }
            className={className}
        >
            <LearningBlockView
                {...viewOptions}
                block={block}
                labels={labels.view}
                variant={editable ? 'author' : 'learner'}
                accented={authoring?.blockAccents ?? true}
                hideHeading={!firstInGroup}
                preserveFrame={grouped}
                frameFamily={mediaGroup ? parent!.type : undefined}
                headingTitle={
                    grouped && block.type === 'exercise'
                        ? (block.group?.title ?? labels.view.kinds.exercise)
                        : undefined
                }
                headingMetadata={
                    grouped
                        ? `${labels.view.kinds[mediaGroup ? parent!.type : block.type]} · ${questionCount}`
                        : undefined
                }
                exerciseIndex={
                    block.type === 'exercise'
                        ? groupIndex + 1 - (mediaGroup ? 1 : 0)
                        : undefined
                }
                expandAll={expansion}
                contentLeading={groupSummary}
                onAttemptedChange={attempted}
                headingLeading={firstInGroup ? handle : undefined}
                headingActions={actions}
            />
        </NodeViewWrapper>
    );
}
