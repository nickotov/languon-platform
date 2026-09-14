import Link from 'next/link';
import type { ComponentProps, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './button.module.css';
export type ButtonVariant =
    'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
export type ControlSize = 'compact' | 'default' | 'large' | 'small' | 'medium';
export function Button({
    children,
    className,
    loading = false,
    size = 'default',
    variant = 'primary',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    loading?: boolean;
    size?: ControlSize;
    variant?: ButtonVariant;
}) {
    return (
        <button
            {...props}
            aria-busy={loading || undefined}
            className={[styles.button, styles[size], styles[variant], className]
                .filter(Boolean)
                .join(' ')}
            disabled={props.disabled || loading}
        >
            {children}
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
