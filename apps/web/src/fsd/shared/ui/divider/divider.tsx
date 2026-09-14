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
            <span aria-hidden='true' />
            <small>{children}</small>
            <span aria-hidden='true' />
        </div>
    );
}
