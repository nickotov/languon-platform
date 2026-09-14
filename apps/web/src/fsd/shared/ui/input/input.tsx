import {
    forwardRef,
    type InputHTMLAttributes,
    type ReactNode,
    useId,
} from 'react';

import type { ControlSize } from '../button/button';
import styles from './input.module.css';

export type InputSize = 'lg' | 'md' | 'sm';
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    controlSize?: ControlSize;
    error?: string;
    fullWidth?: boolean;
    hint?: string;
    label?: string;
    leadingIcon?: ReactNode;
    size?: InputSize;
    trailingIcon?: ReactNode;
    wrapperClassName?: string;
};

const normalizeSize = (
    size: InputSize | undefined,
    controlSize: ControlSize | undefined,
): InputSize => {
    if (size) return size;
    if (controlSize === 'compact' || controlSize === 'small') return 'sm';
    if (controlSize === 'large') return 'lg';
    return 'md';
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    {
        className,
        controlSize,
        error,
        fullWidth = true,
        hint,
        id,
        label,
        leadingIcon,
        size,
        trailingIcon,
        wrapperClassName,
        ...props
    },
    ref,
) {
    const generatedId = useId();
    const inputId = id ?? `input-${generatedId}`;
    const hintId = hint && !error ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const resolvedSize = normalizeSize(size, controlSize);
    return (
        <span
            className={[
                styles.root,
                fullWidth ? styles.fullWidth : undefined,
                wrapperClassName,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {label ? (
                <label className={styles.label} htmlFor={inputId}>
                    {label}
                </label>
            ) : null}
            <span className={styles.control}>
                {leadingIcon ? (
                    <span
                        aria-hidden='true'
                        className={[styles.icon, styles.leading].join(' ')}
                    >
                        {leadingIcon}
                    </span>
                ) : null}
                <input
                    {...props}
                    aria-describedby={
                        [props['aria-describedby'], errorId, hintId]
                            .filter(Boolean)
                            .join(' ') || undefined
                    }
                    aria-invalid={error ? true : props['aria-invalid']}
                    className={[
                        styles.input,
                        styles[resolvedSize],
                        controlSize ? styles[controlSize] : undefined,
                        leadingIcon ? styles.withLeading : undefined,
                        trailingIcon ? styles.withTrailing : undefined,
                        className,
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    id={inputId}
                    ref={ref}
                />
                {trailingIcon ? (
                    <span
                        aria-hidden='true'
                        className={[styles.icon, styles.trailing].join(' ')}
                    >
                        {trailingIcon}
                    </span>
                ) : null}
            </span>
            {error ? (
                <span className={styles.error} id={errorId} role='alert'>
                    {error}
                </span>
            ) : hint ? (
                <span className={styles.hint} id={hintId}>
                    {hint}
                </span>
            ) : null}
        </span>
    );
});
