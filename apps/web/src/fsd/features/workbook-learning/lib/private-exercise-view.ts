import type {
    WorkbookLearningState,
    WorkbookLearnerAttempt,
} from '@languon/contracts';
import type { LearningBlockViewProps } from '@/fsd/entities/learning-blocks';
import type { LearningLabels } from './labels';
import { learnerAnswer } from './learner-answer';

export function privateExerciseView({
    blockId,
    revision,
    state,
    evaluated,
    labels,
}: {
    blockId: string;
    revision: string | undefined;
    state: WorkbookLearningState | undefined;
    evaluated: WorkbookLearnerAttempt | undefined;
    labels: LearningLabels;
}): Pick<
    LearningBlockViewProps,
    'feedback' | 'feedbackKind' | 'learnerState' | 'exerciseRevision'
> {
    if (!revision) return {};
    let latest = state?.attempts.find(
        (item) =>
            item.exerciseId === blockId && item.exerciseRevision === revision,
    );
    if (
        evaluated?.exerciseRevision === revision &&
        (!latest ||
            latest.id === evaluated.id ||
            Date.parse(evaluated.createdAt) > Date.parse(latest.createdAt))
    )
        latest = evaluated;
    let feedback: string | undefined;
    let feedbackKind: 'prepared' | 'ai' = 'prepared';
    if (latest) {
        if (latest.evaluation.status === 'unchecked')
            feedback = labels.unchecked;
        else {
            feedback =
                latest.evaluation.status === 'correct'
                    ? labels.correct
                    : labels.incorrect;
            if (latest.evaluation.feedback)
                feedback += `: ${latest.evaluation.feedback}`;
            if (latest.evaluation.method === 'ai') feedbackKind = 'ai';
        }
    }
    return {
        exerciseRevision: revision,
        feedback,
        feedbackKind,
        learnerState: {
            answer: latest ? learnerAnswer(latest.answer) : undefined,
            attempted: Boolean(latest),
            revealed: Boolean(
                state?.events.some(
                    (item) =>
                        item.blockId === blockId &&
                        item.exerciseRevision === revision &&
                        item.kind === 'answer-revealed',
                ),
            ),
            hintUsed: Boolean(
                state?.events.some(
                    (item) =>
                        item.blockId === blockId &&
                        item.exerciseRevision === revision &&
                        item.kind === 'hint-used',
                ),
            ),
            correct:
                latest && latest.evaluation.status !== 'unchecked'
                    ? latest.evaluation.status === 'correct'
                    : undefined,
            validAlternative:
                latest?.evaluation.status === 'correct' &&
                latest.evaluation.validAlternative === true,
        },
    };
}
