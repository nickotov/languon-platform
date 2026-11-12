import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from '../tooltip/tooltip';
import styles from '../styles/button-common.module.css';
import type { ControlSize, ButtonVariant } from './types';

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

    return responsive ? (
        <Tooltip content={tooltip} desktopOnly>
            {button}
        </Tooltip>
    ) : (
        button
    );
}
