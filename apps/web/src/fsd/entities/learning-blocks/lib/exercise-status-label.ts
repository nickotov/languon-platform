import type { LearningBlockLabels, LearningBlockViewProps } from '../types';
import { namedExerciseLabels } from './named-exercise-labels';

export function exerciseStatusLabel({
    labels,
    attempted,
    hintVisible,
    revealed,
    preparedResult,
    preparedUnchecked,
    saved,
    feedback,
}: {
    labels: LearningBlockLabels;
    attempted: boolean;
    hintVisible: boolean;
    revealed: boolean;
    preparedResult: boolean | undefined;
    preparedUnchecked: boolean;
    saved: LearningBlockViewProps['learnerState'];
    feedback: string | undefined;
}) {
    let status = attempted
        ? (labels.attempted ?? labels.answer)
        : (labels.notAnswered ?? '');

    if (hintVisible) {
        status = labels.hint;
    }

    if (revealed) {
        status = labels.showAnswer;
    }

    if (preparedResult !== undefined) {
        status = preparedResult ? labels.correct : labels.incorrect;
    }

    if (preparedUnchecked) {
        status = namedExerciseLabels(labels.locale).unchecked;
    }

    if (saved?.attempted) {
        status = labels.answer;
    }

    if (saved?.correct !== undefined) {
        status = saved.correct ? labels.correct : labels.incorrect;
    }

    return feedback ? (feedback.split(':')[0] ?? '') : status;
}
