import type { ReactNode } from 'react';
import styles from '../../../styles/badge-common.module.css';

export function Chip({ children }: { children: ReactNode }) {
    return <span className={styles.chip}>{children}</span>;
}
