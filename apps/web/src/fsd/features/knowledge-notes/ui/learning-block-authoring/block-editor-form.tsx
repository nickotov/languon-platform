'use client';
import type { LearningBlock } from '@languon/contracts';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { blockFieldTarget } from '../../lib/block-field-target';
import type { BlockKind } from '../../lib/learning-block-form';
import type { BlockFormDraft } from '../../hooks/use-block-form-draft';
import type { RenderAudioPreparation } from './block-authoring-context';
import type { BlockAuthoringLabels } from './block-labels';
import {
    BlockFieldInput,
    BlockRowGroup,
    type BlockFieldEnhancement,
} from './block-form-fields';
import { BlockLanguageSettings } from './block-language-settings';
import { BlockFieldAiAction } from './block-field-ai-action';
import { ExerciseSourcePicker } from './exercise-source-picker';
import { AudioBlockUpload, type UploadBlockAudio } from './audio-block-upload';
import styles from './learning-block-authoring.module.css';
export function BlockEditorForm({
    draft,
    kind,
    block,
    labels,
    sources,
    uploadAudio,
    hideTitle = false,
    renderAudioPreparation,
}: {
    draft: BlockFormDraft;
    kind: BlockKind;
    block?: LearningBlock | undefined;
    labels: BlockAuthoringLabels;
    sources: LearningBlock[];
    uploadAudio?: UploadBlockAudio | undefined;
    hideTitle?: boolean;
    renderAudioPreparation?: RenderAudioPreparation | undefined;
}) {
    const {
        formId,
        error,
        form,
        blockId,
        fields,
        groups,
        preparedTranslations,
        translationKey,
        ai,
        count,
        submit,
        change,
        showPreview,
        handlePreparedTranslationChange,
        uploaded,
        setDirty,
    } = draft;
    const enhance: BlockFieldEnhancement = ({ name, value, onAccept }) => {
        const eligible =
            (kind === 'vocabulary' &&
                /^entries\.\d+\.(?:translation|exampleTranslation)$/u.test(
                    name,
                )) ||
            (kind === 'bilingual-text' &&
                /^segments\.\d+\.translation$/u.test(name));
        if (!eligible) return null;
        function getTarget() {
            return form.current
                ? blockFieldTarget(
                      kind,
                      name,
                      value,
                      new FormData(form.current),
                  )
                : null;
        }
        function accept(next: string) {
            onAccept(next);
            setDirty(true);
        }
        const target = getTarget();
        let fieldKey = name;
        if (target?.kind === 'vocabulary')
            fieldKey = `${target.entryId}:${target.field}`;
        if (target?.kind === 'bilingual-text')
            fieldKey = `${target.segmentId}:${target.targetLanguage}`;
        return (
            <BlockFieldAiAction
                ai={ai}
                fieldKey={fieldKey}
                getTarget={getTarget}
                onAccept={accept}
                labels={labels}
            />
        );
    };
    const audioDraft = kind === 'audio' ? draft.getAudioDraft() : null;
    const audioPreparation =
        audioDraft && renderAudioPreparation
            ? renderAudioPreparation(audioDraft, draft.acceptAudio)
            : null;
    const titleField = fields.find((field) => field.name === 'title');
    const languageFields = fields.filter(
        (field) =>
            field.name === 'language' || field.name === 'translationLanguage',
    );
    const contentFields = fields.filter(
        (field) =>
            !['title', 'language', 'translationLanguage'].includes(field.name),
    );
    return (
        <form
            id={formId}
            ref={form}
            onSubmit={submit}
            onChange={change}
            className={styles.form}
        >
            <input type='hidden' name='blockId' value={blockId.current} />
            {hideTitle && (
                <input type='hidden' name='title' value={block?.title ?? ''} />
            )}
            {!hideTitle && titleField && (
                <BlockFieldInput
                    key={`title-${translationKey}`}
                    field={titleField}
                    labels={labels}
                />
            )}
            {languageFields.length > 0 && (
                <BlockLanguageSettings
                    fields={languageFields}
                    labels={labels}
                    form={form}
                    revision={translationKey}
                    initialOpen={!block}
                />
            )}
            {preparedTranslations.length > 0 && (
                <label className={styles.field}>
                    {labels.field('Prepared translation')}
                    <select
                        defaultValue={preparedTranslations[0]?.language ?? ''}
                        onChange={handlePreparedTranslationChange}
                    >
                        {preparedTranslations.map((translation) => (
                            <option
                                key={translation.language}
                                value={translation.language}
                            >
                                {translation.language}
                            </option>
                        ))}
                        <option value=''>
                            {labels.field('Add translation')}
                        </option>
                    </select>
                </label>
            )}
            {draft.translationReviewNeeded && (
                <InlineAlert>
                    {labels.field(
                        'The original changed. Review every prepared translation before applying changes.',
                    )}
                </InlineAlert>
            )}
            {contentFields.map((field) => (
                <BlockFieldInput
                    key={`${field.name}-${translationKey}`}
                    field={field}
                    labels={labels}
                />
            ))}
            {kind === 'audio' && uploadAudio && (
                <AudioBlockUpload
                    upload={uploadAudio}
                    disabled={false}
                    labels={labels}
                    onReady={uploaded}
                />
            )}
            {audioPreparation}
            {groups.map((group) => (
                <BlockRowGroup
                    key={`${group.name}-${translationKey}`}
                    group={group}
                    labels={labels}
                    onCount={count}
                    enhance={enhance}
                />
            ))}
            {kind === 'exercise' && (
                <ExerciseSourcePicker
                    sources={sources}
                    initial={
                        block?.type === 'exercise' ? block.source : undefined
                    }
                    labels={labels}
                />
            )}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
            {!hideTitle && (
                <Button
                    type='button'
                    size='compact'
                    variant='ghost'
                    onClick={showPreview}
                >
                    {labels.preview}
                </Button>
            )}
        </form>
    );
}
