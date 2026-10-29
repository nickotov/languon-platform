'use client';

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import {
    type LearningBlock,
    type ExerciseLearningBlock,
} from '@languon/contracts';
import { InlineAlert } from '@/fsd/shared/ui';
import { blocks } from '../../lib/positioned-learning-blocks';
import { applyLearningBlockEdit } from '../../lib/apply-learning-block-edit';
import type { BlockKind } from '../../lib/learning-block-form';
import type { KnowledgeBlockCopyContext } from '../../api/block-copy-api';
import { BlockCopyDialog } from '../block-copy/copy-blocks-to-note';
import { LibrarySaveDialog } from '../library-copy/library-save-dialog';
import { libraryLabels } from '../library-copy/library-labels';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { InsertLibraryBlock } from '../library-copy/insert-library-block';
import { type UploadBlockAudio } from './audio-block-upload';
import { useBlockAuthoring } from './block-authoring-context';
import { BlockInsertMenu } from './block-insert-menu';
import { ExerciseSetDialog } from './exercise-set-dialog';
import { BlockFormDialog } from './block-form-dialog';
import {
    defaultAuthoringLabels,
    type BlockAuthoringLabels,
} from './block-labels';
import styles from './learning-block-authoring.module.css';

export function LearningBlockAuthoring({
    editor,
    disabled,
    labels = defaultAuthoringLabels,
    uploadAudio,
    library,
    blockCopy,
}: {
    editor: Editor;
    disabled: boolean;
    labels?: BlockAuthoringLabels;
    uploadAudio?: UploadBlockAudio | undefined;
    library?: KnowledgeLibraryContext | undefined;
    blockCopy?: KnowledgeBlockCopyContext | undefined;
}) {
    const { locale } = useI18n();
    const authoring = useBlockAuthoring();
    if (!authoring)
        throw new Error('Block authoring requires its editor scope.');
    const {
        editing,
        setEditing,
        serverDuplicate,
        setServerDuplicate,
        copyToAnotherNote,
    } = authoring;
    const [items, setItems] = useState(() => blocks(editor));
    const [error, setError] = useState(false);
    useEffect(() => {
        setItems(blocks(editor));
        function refresh({ transaction }: { transaction: Transaction }) {
            if (transaction.docChanged) setItems(blocks(editor));
        }
        editor.on('transaction', refresh);
        return () => {
            editor.off('transaction', refresh);
        };
    }, [editor]);
    function add(kind: BlockKind) {
        if (disabled) return;
        setEditing({ kind });
    }
    function close() {
        setEditing(null);
    }
    function apply(block: LearningBlock) {
        if (disabled) return false;
        const previous =
            editing?.existing && editing.block ? [editing.block] : [];
        const applied = applyLearningBlockEdit(editor, previous, [block]);
        setError(!applied);
        if (applied) close();
        return applied;
    }
    function applyExercises(next: ExerciseLearningBlock[]) {
        if (disabled) return false;
        const previous =
            editing?.members ??
            (editing?.existing && editing.block ? [editing.block] : []);
        const applied = applyLearningBlockEdit(editor, previous, next);
        setError(!applied);
        if (applied) close();
        return applied;
    }
    function applyAudio(
        audio: Extract<LearningBlock, { type: 'audio' }>,
        questions: ExerciseLearningBlock[],
    ) {
        if (disabled) return false;
        const previous =
            editing?.members ??
            (editing?.existing && editing.block ? [editing.block] : []);
        const groupId = questions[0]?.group?.id ?? crypto.randomUUID();
        const nextQuestions = questions.map((block) => ({
            ...block,
            group: {
                id: groupId,
                parentBlockId: audio.id,
                ...(questions[0]?.group?.title
                    ? { title: questions[0].group.title }
                    : {}),
            },
        }));
        const applied = applyLearningBlockEdit(editor, previous, [
            audio,
            ...nextQuestions,
        ]);
        setError(!applied);
        if (applied) close();
        return applied;
    }
    function insert(block: LearningBlock) {
        if (disabled) return false;
        const applied = applyLearningBlockEdit(editor, [], [block]);
        setError(!applied);
        return applied;
    }
    function closeLibrary() {
        authoring?.setLibraryBlock(null);
    }
    function closeDuplicate() {
        setServerDuplicate(null);
    }
    const duplicateDestination =
        !copyToAnotherNote && blockCopy?.source.kind === 'owned-working'
            ? {
                  noteId: blockCopy.source.noteId,
                  branchId: blockCopy.source.branchId,
              }
            : undefined;
    const duplicateSelection = authoring.serverDuplicateMembers.length
        ? authoring.serverDuplicateMembers.map((block) => block.id)
        : serverDuplicate
          ? [serverDuplicate.id]
          : [];
    const sourceBlocks = items.map((item) => item.block);
    return (
        <div className={styles.root}>
            <div className={styles.actions}>
                <BlockInsertMenu
                    labels={labels}
                    disabled={disabled}
                    onChoose={add}
                />
                {library && (
                    <InsertLibraryBlock
                        context={library}
                        disabled={disabled}
                        onInsert={insert}
                        compact
                    />
                )}
            </div>
            {authoring.libraryBlock && authoring.library && (
                <LibrarySaveDialog
                    block={authoring.libraryBlock}
                    context={authoring.library}
                    labels={libraryLabels(locale)}
                    onClose={closeLibrary}
                />
            )}
            {serverDuplicate && blockCopy && (
                <BlockCopyDialog
                    context={blockCopy}
                    blocks={sourceBlocks}
                    initialSelection={duplicateSelection}
                    initialDestination={duplicateDestination}
                    onClose={closeDuplicate}
                />
            )}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
            {editing?.kind === 'exercise' && (
                <ExerciseSetDialog
                    exercises={(
                        editing.members ??
                        (editing.block ? [editing.block] : [])
                    ).filter(
                        (block): block is ExerciseLearningBlock =>
                            block.type === 'exercise',
                    )}
                    labels={labels}
                    sources={sourceBlocks}
                    onClose={close}
                    onApply={applyExercises}
                />
            )}
            {editing !== null && editing.kind !== 'exercise' && (
                <BlockFormDialog
                    key={editing.block?.id ?? editing.kind}
                    kind={editing.kind}
                    block={editing.block}
                    labels={labels}
                    onClose={close}
                    onApply={apply}
                    sources={sourceBlocks}
                    uploadAudio={uploadAudio}
                    fieldAi={authoring.fieldAi}
                    languageDefaults={authoring.languageDefaults}
                    renderAudioPreparation={authoring.renderAudioPreparation}
                    relatedExercises={editing.members?.filter(
                        (block): block is ExerciseLearningBlock =>
                            block.type === 'exercise',
                    )}
                    onApplyAudio={applyAudio}
                    blockViewOptions={authoring.blockViewOptions}
                />
            )}
        </div>
    );
}
