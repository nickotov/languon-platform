'use client';

import { useCallback } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { Toast } from './ui/toast-view/toast-view';
import type { ToastInput, ToastId } from './types';
import styles from '../styles/toast-common.module.css';

export { Toast } from './ui/toast-view/toast-view';
export type {
    ToastId,
    ToastTone,
    ToastVariant,
    ToastPosition,
    ToastInput,
    ToastProps,
} from './types';

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
