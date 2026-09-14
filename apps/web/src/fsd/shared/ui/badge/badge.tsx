import type { HTMLAttributes, ReactNode } from 'react';

import styles from './badge.module.css';

export type BadgeTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';
export type BadgeSize = 'md' | 'sm';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
    children: ReactNode;
    icon?: ReactNode;
    size?: BadgeSize;
    tone?: BadgeTone;
    withDot?: boolean;
};

export function Badge({
    children,
    className,
    icon,
    size = 'md',
    tone = 'neutral',
    withDot = false,
    ...props
}: BadgeProps) {
    return (
        <span
            {...props}
            className={[styles.badge, styles[tone], styles[size], className]
                .filter(Boolean)
                .join(' ')}
        >
            {withDot ? (
                <span aria-hidden='true' className={styles.dot} />
            ) : icon ? (
                <span aria-hidden='true' className={styles.icon}>
                    {icon}
                </span>
            ) : null}
            {children}
        </span>
    );
}

export function Chip({ children }: { children: ReactNode }) {
    return <span className={styles.chip}>{children}</span>;
}

/** @deprecated Import the standalone Divider primitive instead. */
export function Divider() {
    return <hr className={styles.divider} />;
}
