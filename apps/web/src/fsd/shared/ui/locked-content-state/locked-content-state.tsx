import { LockIcon, SparklesIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './locked-content-state.module.css';
export type LockedContentStateVariant = 'overlay' | 'placeholder';
export interface LockedContentStateProps {
    title?: string;
    description?: string;
    eyebrow?: string;
    actionLabel?: string;
    onAction?: () => void;
    variant?: LockedContentStateVariant;
    children?: ReactNode;
    className?: string;
}
export function LockedContentState({
    title = 'Lesson locked',
    description = 'Finish the previous lesson to unlock this one.',
    eyebrow,
    actionLabel,
    onAction,
    variant = 'placeholder',
    children,
    className,
}: LockedContentStateProps) {
    const body = (
        <div className={styles.body}>
            <span className={styles.icon}>
                <LockIcon aria-hidden='true' />
            </span>
            {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
            <div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
            {actionLabel ? (
                <button type='button' onClick={onAction}>
                    <SparklesIcon aria-hidden='true' />
                    {actionLabel}
                </button>
            ) : null}
        </div>
    );
    return variant === 'overlay' ? (
        <section
            aria-label={title}
            className={[styles.root, styles.overlay, className]
                .filter(Boolean)
                .join(' ')}
        >
            <div aria-hidden='true' className={styles.preview}>
                {children}
            </div>
            <div className={styles.scrim}>{body}</div>
        </section>
    ) : (
        <section
            aria-label={title}
            className={[styles.root, styles.placeholder, className]
                .filter(Boolean)
                .join(' ')}
        >
            {body}
        </section>
    );
}
