'use client';

import {
    createContext,
    type InputHTMLAttributes,
    type ReactNode,
    useContext,
    useId,
} from 'react';

import styles from './radio-group.module.css';

export type RadioSize = 'md' | 'sm';
export type RadioVariant = 'card' | 'default';
type Context = {
    disabled: boolean;
    invalid: boolean;
    name: string;
    onChange: ((value: string) => void) | undefined;
    size: RadioSize;
    value: string | undefined;
    variant: RadioVariant;
};
const RadioContext = createContext<Context | null>(null);
export type RadioOption = {
    disabled?: boolean;
    label: ReactNode;
    value: string;
};
export type RadioGroupProps = {
    children?: ReactNode;
    className?: string;
    defaultValue?: string;
    description?: string;
    disabled?: boolean;
    error?: string;
    label?: string;
    legend?: string;
    name?: string;
    onChange?: (value: string) => void;
    options?: RadioOption[];
    orientation?: 'horizontal' | 'vertical';
    size?: RadioSize;
    value?: string;
    variant?: RadioVariant;
};

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
            {label || legend ? <legend>{label ?? legend}</legend> : null}
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

export type RadioProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'size' | 'type'
> & {
    addon?: ReactNode;
    children: ReactNode;
    description?: ReactNode;
    onChange?: (value: string) => void;
    size?: RadioSize;
    value: string;
    variant?: RadioVariant;
};
export function Radio({
    addon,
    checked,
    children,
    className,
    defaultChecked,
    description,
    disabled,
    name,
    onChange,
    size,
    value,
    variant,
    ...props
}: RadioProps) {
    const group = useContext(RadioContext);
    const resolvedSize = size ?? group?.size ?? 'md';
    const resolvedVariant = variant ?? group?.variant ?? 'default';
    const isDisabled = Boolean(disabled || group?.disabled);
    const controlledChecked =
        group?.value !== undefined ? group.value === value : checked;
    return (
        <label
            className={[
                styles.radio,
                styles[resolvedSize],
                styles[resolvedVariant],
                group?.invalid ? styles.invalid : undefined,
                isDisabled ? styles.disabled : undefined,
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <input
                {...props}
                checked={controlledChecked}
                defaultChecked={
                    controlledChecked === undefined ? defaultChecked : undefined
                }
                disabled={isDisabled}
                name={group?.name ?? name}
                onChange={() => {
                    group?.onChange?.(value);
                    if (!group) onChange?.(value);
                }}
                type='radio'
                value={value}
            />
            <span aria-hidden='true' className={styles.dot}>
                <span />
            </span>
            <span className={styles.copy}>
                <span className={styles.label}>{children}</span>
                {description ? (
                    <span className={styles.description}>{description}</span>
                ) : null}
            </span>
            {addon ? <span className={styles.addon}>{addon}</span> : null}
        </label>
    );
}
