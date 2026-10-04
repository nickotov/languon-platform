import type { ReactNode } from 'react';

import styles from './divider.module.css';

export function Divider({
    children,
    className,
}: {
    children?: ReactNode;
    className?: string;
}) {
    if (!children)
        return (
            <hr
                className={[styles.rule, className].filter(Boolean).join(' ')}
            />
        );
    return (
        <div
            aria-orientation='horizontal'
            className={[styles.labelled, className].filter(Boolean).join(' ')}
            role='separator'
        >
            <span className={styles.line} aria-hidden='true' />
            <small className={styles.label}>{children}</small>
            <span className={styles.line} aria-hidden='true' />
        </div>
    );
}
