import type { HTMLAttributes } from 'react';
import styles from './text.module.css';
export function Text({
    className,
    ...props
}: HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p
            {...props}
            className={[styles.text, className].filter(Boolean).join(' ')}
        />
    );
}
