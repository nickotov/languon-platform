import styles from '../styles/badge-common.module.css';
import type { BadgeProps } from './types';

export function Badge({
    children,
    className,
    icon,
    size = 'md',
    tone = 'neutral',
    withDot = false,
    ...props
}: BadgeProps) {
    function resolveBadgeContent() {
        if (withDot) {
            return <span aria-hidden='true' className={styles.dot} />;
        }

        if (icon) {
            return (
                <span aria-hidden='true' className={styles.icon}>
                    {icon}
                </span>
            );
        }

        return null;
    }

    const resolvedBadgeContent = resolveBadgeContent();

    return (
        <span
            {...props}
            className={[styles.badge, styles[tone], styles[size], className]
                .filter(Boolean)
                .join(' ')}
        >
            {resolvedBadgeContent}
            {children}
        </span>
    );
}
