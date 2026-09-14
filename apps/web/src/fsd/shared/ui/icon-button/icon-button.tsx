'use client';

import {
    forwardRef,
    type ButtonHTMLAttributes,
    type ReactNode,
    useId,
    useState,
} from 'react';

import type { ControlSize } from '../button/button';
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

const normalizeSize = (size: IconButtonProps['size']) =>
    size === 'compact' || size === 'small'
        ? 'sm'
        : size === 'large'
          ? 'lg'
          : 'md';

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
        const [tooltipOpen, setTooltipOpen] = useState(false);
        const tooltipId = useId();
        const isDisabled = disabled || loading;
        const tooltipVisible = showTooltip && tooltipOpen && !isDisabled;
        const normalizedSize = normalizeSize(size);
        return (
            <span className={styles.root}>
                <button
                    {...props}
                    aria-busy={loading || undefined}
                    aria-describedby={tooltipVisible ? tooltipId : undefined}
                    aria-label={label}
                    className={[
                        styles.button,
                        styles[normalizedSize],
                        styles[String(size)],
                        styles[variant],
                        rounded ? styles.rounded : undefined,
                        className,
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    disabled={isDisabled}
                    onBlur={(event) => {
                        setTooltipOpen(false);
                        onBlur?.(event);
                    }}
                    onFocus={(event) => {
                        setTooltipOpen(true);
                        onFocus?.(event);
                    }}
                    onMouseEnter={(event) => {
                        setTooltipOpen(true);
                        onMouseEnter?.(event);
                    }}
                    onMouseLeave={(event) => {
                        setTooltipOpen(false);
                        onMouseLeave?.(event);
                    }}
                    ref={ref}
                    type={type}
                >
                    {loading ? (
                        <span aria-hidden='true' className={styles.spinner} />
                    ) : (
                        <span aria-hidden='true' className={styles.icon}>
                            {icon ?? children}
                        </span>
                    )}
                </button>
                {tooltipVisible ? (
                    <span
                        className={[
                            styles.tooltip,
                            styles[`tooltip-${tooltipPlacement}`],
                        ].join(' ')}
                        id={tooltipId}
                        role='tooltip'
                    >
                        {label}
                    </span>
                ) : null}
            </span>
        );
    },
);
