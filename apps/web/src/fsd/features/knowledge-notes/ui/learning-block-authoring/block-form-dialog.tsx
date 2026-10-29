'use client';
import { useRef } from 'react';
import type { ExerciseLearningBlock, LearningBlock } from '@languon/contracts';
import {
    LearningBlockView,
    type LearningBlockViewProps,
} from '@/fsd/entities/learning-blocks';
import { ActionConsentDialog } from '@/fsd/entities/ai-action';
import type {
    BlockKind,
    BlockLanguageDefaults,
} from '../../lib/learning-block-form';
import { useBlockFormDraft } from '../../hooks/use-block-form-draft';
import type { KnowledgeBlockFieldAiContext } from '../../api/block-field-ai-api';
import type { RenderAudioPreparation } from './block-authoring-context';
import type { BlockAuthoringLabels } from './block-labels';
import {
    ExerciseSetFields,
    type ExerciseSetFieldsHandle,
} from './exercise-set-fields';
import { BlockEditorPanel } from './block-editor-panel';
import { BlockEditorFooter } from './block-editor-footer';
import { BlockEditorForm } from './block-editor-form';
import type { UploadBlockAudio } from './audio-block-upload';
import styles from './learning-block-authoring.module.css';
export function BlockFormDialog(props: {
    kind: BlockKind;
    block?: LearningBlock | undefined;
    labels: BlockAuthoringLabels;
    onClose(): void;
    onApply(block: LearningBlock): boolean;
    sources: LearningBlock[];
    uploadAudio?: UploadBlockAudio | undefined;
    fieldAi?: KnowledgeBlockFieldAiContext | undefined;
    languageDefaults?: BlockLanguageDefaults | undefined;
    renderAudioPreparation?: RenderAudioPreparation | undefined;
    relatedExercises?: ExerciseLearningBlock[] | undefined;
    blockViewOptions?:
        | ((
              block: LearningBlock,
          ) => Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'>)
        | undefined;
    onApplyAudio?:
        | ((
              audio: Extract<LearningBlock, { type: 'audio' }>,
              questions: ExerciseLearningBlock[],
          ) => boolean)
        | undefined;
}) {
    const { kind, block, labels, onClose, sources, uploadAudio } = props;
    const questions = useRef<ExerciseSetFieldsHandle>(null);
    function apply(block: LearningBlock) {
        if (block.type === 'audio' && props.onApplyAudio) {
            const next = questions.current?.read();
            if (!next) return false;
            return props.onApplyAudio(block, next);
        }
        return props.onApply(block);
    }
    const draft = useBlockFormDraft({ ...props, onApply: apply });
    function markDirty() {
        draft.setDirty(true);
    }
    function submitAudio() {
        draft.form.current?.requestSubmit();
    }
    const audioDraft = draft.getAudioDraft();
    const questionSources = audioDraft
        ? [
              ...sources.filter((source) => source.id !== audioDraft.id),
              audioDraft,
          ]
        : sources;
    const footer = (
        <BlockEditorFooter
            confirming={draft.confirming}
            dirty={draft.dirty}
            formId={draft.formId}
            labels={labels}
            keepEditing={draft.keepEditing}
            onClose={onClose}
            requestClose={draft.requestClose}
        />
    );
    return (
        <>
            <BlockEditorPanel
                kind={kind}
                title={draft.title}
                labels={labels}
                onClose={draft.requestClose}
                footer={footer}
            >
                <BlockEditorForm
                    draft={draft}
                    kind={kind}
                    block={block}
                    labels={labels}
                    sources={sources}
                    uploadAudio={uploadAudio}
                    renderAudioPreparation={props.renderAudioPreparation}
                />
                {kind === 'audio' && props.onApplyAudio && (
                    <section className={styles.audioQuestions}>
                        <h3>{labels.field('Questions')}</h3>
                        <ExerciseSetFields
                            ref={questions}
                            exercises={props.relatedExercises ?? []}
                            labels={labels}
                            sources={questionSources}
                            onDirty={markDirty}
                            onSubmit={submitAudio}
                            allowEmpty
                        />
                    </section>
                )}
                {draft.preview !== null && (
                    <section
                        className={styles.preview}
                        aria-label={labels.preview}
                    >
                        <LearningBlockView
                            {...props.blockViewOptions?.(draft.preview)}
                            block={draft.preview}
                            labels={labels.view}
                            variant='learner'
                            scope='editor-preview'
                        />
                    </section>
                )}
            </BlockEditorPanel>
            <ActionConsentDialog
                quote={draft.ai.consent.quote}
                onSend={draft.ai.consent.confirm}
                onClose={draft.ai.consent.cancel}
            />
        </>
    );
}
