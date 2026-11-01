import type { ExerciseLearningBlock } from '@languon/contracts';
import type { ComponentProps } from 'react';
import type { LearningBlockLabels } from '../../types';
import { ExerciseHint } from './exercise-hint';
import { LearningNarrative } from '../learning-narrative/learning-narrative';
import styles from './exercise-block.module.css';

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
}) {
    return (
        <div aria-live='polite' className={styles.results}>
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
            {visibleFeedback ? (
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
                    <p dir='auto'>{block.referenceAnswer}</p>
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
