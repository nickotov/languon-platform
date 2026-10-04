'use client';

import {
    isValidElement,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
} from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import styles from './toast.module.css';

export type ToastId = number;

export type ToastTone = 'danger' | 'info' | 'success' | 'warning';

export type ToastVariant = 'error' | 'info' | 'loading' | 'success' | 'warning';

export type ToastPosition =
    'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

type ToastAction = { label: string; onClick(): void };

function isToastAction(
    action: ReactNode | ToastAction | undefined,
): action is ToastAction {
    return Boolean(
        action &&
        !isValidElement(action) &&
        typeof action === 'object' &&
        'label' in action &&
        'onClick' in action,
    );
}

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

type QueuedToast = ToastInput & { id: ToastId };

type ToastState = {
    clear(): void;
    dismiss(id: ToastId): void;
    queue: QueuedToast[];
    show(toast: ToastInput): ToastId;
};

let nextToastId = 0;

const toastStore = createStore<ToastState>((set) => ({
    clear: () => set({ queue: [] }),
    dismiss: (id) =>
        set((state) => ({
            queue: state.queue.filter((toast) => toast.id !== id),
        })),
    queue: [],
    show: (toast) => {
        nextToastId += 1;

        const id = nextToastId;

        set((state) => ({ queue: [...state.queue, { ...toast, id }] }));

        return id;
    },
}));

export function showToast(toast: ToastInput): ToastId {
    return toastStore.getState().show(toast);
}

export function dismissToast(id: ToastId) {
    toastStore.getState().dismiss(id);
}

export function clearToasts() {
    toastStore.getState().clear();
}

export function ToastHost({
    label,
    limit = 3,
}: {
    label: string;
    limit?: number;
}) {
    const queue = useStore(toastStore, (state) => state.queue);

    return (
        <section
            aria-atomic='false'
            aria-label={label}
            aria-live='polite'
            className={styles.region}
            role='status'
        >
            {queue.slice(0, Math.min(3, Math.max(1, limit))).map((toast) => (
                <HostedToast key={toast.id} toast={toast} />
            ))}
        </section>
    );
}

function HostedToast({ toast }: { toast: QueuedToast }) {
    const handleDismiss = useCallback(() => dismissToast(toast.id), [toast.id]);

    return (
        <Toast
            action={toast.action}
            dismissLabel={toast.dismissLabel}
            hosted
            onDismiss={handleDismiss}
            {...(toast.duration !== undefined
                ? { duration: toast.duration }
                : {})}
            {...(toast.tone !== undefined ? { tone: toast.tone } : {})}
        >
            {toast.content}
        </Toast>
    );
}

export function Toast({
    action,
    anchored = false,
    children,
    className,
    description,
    dismissible = true,
    dismissLabel,
    duration,
    onDismiss,
    open,
    position = 'bottom-right',
    title,
    tone = 'info',
    variant,
    hosted = false,
}: ToastProps & { hosted?: boolean }) {
    const controlled = open !== undefined;

    const [internalOpen, setInternalOpen] = useState(true);

    const visible = controlled ? open : internalOpen;

    const visualTone = variant === 'error' ? 'danger' : (variant ?? tone);

    const [paused, setPaused] = useState(false);

    function resolveEffectiveDuration() {
        if (action) {
            return null;
        }

        if (duration === undefined) {
            return 5_000 as const;
        }

        return duration;
    }

    const effectiveDuration = resolveEffectiveDuration();

    const close = useCallback(() => {
        if (!controlled) setInternalOpen(false);

        onDismiss?.();
    }, [controlled, onDismiss]);

    useEffect(() => {
        if (
            !visible ||
            !effectiveDuration ||
            visualTone === 'loading' ||
            paused
        )
            return;

        const timer = setTimeout(close, effectiveDuration);

        return () => clearTimeout(timer);
    }, [close, effectiveDuration, paused, visible, visualTone]);

    if (!visible) return null;

    const actionConfig = isToastAction(action) ? action : null;

    const actionNode = actionConfig ? null : (action as ReactNode);

    function resolveAriaLive() {
        if (hosted) {
            return undefined;
        }

        if (visualTone === 'danger') {
            return 'assertive' as const;
        }

        return 'polite' as const;
    }

    function resolveRole() {
        if (hosted) {
            return undefined;
        }

        if (visualTone === 'danger') {
            return 'alert' as const;
        }

        return 'status' as const;
    }

    function resolveToneSymbol() {
        if (visualTone === 'success') {
            return '✓' as const;
        }

        if (visualTone === 'warning') {
            return '!' as const;
        }

        if (visualTone === 'danger') {
            return '×' as const;
        }

        if (visualTone === 'loading') {
            return '·' as const;
        }

        return 'i' as const;
    }

    function renderDescription() {
        if (description) {
            return <span className={styles.description}>{description}</span>;
        }

        if (children) {
            return children;
        }

        return null;
    }

    function renderAction() {
        if (actionConfig) {
            return (
                <button
                    className={styles.actionButton}
                    onClick={() => {
                        actionConfig.onClick();

                        close();
                    }}
                    type='button'
                >
                    {actionConfig.label}
                </button>
            );
        }

        if (actionNode) {
            return <span className={styles.action}>{actionNode}</span>;
        }

        return null;
    }

    const resolvedAriaLive = resolveAriaLive();

    const resolvedRole = resolveRole();

    const resolvedToneSymbol = resolveToneSymbol();

    const resolvedDescription = renderDescription();

    const resolvedAction = renderAction();

    return (
        <div
            aria-live={resolvedAriaLive}
            className={[
                styles.toast,
                styles[visualTone],
                anchored ? styles.anchored : undefined,
                anchored ? styles[position] : undefined,
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            data-tone={visualTone}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setPaused(false);
                }
            }}
            onFocusCapture={() => {
                setPaused(true);
            }}
            onMouseEnter={() => {
                setPaused(true);
            }}
            onMouseLeave={() => {
                setPaused(false);
            }}
            role={resolvedRole}
        >
            <span aria-hidden='true' className={styles.icon}>
                {resolvedToneSymbol}
            </span>
            <span className={styles.content}>
                {title ? (
                    <strong className={styles.title}>{title}</strong>
                ) : null}
                {resolvedDescription}
                {resolvedAction}
            </span>
            {(onDismiss || !controlled) && dismissible ? (
                <button
                    aria-label={dismissLabel ?? 'Dismiss notification'}
                    className={styles.dismiss}
                    onClick={close}
                    type='button'
                >
                    ×
                </button>
            ) : null}
        </div>
    );
}
