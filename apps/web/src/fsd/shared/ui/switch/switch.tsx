import {
    type ChangeEvent,
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
    const hasVisibleLabel = Boolean(visibleLabel);
    const hasDescription = Boolean(description);
    const hasCopy = hasVisibleLabel || hasDescription;
    const describedBy = [props['aria-describedby'], descriptionId]
        .filter(Boolean)
        .join(' ');
    const accessibleDescription = describedBy || undefined;
    const rootClassName = [
        styles.root,
        styles[size],
        disabled ? styles.disabled : undefined,
        className,
    ]
        .filter(Boolean)
        .join(' ');

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        onChange?.(event);
        onCheckedChange?.(event.currentTarget.checked);
    }

    return (
        <label className={rootClassName} htmlFor={switchId}>
            <span className={styles.control}>
                <input
                    {...props}
                    aria-describedby={accessibleDescription}
                    disabled={disabled}
                    id={switchId}
                    onChange={handleChange}
                    ref={ref}
                    role='switch'
                    type='checkbox'
                />
                <span aria-hidden='true' className={styles.track}>
                    <span className={styles.thumb} />
                </span>
            </span>
            {hasCopy && (
                <span className={styles.copy}>
                    {hasVisibleLabel && (
                        <span className={styles.label}>{visibleLabel}</span>
                    )}
                    {hasDescription && (
                        <span className={styles.description} id={descriptionId}>
                            {description}
                        </span>
                    )}
                </span>
            )}
        </label>
    );
});
