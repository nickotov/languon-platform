import type { ChangeEvent } from 'react';
import type { ExerciseLearningBlock } from '@languon/contracts';
import type { LearningBlockLabels } from '../../types';
import styles from './exercise-block.module.css';

export function ExerciseAnswerFields({
    block,
    labels,
    answer,
    gaps,
    onAnswer,
    onGap,
}: {
    block: ExerciseLearningBlock;
    labels: LearningBlockLabels;
    answer: string;
    gaps: Record<string, string>;
    onAnswer: (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => void;
    onGap: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
    if (block.format === 'multiple-choice')
        return (
            <fieldset className={styles.choices}>
                <legend className={styles.srOnly}>{labels.answer}</legend>
                {block.choices.map((choice) => (
                    <label
                        className={styles.choice}
                        key={choice.id}
                        data-selected={answer === choice.id || undefined}
                    >
                        <input
                            type='radio'
                            name={`exercise-${block.id}`}
                            value={choice.id}
                            checked={answer === choice.id}
                            onChange={onAnswer}
                            required
                        />
                        <span dir='auto'>{choice.text}</span>
                    </label>
                ))}
            </fieldset>
        );
    if (block.format === 'free-text')
        return (
            <label className={styles.answer}>
                <span className={styles.srOnly}>{labels.answer}</span>
                <textarea
                    className={styles.field}
                    value={answer}
                    onChange={onAnswer}
                    rows={2}
                    maxLength={8000}
                    required
                />
            </label>
        );
    return (
        <div className={styles.gaps}>
            {block.parts.map((part, index) => {
                if (part.kind === 'text')
                    return (
                        <span dir='auto' key={index}>
                            {part.text}
                        </span>
                    );
                const label = `${labels.answer} ${index + 1}`;
                const value = gaps[part.id] ?? '';
                return (
                    <label key={part.id}>
                        <span className={styles.srOnly}>{label}</span>
                        <input
                            className={styles.field}
                            name={part.id}
                            value={value}
                            onChange={onGap}
                            maxLength={500}
                            required
                        />
                    </label>
                );
            })}
        </div>
    );
}
