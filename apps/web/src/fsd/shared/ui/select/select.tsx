import { forwardRef, type SelectHTMLAttributes, useId } from 'react';

import styles from './select.module.css';

export type SelectOption = { disabled?: boolean; label: string; value: string };
export type SelectOptionGroup = { label: string; options: SelectOption[] };
export type SelectSize = 'lg' | 'md' | 'sm';
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
    containerClassName?: string;
    error?: string;
    fullWidth?: boolean;
    groups?: SelectOptionGroup[];
    hint?: string;
    label?: string;
    loading?: boolean;
    options?: SelectOption[];
    placeholder?: string;
    size?: SelectSize;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    function Select(
        {
            children,
            className,
            containerClassName,
            disabled,
            error,
            fullWidth = true,
            groups = [],
            hint,
            id,
            label,
            loading = false,
            options = [],
            placeholder,
            size = 'md',
            ...props
        },
        ref,
    ) {
        const generatedId = useId();
        const selectId = id ?? `select-${generatedId}`;
        const hintId = hint && !error ? `${selectId}-hint` : undefined;
        const errorId = error ? `${selectId}-error` : undefined;
        return (
            <span
                className={[
                    styles.root,
                    fullWidth ? styles.fullWidth : undefined,
                    containerClassName,
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                {label ? (
                    <label className={styles.label} htmlFor={selectId}>
                        {label}
                    </label>
                ) : null}
                <span className={styles.control}>
                    <select
                        {...props}
                        aria-describedby={
                            [props['aria-describedby'], errorId, hintId]
                                .filter(Boolean)
                                .join(' ') || undefined
                        }
                        aria-invalid={error ? true : props['aria-invalid']}
                        className={[styles.select, styles[size], className]
                            .filter(Boolean)
                            .join(' ')}
                        disabled={disabled || loading}
                        id={selectId}
                        ref={ref}
                    >
                        {placeholder ? (
                            <option disabled value=''>
                                {placeholder}
                            </option>
                        ) : null}
                        {options.map((option) => (
                            <option
                                disabled={option.disabled}
                                key={option.value}
                                value={option.value}
                            >
                                {option.label}
                            </option>
                        ))}
                        {groups.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                                {group.options.map((option) => (
                                    <option
                                        disabled={option.disabled}
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        {children}
                    </select>
                    <span
                        aria-hidden='true'
                        className={[
                            styles.indicator,
                            loading ? styles.spinner : undefined,
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        {loading ? '' : '⌄'}
                    </span>
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
    },
);
