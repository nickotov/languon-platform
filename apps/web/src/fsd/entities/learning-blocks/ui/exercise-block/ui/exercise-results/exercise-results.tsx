import type {
    ExerciseLearningBlock,
    WorkbookAttemptEvaluation,
} from '@languon/contracts';
import type { ComponentProps } from 'react';
import type { LearningBlockLabels } from '../../../../types';
import { ExerciseHint } from '../exercise-hint/exercise-hint';
import { ExerciseEvaluation } from '../exercise-evaluation/exercise-evaluation';
import {
    namedExerciseLabels,
    exerciseReferenceText,
} from '../../../../lib/named-exercise-labels';
import { LearningNarrative } from '../../../learning-narrative/learning-narrative';
import styles from '../../../styles/exercise-block-common.module.css';

export function ExerciseResults({
    block,
    labels,
    preparedResult,
    visibleFeedback,
    feedbackTitle,
    hintVisible,
    revealed,
    hintOptions,
    error,
    evaluation,
    preparedUnchecked = false,
}: {
    block: ExerciseLearningBlock;
    labels: LearningBlockLabels;
    preparedResult: boolean | undefined;
    visibleFeedback: string | undefined;
    feedbackTitle: string;
    hintVisible: boolean;
    revealed: boolean;
    hintOptions: ComponentProps<typeof ExerciseHint>;
    error: string | undefined;
    evaluation?: WorkbookAttemptEvaluation | undefined;
    preparedUnchecked?: boolean | undefined;
}) {
    const hasEvaluation = evaluation && evaluation.status !== 'unchecked';
    const namedLabels = namedExerciseLabels(labels.locale);
    const referenceText = exerciseReferenceText(block, labels.locale);

    return (
        <div aria-live='polite' className={styles.results}>
            {hasEvaluation && (
                <ExerciseEvaluation evaluation={evaluation} labels={labels} />
            )}
            {preparedUnchecked && (
                <p className={styles.secondary} role='status'>
                    {namedLabels.alternatives}
                </p>
            )}
            {preparedResult !== undefined ? (
                <div
                    className={styles.feedback}
                    data-correct={preparedResult}
                    role='status'
                >
                    <strong>
                        {preparedResult ? labels.correct : labels.incorrect}
                    </strong>
                    <LearningNarrative content={block.explanation} />
                </div>
            ) : null}
            {visibleFeedback && !hasEvaluation ? (
                <div role='status' className={styles.feedback}>
                    <p className={styles.feedbackTitle}>{feedbackTitle}</p>
                    <p dir='auto'>{visibleFeedback}</p>
                </div>
            ) : null}
            {hintVisible ? (
                <ExerciseHint {...hintOptions} hint={block.hint} />
            ) : null}
            {revealed ? (
                <div className={styles.referencePanel} role='status'>
                    <p className={styles.feedbackTitle}>{labels.answer}</p>
                    <p dir='auto'>{referenceText}</p>
                    <LearningNarrative
                        className={styles.secondary}
                        content={block.explanation}
                    />
                </div>
            ) : null}
            {error ? (
                <p role='alert' className={styles.error}>
                    {error}
                </p>
            ) : null}
        </div>
    );
}
