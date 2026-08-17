import type { ReactNode } from 'react';
import styles from './loading-state.module.css';
export function LoadingState({ children }: { children: ReactNode }) {
    return (
        <div aria-busy='true' className={styles.state} role='status'>
            {children}
        </div>
    );
}
