'use client';

import { useId, type ReactNode } from 'react';
import styles from './command-menu-item.module.css';

export function CommandMenuItem({
    icon,
    label,
    description,
    trailing,
    onSelect,
    disabled = false,
    selected = false,
    commandKey,
    id,
}: {
    icon?: ReactNode;
    label: string;
    description?: string | undefined;
    trailing?: ReactNode;
    onSelect(): void;
    disabled?: boolean | undefined;
    selected?: boolean | undefined;
    commandKey?: string | undefined;
    id?: string | undefined;
}) {
    const descriptionId = useId();

    return (
        <button
            id={id}
            type='button'
            className={styles.root}
            onClick={onSelect}
            disabled={disabled}
            aria-label={label}
            aria-describedby={description ? descriptionId : undefined}
            data-command-item
            data-command-key={commandKey}
            data-selected={selected || undefined}
        >
            {icon && (
                <span className={styles.icon} aria-hidden='true'>
                    {icon}
                </span>
            )}
            <span className={styles.content}>
                <span className={styles.label}>{label}</span>
                {description && (
                    <span id={descriptionId} className={styles.description}>
                        {description}
                    </span>
                )}
            </span>
            {trailing && (
                <span className={styles.trailing} aria-hidden='true'>
                    {trailing}
                </span>
            )}
        </button>
    );
}
