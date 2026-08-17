import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './switch.module.css';
export function Switch({
    children,
    ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    children: ReactNode;
}) {
    return (
        <label className={styles.switch}>
            <input {...props} role='switch' type='checkbox' />
            <span className={styles.track} aria-hidden='true' />
            <span>{children}</span>
        </label>
    );
}
