'use client';
import { useRef, useState, type ChangeEvent } from 'react';
import type { ExerciseLearningBlock, LearningBlock } from '@languon/contracts';
import { InlineAlert, Input } from '@/fsd/shared/ui';
import { BlockEditorPanel } from './block-editor-panel';
import { BlockEditorFooter } from './block-editor-footer';
import {
    ExerciseSetFields,
    type ExerciseSetFieldsHandle,
} from './exercise-set-fields';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';
export function ExerciseSetDialog({
    exercises,
    labels,
    sources,
    onClose,
    onApply,
}: {
    exercises: ExerciseLearningBlock[];
    labels: BlockAuthoringLabels;
    sources: LearningBlock[];
    onClose(): void;
    onApply(blocks: ExerciseLearningBlock[]): boolean;
}) {
    const [title, setTitle] = useState(
        exercises[0]?.group?.title ??
            exercises[0]?.title ??
            labels.view.kinds.exercise,
    );
    const groupId = useRef(exercises[0]?.group?.id ?? crypto.randomUUID());
    const [dirty, setDirty] = useState(exercises.length === 0);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState(false);
    const fields = useRef<ExerciseSetFieldsHandle>(null);
    function markDirty() {
        setDirty(true);
    }
    function close() {
        if (confirming) setConfirming(false);
        else if (dirty) setConfirming(true);
        else onClose();
    }
    function keepEditing() {
        setConfirming(false);
    }
    function changeTitle(event: ChangeEvent<HTMLInputElement>) {
        setTitle(event.currentTarget.value);
        markDirty();
    }
    function apply() {
        const questions = fields.current?.read();
        if (!questions) {
            setError(true);
            return;
        }
        const next = questions.map((block) => ({
            ...block,
            group: {
                id: groupId.current,
                ...(block.group?.parentBlockId
                    ? { parentBlockId: block.group.parentBlockId }
                    : {}),
                ...(title.trim() ? { title: title.trim() } : {}),
            },
        }));
        if (!onApply(next)) setError(true);
    }
    const footer = (
        <BlockEditorFooter
            confirming={confirming}
            dirty={dirty}
            labels={labels}
            keepEditing={keepEditing}
            onClose={onClose}
            requestClose={close}
            onApply={apply}
        />
    );
    return (
        <BlockEditorPanel
            kind='exercise'
            title={title || labels.view.kinds.exercise}
            labels={labels}
            onClose={close}
            footer={footer}
        >
            <div className={styles.form}>
                <Input
                    label={labels.field('Title')}
                    value={title}
                    onChange={changeTitle}
                    autoFocus
                    size='sm'
                />
                <ExerciseSetFields
                    ref={fields}
                    exercises={exercises}
                    labels={labels}
                    sources={sources}
                    onDirty={markDirty}
                    onSubmit={apply}
                />
                {error && (
                    <InlineAlert tone='error'>{labels.error}</InlineAlert>
                )}
            </div>
        </BlockEditorPanel>
    );
}
