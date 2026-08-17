import type { SelectHTMLAttributes } from 'react';
import styles from './select.module.css';
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[styles.select, props.className]
                .filter(Boolean)
                .join(' ')}
        />
    );
}
