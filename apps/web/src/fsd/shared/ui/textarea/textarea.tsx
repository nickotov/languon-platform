'use client';

import {
    forwardRef,
    type TextareaHTMLAttributes,
    useId,
    useState,
} from 'react';

import styles from './textarea.module.css';

export type TextareaResize = 'both' | 'none' | 'vertical';
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    description?: string;
    error?: string;
    label?: string;
    resize?: TextareaResize;
    showCount?: boolean;
    wrapperClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    function Textarea(
        {
            className,
            defaultValue,
            description,
            disabled,
            error,
            id,
            label,
            maxLength,
            onChange,
            required,
            resize = 'vertical',
            rows = 4,
            showCount = false,
            value,
            wrapperClassName,
            ...props
        },
        ref,
    ) {
        const generatedId = useId();
        const fieldId = id ?? `textarea-${generatedId}`;
        const descriptionId =
            description && !error ? `${fieldId}-description` : undefined;
        const errorId = error ? `${fieldId}-error` : undefined;
        const controlled = value !== undefined;
        const [internalValue, setInternalValue] = useState(
            typeof defaultValue === 'string' ? defaultValue : '',
        );
        const currentValue = controlled ? String(value ?? '') : internalValue;
        return (
            <span
                className={[styles.root, wrapperClassName]
                    .filter(Boolean)
                    .join(' ')}
            >
                {label ? (
                    <label className={styles.label} htmlFor={fieldId}>
                        {label}
                        {required ? (
                            <span
                                aria-hidden='true'
                                className={styles.required}
                            >
                                *
                            </span>
                        ) : null}
                    </label>
                ) : null}
                <textarea
                    {...props}
                    aria-describedby={
                        [props['aria-describedby'], errorId, descriptionId]
                            .filter(Boolean)
                            .join(' ') || undefined
                    }
                    aria-invalid={error ? true : props['aria-invalid']}
                    className={[styles.textarea, styles[resize], className]
                        .filter(Boolean)
                        .join(' ')}
                    defaultValue={controlled ? undefined : defaultValue}
                    disabled={disabled}
                    id={fieldId}
                    maxLength={maxLength}
                    onChange={(event) => {
                        if (!controlled) setInternalValue(event.target.value);
                        onChange?.(event);
                    }}
                    ref={ref}
                    required={required}
                    rows={rows}
                    value={value}
                />
                {error || description || (showCount && maxLength) ? (
                    <span className={styles.meta}>
                        <span>
                            {error ? (
                                <span
                                    className={styles.error}
                                    id={errorId}
                                    role='alert'
                                >
                                    {error}
                                </span>
                            ) : description ? (
                                <span
                                    className={styles.description}
                                    id={descriptionId}
                                >
                                    {description}
                                </span>
                            ) : null}
                        </span>
                        {showCount && maxLength ? (
                            <span
                                className={[
                                    styles.count,
                                    currentValue.length >= maxLength
                                        ? styles.countLimit
                                        : undefined,
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                            >
                                {currentValue.length}/{maxLength}
                            </span>
                        ) : null}
                    </span>
                ) : null}
            </span>
        );
    },
);
