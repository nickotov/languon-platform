import { CheckIcon, XIcon } from 'lucide-react';
import type { ExerciseOption } from './exercise-card';
import styles from './exercise-card.module.css';

export function ExerciseAnswerOption({
    option,
    selected,
    revealed,
    locked,
    onSelect,
}: {
    option: ExerciseOption;
    selected: boolean;
    revealed: boolean;
    locked: boolean;
    onSelect: ((id: string) => void) | undefined;
}) {
    const correct = revealed && option.isCorrect;
    const incorrect = revealed && selected && !option.isCorrect;
    let state = 'default';
    let statusIcon = null;

    if (correct) {
        state = 'correct';
        statusIcon = (
            <CheckIcon
                className={styles.optionIcon}
                aria-label='Correct answer'
            />
        );
    } else if (incorrect) {
        state = 'incorrect';
        statusIcon = (
            <XIcon
                className={styles.optionIcon}
                aria-label='Incorrect answer'
            />
        );
    } else if (selected) {
        state = 'selected';
    }

    function handleSelect() {
        onSelect?.(option.id);
    }

    return (
        <button
            type='button'
            role='radio'
            aria-checked={selected}
            disabled={locked || option.disabled}
            onClick={handleSelect}
            className={[styles.option, styles[state]].join(' ')}
        >
            <span className={styles.optionCopy}>
                <span
                    className={[styles.optionLine, styles.optionLabel].join(
                        ' ',
                    )}
                >
                    {option.label}
                </span>
                {option.hint ? (
                    <span
                        className={[styles.optionLine, styles.optionHint].join(
                            ' ',
                        )}
                    >
                        {option.hint}
                    </span>
                ) : null}
            </span>
            {statusIcon}
        </button>
    );
}
