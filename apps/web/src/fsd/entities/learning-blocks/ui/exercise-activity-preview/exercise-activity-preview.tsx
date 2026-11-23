'use client';

import {
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ExerciseActivityId } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import { Button, Dialog, Select } from '@/fsd/shared/ui';
import {
    exerciseActivityExamples,
    type ExerciseActivityExample,
} from '../../lib/activity-examples/activity-examples';
import { exerciseExampleLabels } from '../../lib/activity-examples/example-labels';
import { exerciseCheckingLabel } from '../../lib/named-exercise-labels';
import { LearningBlockView } from '../learning-block-view/learning-block-view';
import { ExerciseEvaluation } from '../exercise-block/ui/exercise-evaluation/exercise-evaluation';
import { exercisePreviewCopy } from './preview-copy';
import styles from './exercise-activity-preview.module.css';

function ExampleFeedback({
    example,
    locale,
}: {
    example: ExerciseActivityExample;
    locale: Locale;
}) {
    const [visible, setVisible] = useState(false);
    const [selected, setSelected] = useState(example.sampleResponses[0]?.id);
    const response =
        example.sampleResponses.find((item) => item.id === selected) ??
        example.sampleResponses[0];
    const copy = exercisePreviewCopy(locale);
    const options = example.sampleResponses.map((item) => ({
        value: item.id,
        label: item.label,
    }));

    function show() {
        setVisible(true);
    }

    function change(event: ChangeEvent<HTMLSelectElement>) {
        setSelected(event.target.value);
    }

    if (!response) {
        return null;
    }

    return (
        <section className={styles.feedback} aria-label={copy.feedback}>
            <h3>{copy.feedback}</h3>
            <p>{copy.feedbackNotice}</p>
            <Select
                label={copy.response}
                value={selected}
                options={options}
                onChange={change}
            />
            <blockquote dir='auto'>{response.answer}</blockquote>
            <Button type='button' variant='secondary' onClick={show}>
                {copy.showFeedback}
            </Button>
            {visible && (
                <ExerciseEvaluation
                    evaluation={response.evaluation}
                    labels={exerciseExampleLabels(locale)}
                />
            )}
        </section>
    );
}

function ExampleContent({
    example,
    locale,
}: {
    example: ExerciseActivityExample;
    locale: Locale;
}) {
    const [revision, setRevision] = useState(0);
    const copy = exercisePreviewCopy(locale);
    const labels = exerciseExampleLabels(locale);
    const key = `${example.activity.id}-${revision}`;
    const expansion = { open: true, at: revision };
    const checkingLabel =
        example.activity.checkingPolicy === 'prepared-key'
            ? exerciseCheckingLabel('prepared-key', locale)
            : copy.feedback;

    function reset() {
        setRevision((value) => value + 1);
    }

    return (
        <div className={styles.content} data-listening-document>
            <p className={styles.notice}>{copy.notice}</p>
            <p>{example.activity.locales[locale].description}</p>
            <p>{example.useCaseGuidance}</p>
            <p className={styles.checking}>
                {copy.checking}:{' '}
                {exerciseCheckingLabel(example.activity.checkingPolicy, locale)}
            </p>
            <section className={styles.source}>
                <h3>{copy.source}</h3>
                {example.recording ? (
                    <LearningBlockView
                        variant='author'
                        block={example.recording.block}
                        labels={labels}
                        audioUrl={example.recording.url}
                    />
                ) : (
                    <p dir='auto'>{example.sourceText}</p>
                )}
            </section>
            <LearningBlockView
                key={key}
                block={example.block}
                audioUrl={example.recording?.url}
                hintTranscript={example.recording?.excerpt}
                labels={labels}
                scope={`preview-${key}`}
                expandAll={expansion}
                checkingLabelOverride={checkingLabel}
            />
            <Button type='button' variant='ghost' onClick={reset}>
                {copy.reset}
            </Button>
            <ExampleFeedback
                key={`feedback-${key}`}
                example={example}
                locale={locale}
            />
        </div>
    );
}

/** A self-contained local example: it never receives persistence or model callbacks. */
export function ExerciseActivityPreview({
    activityId,
    locale,
    open,
    onClose,
    footer,
}: {
    activityId: ExerciseActivityId;
    locale: Locale;
    open: boolean;
    onClose(): void;
    footer?: ReactNode;
}) {
    const example = exerciseActivityExamples(locale).find(
        (item) => item.activity.id === activityId,
    );
    const copy = exercisePreviewCopy(locale);

    if (!open || !example || typeof document === 'undefined') {
        return null;
    }

    function isolatePreviewSubmission(event: FormEvent<HTMLDivElement>) {
        // Portals escape DOM forms, but React events still bubble through the composer.
        event.preventDefault();
        event.stopPropagation();
    }

    return createPortal(
        <div onSubmit={isolatePreviewSubmission}>
            <Dialog
                open
                title={`${activityId} · ${example.activity.locales[locale].name}`}
                onClose={onClose}
                closeLabel={copy.close}
                className={styles.panel}
                bodyClassName={styles.body}
                footer={footer}
                footerClassName={styles.footer}
                size='lg'
            >
                <ExampleContent
                    key={`${activityId}-${locale}`}
                    example={example}
                    locale={locale}
                />
            </Dialog>
        </div>,
        document.body,
    );
}
