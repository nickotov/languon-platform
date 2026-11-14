'use client';

import { useId, type KeyboardEvent } from 'react';
import {
    Button,
    InlineAlert,
    Input,
    RadioGroup,
    Select,
} from '@/fsd/shared/ui';
import type { Locale } from '@/fsd/shared/i18n';
import type { KnowledgeBlockReference } from '../../lib/knowledge-block-references';
import {
    useExerciseGeneration,
    type PreparedExerciseRequest,
} from '../../hooks/use-exercise-generation';
import type { ExerciseGenerationRequest } from '../../lib/exercise-generation';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';
import { BlockEditorPanel } from '../learning-block-authoring/ui/block-editor-panel/block-editor-panel';
import { ActivityOptions } from './ui/activity-options/activity-options';
import { ActivityDistribution } from './ui/activity-distribution/activity-distribution';
import styles from './exercise-generation-picker.module.css';

export function ExerciseGenerationPicker(props: {
    sources: KnowledgeBlockReference[];
    selectedIds: string[];
    passage?: string | undefined;
    language?: string | undefined;
    explanationLanguage?: string | undefined;
    locale: Locale;
    busy?: boolean | undefined;
    initialRequest?: ExerciseGenerationRequest | undefined;
    onClose(): void;
    onPrepare(value: PreparedExerciseRequest): void;
}) {
    const draft = useExerciseGeneration(props);
    const formId = useId();
    const { text } = draft;
    const labels = localizedBlockLabels(props.locale);
    const sourceOptions = draft.eligibleSources.map((source) => ({
        value: source.id,
        label: source.title,
    }));

    if (draft.initialSources.length) {
        sourceOptions.unshift({
            value: '__references__',
            label: `${text.referenced}: ${draft.initialSources.map((source) => source.title).join(', ')}`,
        });
    }

    if (props.passage?.trim()) {
        sourceOptions.unshift({
            value: '__selection__',
            label: text.selection,
        });
    }

    const modeOptions = [
        { value: 'automatic', label: text.automatic },
        { value: 'selected', label: text.selected },
    ];
    const categories = {
        vocabulary: text.words,
        grammar: text.grammar,
        reading: text.reading,
        writing: text.writing,
    };
    const difficultyOptions = [
        { value: 'beginner', label: text.beginner },
        { value: 'intermediate', label: text.intermediate },
        { value: 'advanced', label: text.advanced },
    ];
    const sourceSummary = draft.usesSelection
        ? props.passage
        : draft.selectedSources.map((source) => source.title).join(' · ');
    const summary =
        draft.mode === 'selected' && draft.allocations
            ? draft.allocations
                  .map(
                      (allocation) =>
                          `${allocation.count} × ${draft.activities.find((activity) => activity.id === allocation.activityId)?.locales[props.locale].name ?? allocation.activityId}`,
                  )
                  .join(' · ')
            : text.automaticHint;
    const footer = (
        <div className={styles.footer}>
            <Button variant='secondary' onClick={props.onClose}>
                {text.cancel}
            </Button>
            <Button
                type='submit'
                form={formId}
                disabled={Boolean(draft.error) || props.busy}
            >
                {text.generate}
            </Button>
        </div>
    );

    function handlePanelKey(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape') {
            event.stopPropagation();
        }
    }

    return (
        <div onKeyDown={handlePanelKey}>
            <BlockEditorPanel
                kind='exercise'
                title={text.title}
                subtitle={text.subtitle}
                labels={labels}
                onClose={props.onClose}
                footer={footer}
            >
                <form
                    id={formId}
                    onSubmit={draft.submit}
                    className={styles.form}
                >
                    <Select
                        label={text.source}
                        value={draft.sourceId}
                        onChange={draft.changeSource}
                        options={sourceOptions}
                        placeholder={text.chooseSource}
                        required
                    />
                    {sourceSummary && (
                        <p className={styles.source} dir='auto'>
                            {sourceSummary}
                        </p>
                    )}
                    <RadioGroup
                        label={text.mode}
                        value={draft.mode}
                        options={modeOptions}
                        onChange={draft.changeMode}
                    />
                    {draft.mode === 'selected' ? (
                        <ActivityOptions
                            activities={draft.activities}
                            selected={draft.selected}
                            locale={props.locale}
                            categories={categories}
                            exampleLabel={text.example}
                            onToggle={draft.toggleActivity}
                        />
                    ) : (
                        <p className={styles.hint}>{text.automaticHint}</p>
                    )}
                    <div className={styles.fields}>
                        <Input
                            label={text.count}
                            type='number'
                            min={1}
                            max={25}
                            step={1}
                            value={draft.count}
                            onChange={draft.changeCount}
                            required
                        />
                        <Select
                            label={text.difficulty}
                            value={draft.difficulty}
                            options={difficultyOptions}
                            onChange={draft.changeDifficulty}
                        />
                        <Input
                            label={text.language}
                            value={draft.language}
                            maxLength={35}
                            hint={text.languageHint}
                            onChange={draft.changeLanguage}
                            required
                        />
                        <Input
                            label={text.explanation}
                            value={draft.explanation}
                            maxLength={35}
                            hint={text.languageHint}
                            onChange={draft.changeExplanation}
                            required
                        />
                    </div>
                    <p className={styles.hint} aria-live='polite'>
                        {summary}
                    </p>
                    {draft.mode === 'selected' && draft.selected.length > 0 && (
                        <ActivityDistribution
                            allocations={
                                draft.allocations ??
                                draft.selected.map((activityId) => ({
                                    activityId,
                                    count: 1,
                                }))
                            }
                            activities={draft.activities}
                            locale={props.locale}
                            labels={text}
                            onChange={draft.changeAllocation}
                            onDistribute={draft.distribute}
                        />
                    )}
                    {draft.error && (
                        <InlineAlert tone='warning'>{draft.error}</InlineAlert>
                    )}
                    <p className={styles.hint}>{text.sendHint}</p>
                </form>
            </BlockEditorPanel>
        </div>
    );
}
