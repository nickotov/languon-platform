'use client';

import { useContext } from 'react';
import styles from '../../../styles/radio-group-common.module.css';
import type { RadioProps } from '../../types';
import { RadioContext } from '../../model/radio-context';

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
                className={styles.input}
                {...props}
                checked={controlledChecked}
                defaultChecked={
                    controlledChecked === undefined ? defaultChecked : undefined
                }
                disabled={isDisabled}
                name={group?.name ?? name}
                onChange={() => {
                    group?.onChange?.(value);

                    if (!group) {
                        onChange?.(value);
                    }
                }}
                type='radio'
                value={value}
            />
            <span aria-hidden='true' className={styles.dot}>
                <span className={styles.dotFill} />
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
