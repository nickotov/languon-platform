import {
    CheckCircle2Icon,
    CircleIcon,
    DotIcon,
    XCircleIcon,
} from 'lucide-react';
import styles from './exercise-option.module.css';
export type ExerciseOptionState =
    'default' | 'selected' | 'correct' | 'incorrect';
export interface ExerciseOptionProps {
    label: string;
    state?: ExerciseOptionState;
    shortcut?: string;
    hint?: string;
    disabled?: boolean;
    onSelect?: () => void;
    className?: string;
}
const icons = {
    default: CircleIcon,
    selected: DotIcon,
    correct: CheckCircle2Icon,
    incorrect: XCircleIcon,
};
const labels = {
    default: '',
    selected: 'Selected',
    correct: 'Correct',
    incorrect: 'Incorrect',
};
export function ExerciseOption({
    label,
    state = 'default',
    shortcut,
    hint,
    disabled = false,
    onSelect,
    className,
}: ExerciseOptionProps) {
    const Icon = icons[state];
    return (
        <button
            type='button'
            role='radio'
            aria-checked={state !== 'default'}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            onClick={disabled ? undefined : onSelect}
            className={[styles.root, styles[state], className]
                .filter(Boolean)
                .join(' ')}
        >
            {shortcut ? (
                <span className={styles.shortcut} aria-hidden='true'>
                    {shortcut}
                </span>
            ) : null}
            <span className={styles.copy}>
                <span className={[styles.copyLine, styles.label].join(' ')}>
                    {label}
                </span>
                {hint ? (
                    <span className={[styles.copyLine, styles.hint].join(' ')}>
                        {hint}
                    </span>
                ) : null}
            </span>
            <span className={styles.status}>
                {labels[state] ? (
                    <span className={styles.statusLabel}>{labels[state]}</span>
                ) : null}
                <Icon className={styles.statusIcon} aria-hidden='true' />
            </span>
        </button>
    );
}
