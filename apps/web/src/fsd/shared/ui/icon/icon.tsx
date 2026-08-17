import type { ReactNode } from 'react';
import styles from './icon.module.css';
export function Icon({
    children,
    label,
}: {
    children: ReactNode;
    label?: string;
}) {
    return (
        <span
            aria-hidden={label ? undefined : true}
            aria-label={label}
            className={styles.icon}
            role={label ? 'img' : undefined}
        >
            {children}
        </span>
    );
}
