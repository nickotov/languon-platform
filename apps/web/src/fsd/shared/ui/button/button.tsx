import Link from 'next/link';
import type { ComponentProps, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './button.module.css';
export type ButtonVariant =
    'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
export type ControlSize = 'compact' | 'default' | 'large' | 'small' | 'medium';
export function Button({
    children,
    className,
    fullWidth = false,
    leadingIcon,
    loading = false,
    size = 'default',
    trailingIcon,
    variant = 'primary',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    fullWidth?: boolean;
    leadingIcon?: ReactNode;
    loading?: boolean;
    size?: ControlSize;
    trailingIcon?: ReactNode;
    variant?: ButtonVariant;
}) {
    return (
        <button
            {...props}
            aria-busy={loading || undefined}
            className={[
                styles.button,
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
            {children}
            {!loading ? trailingIcon : null}
        </button>
    );
}

export function ButtonLink({
    className,
    size = 'default',
    variant = 'primary',
    ...props
}: ComponentProps<typeof Link> & {
    size?: ControlSize;
    variant?: ButtonVariant;
}) {
    return (
        <Link
            {...props}
            className={[styles.button, styles[size], styles[variant], className]
                .filter(Boolean)
                .join(' ')}
        />
    );
}
