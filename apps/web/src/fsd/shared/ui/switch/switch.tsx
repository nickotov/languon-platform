import {
    forwardRef,
    type InputHTMLAttributes,
    type ReactNode,
    useId,
} from 'react';

import styles from './switch.module.css';

export type SwitchSize = 'lg' | 'md' | 'sm';
export type SwitchProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'size' | 'type'
> & {
    children?: ReactNode;
    description?: string;
    label?: string;
    onCheckedChange?: (checked: boolean) => void;
    size?: SwitchSize;
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
    {
        children,
        className,
        description,
        disabled,
        id,
        label,
        onChange,
        onCheckedChange,
        size = 'md',
        ...props
    },
    ref,
) {
    const generatedId = useId();
    const switchId = id ?? `switch-${generatedId}`;
    const descriptionId = description ? `${switchId}-description` : undefined;
    const visibleLabel = label ?? children;
    return (
        <label
            className={[
                styles.root,
                styles[size],
                disabled ? styles.disabled : undefined,
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            htmlFor={switchId}
        >
            <span className={styles.control}>
                <input
                    {...props}
                    aria-describedby={
                        [props['aria-describedby'], descriptionId]
                            .filter(Boolean)
                            .join(' ') || undefined
                    }
                    disabled={disabled}
                    id={switchId}
                    onChange={(event) => {
                        onChange?.(event);
                        onCheckedChange?.(event.currentTarget.checked);
                    }}
                    ref={ref}
                    role='switch'
                    type='checkbox'
                />
                <span aria-hidden='true' className={styles.track}>
                    <span className={styles.thumb} />
                </span>
            </span>
            {visibleLabel || description ? (
                <span className={styles.copy}>
                    {visibleLabel ? (
                        <span className={styles.label}>{visibleLabel}</span>
                    ) : null}
                    {description ? (
                        <span className={styles.description} id={descriptionId}>
                            {description}
                        </span>
                    ) : null}
                </span>
            ) : null}
        </label>
    );
});
