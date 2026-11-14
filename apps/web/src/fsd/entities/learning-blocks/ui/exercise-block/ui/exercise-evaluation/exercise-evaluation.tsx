import type { WorkbookAttemptEvaluation } from '@languon/contracts';
import type { LearningBlockLabels } from '../../../../types';
import { namedExerciseLabels } from '../../../../lib/named-exercise-labels';
import styles from './exercise-evaluation.module.css';

export function ExerciseEvaluation({
    evaluation,
    labels,
}: {
    evaluation: WorkbookAttemptEvaluation;
    labels: LearningBlockLabels;
}) {
    const text = namedExerciseLabels(labels.locale);
    const headings = {
        correct: labels.correct,
        incorrect: labels.incorrect,
        'partially-correct': text.partial,
        unchecked: text.unchecked,
        'unable-to-assess': text.unassessed,
    };
    const dimensions = {
        'task-completion': text.task,
        meaning: text.meaning,
        'target-use': text.target,
        evidence: text.evidence,
    };
    const statuses = {
        met: text.met,
        'partially-met': text.partlyMet,
        'not-met': text.notMet,
        'unable-to-assess': text.unassessed,
    };

    if (evaluation.status === 'unchecked') {
        return null;
    }

    return (
        <section
            className={styles.root}
            data-outcome={evaluation.status}
            aria-label={headings[evaluation.status]}
            role='status'
        >
            <strong>{headings[evaluation.status]}</strong>
            {evaluation.feedback && <p dir='auto'>{evaluation.feedback}</p>}
            {evaluation.criteria?.length ? (
                <dl className={styles.criteria}>
                    {evaluation.criteria.map((criterion) => (
                        <div key={criterion.dimension}>
                            <dt>
                                {dimensions[criterion.dimension]} ·{' '}
                                {statuses[criterion.status]}
                            </dt>
                            <dd dir='auto'>{criterion.feedback}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
            {evaluation.corrections?.length ? (
                <div>
                    <p className={styles.label}>{text.corrections}</p>
                    <ul>
                        {evaluation.corrections.map((correction) => (
                            <li key={correction} dir='auto'>
                                {correction}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {evaluation.suggestedAnswer && (
                <p dir='auto'>
                    <strong>{text.suggested}: </strong>
                    {evaluation.suggestedAnswer}
                </p>
            )}
        </section>
    );
}
