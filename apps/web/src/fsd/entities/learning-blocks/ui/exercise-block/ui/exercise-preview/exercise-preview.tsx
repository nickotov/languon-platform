import {
    getExerciseActivity,
    type ExerciseLearningBlock,
} from '@languon/contracts';
import { isLocale } from '@/fsd/shared/i18n';
import {
    exerciseCheckingLabel,
    exerciseChoiceText,
    exerciseReferenceText,
} from '../../../../lib/named-exercise-labels';
import type { LearningBlockViewProps } from '../../../../types';
import { ExerciseHint } from '../exercise-hint/exercise-hint';
import { LearningNarrative } from '../../../learning-narrative/learning-narrative';
import styles from '../../../styles/exercise-block-common.module.css';

export function ExercisePreview(
    props: LearningBlockViewProps & { block: ExerciseLearningBlock },
) {
    const { block, labels } = props;
    const compact = props.variant === 'compact';
    const labelLocale = labels.locale ?? 'en';
    const locale = isLocale(labelLocale) ? labelLocale : 'en';
    const activity = block.semantics
        ? getExerciseActivity(block.semantics.activity.id)
        : undefined;
    const activityLabel = activity
        ? `${activity.locales[locale].name} · ${exerciseCheckingLabel(activity.checkingPolicy, locale)}`
        : undefined;
    const referenceText = exerciseReferenceText(block, locale);

    return (
        <div className={styles.preview}>
            {activityLabel && (
                <p className={styles.secondary}>{activityLabel}</p>
            )}
            <p className={styles.question}>{block.question}</p>
            {!compact && block.format === 'multiple-choice' ? (
                <ul>
                    {block.choices.map((choice) => {
                        const choiceText = exerciseChoiceText(
                            block,
                            choice,
                            locale,
                        );

                        return <li key={choice.id}>{choiceText}</li>;
                    })}
                </ul>
            ) : null}
            <p className={styles.reference}>
                <span>{labels.answer}: </span>
                {referenceText}
            </p>
            {!compact ? (
                <>
                    <LearningNarrative
                        className={styles.secondary}
                        content={block.explanation}
                    />
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
