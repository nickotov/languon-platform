'use client';

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import styles from './toast.module.css';

export type ToastInput = {
    action?: ReactNode;
    content: ReactNode;
    dismissLabel: string;
    duration?: number | null;
};

type QueuedToast = ToastInput & { id: number };
type ToastContextValue = {
    dismissToast(id: number): void;
    showToast(toast: ToastInput): number;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({
    children,
    label,
    limit = 3,
}: {
    children: ReactNode;
    label: string;
    limit?: number;
}) {
    const nextId = useRef(0);
    const [queue, setQueue] = useState<QueuedToast[]>([]);
    const dismissToast = useCallback((id: number) => {
        setQueue((current) => current.filter((toast) => toast.id !== id));
    }, []);
    const showToast = useCallback((toast: ToastInput) => {
        nextId.current += 1;
        const id = nextId.current;
        setQueue((current) => [...current, { ...toast, id }]);
        return id;
    }, []);
    const value = useMemo(
        () => ({ dismissToast, showToast }),
        [dismissToast, showToast],
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastRegion label={label}>
                {queue.slice(0, Math.max(1, limit)).map((toast) => (
                    <Toast
                        action={toast.action}
                        dismissLabel={toast.dismissLabel}
                        key={toast.id}
                        onDismiss={() => dismissToast(toast.id)}
                        {...(toast.duration !== undefined
                            ? { duration: toast.duration }
                            : {})}
                    >
                        {toast.content}
                    </Toast>
                ))}
            </ToastRegion>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const value = useContext(ToastContext);
    if (!value) throw new Error('useToast must be used within ToastProvider');
    return value;
}

export function ToastRegion({
    children,
    label,
}: {
    children: ReactNode;
    label: string;
}) {
    return (
        <section
            aria-atomic='false'
            aria-label={label}
            aria-live='polite'
            className={styles.region}
            role='status'
        >
            {children}
        </section>
    );
}

export function Toast({
    action,
    children,
    dismissLabel,
    duration,
    onDismiss,
}: {
    action?: ReactNode;
    children: ReactNode;
    dismissLabel?: string;
    duration?: number | null;
    onDismiss?(): void;
}) {
    const [paused, setPaused] = useState(false);
    const effectiveDuration =
        duration === undefined ? (action ? null : 6_000) : duration;

    useEffect(() => {
        if (!onDismiss || effectiveDuration === null || paused) return;
        const timer = setTimeout(onDismiss, Math.max(6_000, effectiveDuration));
        return () => clearTimeout(timer);
    }, [effectiveDuration, onDismiss, paused]);

    return (
        <div
            className={styles.toast}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    setPaused(false);
            }}
            onFocusCapture={() => setPaused(true)}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <span>{children}</span>
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
