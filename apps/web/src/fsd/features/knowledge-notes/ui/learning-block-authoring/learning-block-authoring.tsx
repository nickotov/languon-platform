'use client';

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import {
    type LearningBlock,
    type ExerciseLearningBlock,
    type ExerciseActivityId,
} from '@languon/contracts';
import { InlineAlert } from '@/fsd/shared/ui';
import { blocks } from '../../lib/positioned-learning-blocks';
import { applyLearningBlockEdit } from '../../lib/apply-learning-block-edit';
import type { KnowledgeBlockCopyContext } from '../../api/block-copy-api';
import { BlockCopyDialog } from '../block-copy/copy-blocks-to-note';
import { LibrarySaveDialog } from '../library-copy/library-save-dialog/library-save-dialog';
import { libraryLabels } from '../library-copy/library-labels';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { InsertLibraryBlock } from '../library-copy/insert-library-block/insert-library-block';
import { type UploadBlockAudio } from './ui/audio-block-upload/audio-block-upload';
import { useBlockAuthoring } from './ui/block-authoring-context/block-authoring-context';
import { EditorInsertPicker } from '../editor-insert-picker/editor-insert-picker';
import { insertBlocksAtTarget } from '../../lib/editor-insertion-target';
import { ExerciseSetDialog } from './ui/exercise-set-dialog/exercise-set-dialog';
import { BlockFormDialog } from './ui/block-form-dialog/block-form-dialog';
import {
    defaultAuthoringLabels,
    type BlockAuthoringLabels,
} from './block-labels';
import styles from '../styles/learning-block-authoring-common.module.css';

export function LearningBlockAuthoring({
    editor,
    disabled,
    labels = defaultAuthoringLabels,
    uploadAudio,
    library,
    blockCopy,
    onGenerateExercise,
}: {
    onGenerateExercise?: ((activityId: ExerciseActivityId) => void) | undefined;
    editor: Editor;
    disabled: boolean;
    labels?: BlockAuthoringLabels;
    uploadAudio?: UploadBlockAudio | undefined;
    library?: KnowledgeLibraryContext | undefined;
    blockCopy?: KnowledgeBlockCopyContext | undefined;
}) {
    const { locale } = useI18n();
    const authoring = useBlockAuthoring();
    if (!authoring) {
        throw new Error('Block authoring requires its editor scope.');
    }

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
            if (transaction.docChanged) {
                setItems(blocks(editor));
            }
        }

        editor.on('transaction', refresh);

        return () => {
            editor.off('transaction', refresh);
        };
    }, [editor]);

    useEffect(() => () => editing?.insertion?.release(), [editing]);

    function close() {
        editing?.insertion?.release();
        setEditing(null);
    }

    function apply(block: LearningBlock) {
        if (disabled) {
            return false;
        }

        const previous =
            editing?.existing && editing.block ? [editing.block] : [];
        const applied = editing?.insertion
            ? insertBlocksAtTarget(editor, editing.insertion, [block])
            : applyLearningBlockEdit(editor, previous, [block]);

        setError(!applied);
        if (applied) {
            close();
        }

        return applied;
    }

    function applyExercises(next: ExerciseLearningBlock[]) {
        if (disabled) {
            return false;
        }

        const previous =
            editing?.members ??
            (editing?.existing && editing.block ? [editing.block] : []);
        const applied = editing?.insertion
            ? insertBlocksAtTarget(editor, editing.insertion, next)
            : applyLearningBlockEdit(editor, previous, next);

        setError(!applied);
        if (applied) {
            close();
        }

        return applied;
    }

    function applyAudio(
        audio: Extract<LearningBlock, { type: 'audio' }>,
        questions: ExerciseLearningBlock[],
    ) {
        if (disabled) {
            return false;
        }

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
        const next = [audio, ...nextQuestions];
        const applied = editing?.insertion
            ? insertBlocksAtTarget(editor, editing.insertion, next)
            : applyLearningBlockEdit(editor, previous, next);

        setError(!applied);
        if (applied) {
            close();
        }

        return applied;
    }

    function insert(block: LearningBlock) {
        if (disabled) {
            return false;
        }

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

    const groupedExerciseEditing =
        editing?.kind === 'exercise' &&
        (editing.exerciseSet ||
            (!editing.insertion &&
                (Boolean(
                    editing.block?.type === 'exercise' && editing.block.group,
                ) ||
                    (editing.members?.length ?? 0) > 1)));

    return (
        <div className={styles.root}>
            <div className={styles.actions}>
                <EditorInsertPicker
                    editor={editor}
                    disabled={disabled}
                    labels={labels}
                    onGenerateExercise={onGenerateExercise}
                    library={library}
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
            {groupedExerciseEditing && editing && (
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
            {editing !== null && !groupedExerciseEditing && (
                <BlockFormDialog
                    key={editing.block?.id ?? editing.kind}
                    kind={editing.kind}
                    initialFormat={editing.initialFormat}
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
