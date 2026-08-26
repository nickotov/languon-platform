'use client';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './dialog.module.css';

export type DialogProps = {
    children: ReactNode;
    closeLabel?: string;
    description?: ReactNode;
    dismissible?: boolean;
    onClose(): void;
    open: boolean;
    role?: 'alertdialog' | 'dialog';
    size?: 'small' | 'medium' | 'large';
    title: string;
    variant?: 'dialog' | 'sheet';
};

export function Dialog({
    children,
    closeLabel,
    description,
    dismissible = true,
    onClose,
    open,
    role = 'dialog',
    size = 'medium',
    title,
    variant = 'dialog',
}: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            aria-describedby={description ? descriptionId : undefined}
            aria-labelledby={titleId}
            className={[styles.dialog, styles[size], styles[variant]].join(' ')}
            onCancel={(event) => {
                if (!dismissible) event.preventDefault();
            }}
            onClose={() => {
                if (dismissible) onClose();
            }}
            ref={ref}
            role={role}
        >
            <header className={styles.header}>
                <h2 id={titleId}>{title}</h2>
                {closeLabel ? (
                    <button
                        aria-label={closeLabel}
                        className={styles.close}
                        disabled={!dismissible}
                        onClick={() => ref.current?.close()}
                        type='button'
                    >
                        ×
                    </button>
                ) : null}
            </header>
            {description ? <p id={descriptionId}>{description}</p> : null}
            {children}
        </dialog>
    );
}

export function AlertDialog(props: Omit<DialogProps, 'role'>) {
    return <Dialog {...props} role='alertdialog' />;
}

export function BottomSheet(
    props: Omit<DialogProps, 'closeLabel' | 'variant'> & {
        closeLabel: string;
    },
) {
    return <Dialog {...props} variant='sheet' />;
}
