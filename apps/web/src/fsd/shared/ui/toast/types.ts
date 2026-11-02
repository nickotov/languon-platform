import type { ReactNode } from 'react';

export type ToastId = number;

export type ToastTone = 'danger' | 'info' | 'success' | 'warning';

export type ToastVariant = 'error' | 'info' | 'loading' | 'success' | 'warning';

export type ToastPosition =
    'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export type ToastAction = { label: string; onClick(): void };

export type ToastInput = {
    action?: ReactNode;
    content: ReactNode;
    dismissLabel: string;
    duration?: number | null;
    tone?: ToastTone;
};

export type ToastProps = {
    action?: ReactNode | ToastAction;
    anchored?: boolean;
    children?: ReactNode;
    className?: string;
    description?: string;
    dismissible?: boolean;
    dismissLabel?: string;
    duration?: number | null;
    onDismiss?(): void;
    open?: boolean;
    position?: ToastPosition;
    title?: string;
    tone?: ToastTone;
    variant?: ToastVariant;
};
