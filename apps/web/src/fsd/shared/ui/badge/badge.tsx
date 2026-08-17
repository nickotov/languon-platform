import type { ReactNode } from 'react';
import styles from './badge.module.css';
export function Badge({
    children,
    tone = 'info',
}: {
    children: ReactNode;
    tone?: 'danger' | 'info' | 'success' | 'warning';
}) {
    return (
        <span className={[styles.badge, styles[tone]].join(' ')}>
            {children}
        </span>
    );
}
export function Chip({ children }: { children: ReactNode }) {
    return <span className={styles.chip}>{children}</span>;
}
export function Divider() {
    return <hr className={styles.divider} />;
}
