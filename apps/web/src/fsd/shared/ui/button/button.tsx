import Link from 'next/link';
import type { ComponentProps, ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from '../tooltip/tooltip';
import styles from './button.module.css';

export type ButtonVariant =
    'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';

export type ControlSize = 'compact' | 'default' | 'large' | 'small' | 'medium';

export function Button({
    children,
    className,
    fullWidth = false,
    desktopIconOnly = false,
    leadingIcon,
    loading = false,
    size = 'default',
    trailingIcon,
    variant = 'primary',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    fullWidth?: boolean;
    /** Keep the icon and accessible label on desktop; show the full label on mobile. */
    desktopIconOnly?: boolean;
    leadingIcon?: ReactNode;
    loading?: boolean;
    size?: ControlSize;
    trailingIcon?: ReactNode;
    variant?: ButtonVariant;
}) {
    const responsive = desktopIconOnly && Boolean(leadingIcon || trailingIcon);
    const tooltip = props['aria-label'] ?? children;
    const button = (
        <button
            {...props}
            aria-busy={loading || undefined}
            className={[
                styles.button,
                responsive ? styles.desktopIconOnly : undefined,
                styles[size],
                styles[variant],
                fullWidth ? styles.fullWidth : undefined,
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            disabled={props.disabled || loading}
        >
            {loading ? (
                <span aria-hidden='true' className={styles.spinner} />
            ) : (
                leadingIcon
            )}
            {responsive ? (
                <span className={styles.label}>{children}</span>
            ) : (
                children
            )}
            {!loading ? trailingIcon : null}
        </button>
    );

    return responsive ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
}

export function ButtonLink({
    children,
    className,
    desktopIconOnly = false,
    leadingIcon,
    size = 'default',
    variant = 'primary',
    ...props
}: ComponentProps<typeof Link> & {
    /** Keep the icon and accessible label on desktop; show the full label on mobile. */
    desktopIconOnly?: boolean;
    leadingIcon?: ReactNode;
    size?: ControlSize;
    variant?: ButtonVariant;
}) {
    const responsive = desktopIconOnly && Boolean(leadingIcon);
    const tooltip = props['aria-label'] ?? children;
    const link = (
        <Link
            {...props}
            className={[
                styles.button,
                styles[size],
                styles[variant],
                responsive ? styles.desktopIconOnly : undefined,
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {leadingIcon}
            {responsive ? (
                <span className={styles.label}>{children}</span>
            ) : (
                children
            )}
        </Link>
    );

    return responsive ? <Tooltip content={tooltip}>{link}</Tooltip> : link;
}
