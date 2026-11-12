import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Tooltip } from '../../../tooltip/tooltip';
import styles from '../../../styles/button-common.module.css';
import type { ControlSize, ButtonVariant } from '../../types';

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

    return responsive ? (
        <Tooltip content={tooltip} desktopOnly>
            {link}
        </Tooltip>
    ) : (
        link
    );
}
