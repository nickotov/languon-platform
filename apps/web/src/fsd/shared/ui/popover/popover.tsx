'use client';

import {
    type KeyboardEvent,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';

import styles from './popover.module.css';

export function Popover({
    children,
    label,
    trigger,
}: {
    children: ReactNode;
    label: string;
    trigger: ReactNode;
}) {
    const id = useId();
    const root = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        panelRef.current?.focus();
        function dismiss(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
    }

    return (
        <div
            className={styles.root}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setOpen(false);
                }
            }}
            ref={root}
        >
            <button
                aria-controls={id}
                aria-expanded={open}
                aria-haspopup='dialog'
                aria-label={label}
                className={styles.trigger}
                onClick={() => setOpen((current) => !current)}
                ref={triggerRef}
                type='button'
            >
                {trigger}
            </button>
            {open ? (
                <div
                    aria-label={label}
                    className={styles.content}
                    id={id}
                    onKeyDown={handleKeyDown}
                    ref={panelRef}
                    role='dialog'
                    tabIndex={-1}
                >
                    {children}
                </div>
            ) : null}
        </div>
    );
}
