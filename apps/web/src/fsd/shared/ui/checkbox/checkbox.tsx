'use client';

import {
    forwardRef,
    type InputHTMLAttributes,
    type ReactNode,
    useId,
    useImperativeHandle,
    useRef,
} from 'react';

import styles from './checkbox.module.css';

export type CheckboxSize = 'lg' | 'md' | 'sm';
export type CheckboxProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'size' | 'type'
> & {
    children?: ReactNode;
    description?: ReactNode;
    error?: string;
    indeterminate?: boolean;
    label?: ReactNode;
    size?: CheckboxSize;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    function Checkbox(
        {
            children,
            className,
            description,
            disabled,
            error,
            id,
            indeterminate = false,
            label,
            size = 'md',
            ...props
        },
        forwardedRef,
    ) {
        const generatedId = useId();
        const inputId = id ?? `checkbox-${generatedId}`;
        const descriptionId = description
            ? `${inputId}-description`
            : undefined;
        const errorId = error ? `${inputId}-error` : undefined;
        const inputRef = useRef<HTMLInputElement>(null);
        useImperativeHandle(
            forwardedRef,
            () => inputRef.current as HTMLInputElement,
        );
        const visibleLabel = label ?? children;

        return (
            <div className={[styles.root, className].filter(Boolean).join(' ')}>
                <div className={styles.row}>
                    <span className={[styles.control, styles[size]].join(' ')}>
                        <input
                            {...props}
                            aria-checked={
                                indeterminate ? 'mixed' : props['aria-checked']
                            }
                            aria-describedby={
                                [descriptionId, errorId]
                                    .filter(Boolean)
                                    .join(' ') || undefined
                            }
                            aria-invalid={error ? true : undefined}
                            disabled={disabled}
                            id={inputId}
                            ref={(node) => {
                                inputRef.current = node;
                                if (node) node.indeterminate = indeterminate;
                            }}
                            type='checkbox'
                        />
                        <span aria-hidden='true' className={styles.mark}>
                            {indeterminate ? '−' : '✓'}
                        </span>
                    </span>
                    {visibleLabel || description ? (
                        <span className={styles.copy}>
                            {visibleLabel ? (
                                <label
                                    className={styles.label}
                                    htmlFor={inputId}
                                >
                                    {visibleLabel}
                                </label>
                            ) : null}
                            {description ? (
                                <span
                                    className={styles.description}
                                    id={descriptionId}
                                >
                                    {description}
                                </span>
                            ) : null}
                        </span>
                    ) : null}
                </div>
                {error ? (
                    <p className={styles.error} id={errorId}>
                        {error}
                    </p>
                ) : null}
            </div>
        );
    },
);
