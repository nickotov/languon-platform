import type { HTMLAttributes } from 'react';
import styles from './card.module.css';
export function Card(props: HTMLAttributes<HTMLElement>) {
    return (
        <section
            {...props}
            className={[styles.card, props.className].filter(Boolean).join(' ')}
        />
    );
}
