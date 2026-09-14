import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import styles from './inline-alert.module.css';

export type InlineAlertTone =
    'danger' | 'error' | 'info' | 'success' | 'tip' | 'warning';
export type InlineAlertProps = HTMLAttributes<HTMLDivElement> & {
    actions?: ReactNode;
    dismissLabel?: string;
    hideIcon?: boolean;
    icon?: ReactNode;
    onDismiss?: () => void;
    title?: string;
    tone?: InlineAlertTone;
};

const markers: Record<InlineAlertTone, string> = {
    danger: '×',
    error: '×',
    info: 'i',
    success: '✓',
    tip: '◆',
    warning: '!',
};

export const InlineAlert = forwardRef<HTMLDivElement, InlineAlertProps>(
    function InlineAlert(
        {
            actions,
            children,
            className,
            dismissLabel = 'Dismiss alert',
            hideIcon = false,
            icon,
            onDismiss,
            title,
            tone = 'info',
            ...props
        },
        ref,
    ) {
        const visualTone = tone === 'danger' ? 'error' : tone;
        const urgent = visualTone === 'error';
        return (
            <div
                {...props}
                aria-live={urgent ? 'assertive' : 'polite'}
                className={[styles.alert, styles[visualTone], className]
                    .filter(Boolean)
                    .join(' ')}
                ref={ref}
                role={urgent ? 'alert' : 'status'}
                tabIndex={urgent ? -1 : props.tabIndex}
            >
                {!hideIcon ? (
                    <span aria-hidden='true' className={styles.icon}>
                        {icon ?? markers[tone]}
                    </span>
                ) : null}
                <div className={styles.content}>
                    {title ? <p className={styles.title}>{title}</p> : null}
                    {children ? (
                        <div className={styles.body}>{children}</div>
                    ) : null}
                    {actions ? (
                        <div className={styles.actions}>{actions}</div>
                    ) : null}
                </div>
                {onDismiss ? (
                    <button
                        aria-label={dismissLabel}
                        className={styles.dismiss}
                        onClick={onDismiss}
                        type='button'
                    >
                        ×
                    </button>
                ) : null}
            </div>
        );
    },
);
