import styles from '../../../styles/empty-state-common.module.css';
import type { StateProps } from '../../types';

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
