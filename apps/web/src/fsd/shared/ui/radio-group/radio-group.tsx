'use client';

import { useId } from 'react';
import styles from '../styles/radio-group-common.module.css';
import type { RadioGroupProps } from './types';
import { Radio } from './ui/radio/radio';
import { RadioContext } from './model/radio-context';

export function RadioGroup({
    children,
    className,
    defaultValue,
    description,
    disabled = false,
    error,
    label,
    legend,
    name,
    onChange,
    options,
    orientation = 'vertical',
    size = 'md',
    value,
    variant = 'default',
}: RadioGroupProps) {
    const generatedName = useId();

    const groupName = name ?? generatedName;

    const actualChildren =
        children ??
        options?.map((option) => (
            <Radio
                defaultChecked={option.value === defaultValue}
                disabled={option.disabled}
                key={option.value}
                value={option.value}
            >
                {option.label}
            </Radio>
        ));

    return (
        <fieldset
            aria-invalid={error ? true : undefined}
            className={[styles.group, className].filter(Boolean).join(' ')}
            disabled={disabled}
        >
            {label || legend ? (
                <legend className={styles.legend}>{label ?? legend}</legend>
            ) : null}
            {description ? (
                <p className={styles.groupDescription}>{description}</p>
            ) : null}
            <div
                className={[styles.options, styles[orientation]].join(' ')}
                role='radiogroup'
            >
                <RadioContext.Provider
                    value={{
                        disabled,
                        invalid: Boolean(error),
                        name: groupName,
                        onChange,
                        size,
                        value,
                        variant,
                    }}
                >
                    {actualChildren}
                </RadioContext.Provider>
            </div>
            {error ? (
                <p className={styles.error} role='alert'>
                    {error}
                </p>
            ) : null}
        </fieldset>
    );
}
