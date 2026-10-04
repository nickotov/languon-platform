import type { ReactNode } from 'react';
import styles from './empty-state.module.css';

type StateProps = {
    action?: ReactNode;
    children?: ReactNode;
    title: string;
};

export function EmptyState({ action, children, title }: StateProps) {
    return (
        <section className={styles.state}>
            <h2 className={styles.title}>{title}</h2>
            {children ? <p className={styles.description}>{children}</p> : null}
            {action}
        </section>
    );
}

export function ErrorState({ action, children, title }: StateProps) {
    return (
        <section
            className={[styles.state, styles.error].join(' ')}
            role='alert'
        >
            <h2 className={styles.title}>{title}</h2>
            {children ? <p className={styles.description}>{children}</p> : null}
            {action}
        </section>
    );
}
