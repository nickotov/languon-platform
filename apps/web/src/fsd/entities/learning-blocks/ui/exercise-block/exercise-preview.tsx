import type { ExerciseLearningBlock } from '@languon/contracts';
import type { LearningBlockViewProps } from '../../types';
import { ExerciseHint } from './exercise-hint';
import styles from './exercise-block.module.css';

export function ExercisePreview(
    props: LearningBlockViewProps & { block: ExerciseLearningBlock },
) {
    const { block, labels } = props;
    const compact = props.variant === 'compact';
    return (
        <div className={styles.preview}>
            <p className={styles.question}>{block.question}</p>
            {!compact && block.format === 'multiple-choice' ? (
                <ul>
                    {block.choices.map((choice) => (
                        <li key={choice.id}>{choice.text}</li>
                    ))}
                </ul>
            ) : null}
            <p className={styles.reference}>
                <span>{labels.answer}: </span>
                {block.referenceAnswer}
            </p>
            {!compact ? (
                <>
                    <p className={styles.secondary}>{block.explanation}</p>
                    {block.format === 'free-text' &&
                    block.acceptedAnswers?.length ? (
                        <p className={styles.secondary}>
                            {labels.answer}: {block.acceptedAnswers.join(' / ')}
                        </p>
                    ) : null}
                    {block.format === 'fill-in-the-blank' ? (
                        <ul>
                            {block.parts.map((part, index) =>
                                part.kind === 'gap' ? (
                                    <li key={part.id}>
                                        {labels.answer} {index + 1}:{' '}
                                        {part.acceptedAnswers.join(' / ')}
                                    </li>
                                ) : null,
                            )}
                        </ul>
                    ) : null}
                    {block.evaluationCriteria ? (
                        <p className={styles.secondary}>
                            {block.evaluationCriteria}
                        </p>
                    ) : null}
                    {block.hint ? (
                        <p className={styles.secondary}>
                            {labels.hint}: {block.hint}
                        </p>
                    ) : null}
                    {props.hintTranscript ? (
                        <ExerciseHint {...props} hint={undefined} />
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
