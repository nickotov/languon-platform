import {
    AlertCircleIcon,
    CheckIcon,
    LightbulbIcon,
    Loader2Icon,
    Volume2Icon,
    XIcon,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';
import styles from './exercise-card.module.css';
export type ExerciseKind = 'vocabulary' | 'grammar' | 'listening' | 'reading';
export type ExerciseStatus =
    'idle' | 'loading' | 'error' | 'correct' | 'incorrect';
export interface ExerciseOption {
    id: string;
    label: string;
    hint?: string;
    isCorrect?: boolean;
    disabled?: boolean;
}
export interface ExerciseCardProps {
    question: string;
    instruction?: string;
    kind?: ExerciseKind;
    progressLabel?: string;
    imageUrl?: string;
    imageAlt?: string;
    audioLabel?: string;
    onPlayAudio?: () => void;
    options: ExerciseOption[];
    selectedOptionId?: string | null;
    onSelectOption?: (id: string) => void;
    status?: ExerciseStatus;
    feedback?: string;
    errorMessage?: string;
    hint?: string;
    footer?: ReactNode;
    className?: string;
}
const labels = {
    vocabulary: 'Vocabulary',
    grammar: 'Grammar',
    listening: 'Listening',
    reading: 'Reading',
};
export function ExerciseCard({
    question,
    instruction,
    kind = 'vocabulary',
    progressLabel,
    imageUrl,
    imageAlt = '',
    audioLabel,
    onPlayAudio,
    options,
    selectedOptionId = null,
    onSelectOption,
    status = 'idle',
    feedback,
    errorMessage = 'Something went wrong loading this exercise.',
    hint,
    footer,
    className,
}: ExerciseCardProps) {
    const id = useId();
    const revealed = status === 'correct' || status === 'incorrect';
    const locked = revealed || status === 'loading' || status === 'error';
    if (status === 'loading')
        return (
            <section
                aria-busy='true'
                aria-label='Loading exercise'
                className={[styles.root, className].filter(Boolean).join(' ')}
            >
                <div className={styles.loadingLabel}>
                    <Loader2Icon />
                    Loading exercise…
                </div>
                <div className={styles.skeleton}>
                    <span />
                    <span />
                    <span />
                    <span />
                </div>
            </section>
        );
    return (
        <section
            aria-labelledby={`${id}-question`}
            className={[styles.root, className].filter(Boolean).join(' ')}
        >
            <header>
                <span className={[styles.kind, styles[kind]].join(' ')}>
                    {labels[kind]}
                </span>
                {progressLabel ? (
                    <span className={styles.progress}>{progressLabel}</span>
                ) : null}
            </header>
            <div className={styles.prompt}>
                {instruction ? <p>{instruction}</p> : null}
                <h3 id={`${id}-question`}>{question}</h3>
            </div>
            {imageUrl ? (
                <img src={imageUrl} alt={imageAlt} className={styles.image} />
            ) : null}
            {audioLabel ? (
                <button
                    type='button'
                    onClick={onPlayAudio}
                    className={styles.audio}
                >
                    <Volume2Icon aria-hidden='true' />
                    {audioLabel}
                </button>
            ) : null}
            {status === 'error' ? (
                <div role='alert' className={styles.error}>
                    <AlertCircleIcon aria-hidden='true' />
                    {errorMessage}
                </div>
            ) : null}
            <div
                role='radiogroup'
                aria-labelledby={`${id}-question`}
                className={styles.options}
            >
                {options.map((option) => {
                    const selected = option.id === selectedOptionId,
                        correct = revealed && option.isCorrect,
                        incorrect = revealed && selected && !option.isCorrect,
                        state = correct
                            ? 'correct'
                            : incorrect
                              ? 'incorrect'
                              : selected
                                ? 'selected'
                                : 'default';
                    return (
                        <button
                            key={option.id}
                            type='button'
                            role='radio'
                            aria-checked={selected}
                            disabled={locked || option.disabled}
                            onClick={() => onSelectOption?.(option.id)}
                            className={[styles.option, styles[state]].join(' ')}
                        >
                            <span>
                                <span>{option.label}</span>
                                {option.hint ? (
                                    <span>{option.hint}</span>
                                ) : null}
                            </span>
                            {correct ? (
                                <CheckIcon aria-label='Correct answer' />
                            ) : incorrect ? (
                                <XIcon aria-label='Incorrect answer' />
                            ) : null}
                        </button>
                    );
                })}
            </div>
            {hint && !revealed ? (
                <div className={styles.hint}>
                    <LightbulbIcon aria-hidden='true' />
                    {hint}
                </div>
            ) : null}
            {revealed && feedback ? (
                <p
                    role='status'
                    className={[
                        styles.feedback,
                        status === 'correct'
                            ? styles.feedbackCorrect
                            : styles.feedbackIncorrect,
                    ].join(' ')}
                >
                    {feedback}
                </p>
            ) : null}
            {footer ? <footer>{footer}</footer> : null}
        </section>
    );
}
