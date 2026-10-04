'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import type { ControlSize } from '../button/button';
import { Tooltip } from '../tooltip/tooltip';
import styles from './icon-button.module.css';

export type IconButtonVariant =
    'danger' | 'ghost' | 'outline' | 'primary' | 'secondary';

export type TooltipPlacement = 'bottom' | 'left' | 'right' | 'top';

export type IconButtonSize = 'lg' | 'md' | 'sm';

export type IconButtonProps = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children'
> & {
    children?: ReactNode;
    icon?: ReactNode;
    label: string;
    loading?: boolean;
    rounded?: boolean;
    showTooltip?: boolean;
    size?: ControlSize | IconButtonSize;
    tooltipPlacement?: TooltipPlacement;
    variant?: IconButtonVariant;
};

const normalizeSize = (size: IconButtonProps['size']) => {
    if (size === 'compact' || size === 'small') {
        return 'sm';
    }

    if (size === 'large') {
        return 'lg';
    }

    return 'md';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        {
            children,
            className,
            disabled,
            icon,
            label,
            loading = false,
            onBlur,
            onFocus,
            onMouseEnter,
            onMouseLeave,
            rounded = false,
            showTooltip = true,
            size = 'md',
            tooltipPlacement = 'top',
            type = 'button',
            variant = 'secondary',
            ...props
        },
        ref,
    ) {
        const isDisabled = disabled || loading;

        const normalizedSize = normalizeSize(size);

        const ariaBusy = loading || undefined;

        const displayedIcon = icon ?? children;

        const buttonClassName = [
            styles.button,
            styles[normalizedSize],
            styles[String(size)],
            styles[variant],
            rounded ? styles.rounded : undefined,
            className,
        ]
            .filter(Boolean)
            .join(' ');

        const tooltipDisabled = !showTooltip || isDisabled;

        return (
            <Tooltip
                content={label}
                disabled={tooltipDisabled}
                placement={tooltipPlacement}
            >
                <button
                    {...props}
                    aria-busy={ariaBusy}
                    aria-label={label}
                    className={buttonClassName}
                    disabled={isDisabled}
                    onBlur={onBlur}
                    onFocus={onFocus}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    ref={ref}
                    type={type}
                >
                    {loading && (
                        <span aria-hidden='true' className={styles.spinner} />
                    )}
                    {!loading && (
                        <span aria-hidden='true' className={styles.icon}>
                            {displayedIcon}
                        </span>
                    )}
                </button>
            </Tooltip>
        );
    },
);
