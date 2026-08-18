'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import styles from './toast.module.css';

export type ToastId = number;
export type ToastTone = 'danger' | 'info' | 'success' | 'warning';
export type ToastInput = {
    action?: ReactNode;
    content: ReactNode;
    dismissLabel: string;
    duration?: number | null;
    tone?: ToastTone;
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
    children,
    dismissLabel,
    duration,
    onDismiss,
    tone = 'info',
}: {
    action?: ReactNode;
    children: ReactNode;
    dismissLabel?: string;
    duration?: number | null;
    onDismiss?(): void;
    tone?: ToastTone;
}) {
    const [paused, setPaused] = useState(false);
    const effectiveDuration = action ? null : (duration ?? 6_000);

    useEffect(() => {
        if (!onDismiss || effectiveDuration === null || paused) return;
        const timer = setTimeout(onDismiss, Math.max(6_000, effectiveDuration));
        return () => clearTimeout(timer);
    }, [effectiveDuration, onDismiss, paused]);

    return (
        <div
            className={[styles.toast, styles[tone]].join(' ')}
            data-tone={tone}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    setPaused(false);
            }}
            onFocusCapture={() => setPaused(true)}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <span className={styles.content}>{children}</span>
            {action ? <span className={styles.action}>{action}</span> : null}
            {onDismiss && dismissLabel ? (
                <button
                    aria-label={dismissLabel}
                    onClick={onDismiss}
                    type='button'
                >
                    ×
                </button>
            ) : null}
        </div>
    );
}
