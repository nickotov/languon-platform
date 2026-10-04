'use client';

import {
    createContext,
    type HTMLAttributes,
    type ReactNode,
    useContext,
    useEffect,
    useId,
    useRef,
} from 'react';

import styles from './dialog.module.css';

export type DialogSize = 'large' | 'lg' | 'md' | 'medium' | 'sm' | 'small';
export type DialogProps = {
    children?: ReactNode;
    className?: string;
    bodyClassName?: string | undefined;
    headerClassName?: string | undefined;
    titleClassName?: string | undefined;
    footerClassName?: string | undefined;
    closeLabel?: string;
    description?: ReactNode;
    dismissible?: boolean;
    dismissOnEscape?: boolean;
    dismissOnOverlayClick?: boolean;
    footer?: ReactNode;
    onClose(): void;
    open: boolean;
    role?: 'alertdialog' | 'dialog';
    showCloseButton?: boolean;
    showHeader?: boolean;
    size?: DialogSize;
    title?: string;
    variant?: 'dialog' | 'sheet';
};

const DialogContext = createContext<{ onClose(): void } | null>(null);
export function useDialog() {
    const context = useContext(DialogContext);
    if (!context) throw new Error('useDialog must be used within a Dialog');
    return context;
}
const normalizeSize = (size: DialogSize) =>
    size === 'small'
        ? 'sm'
        : size === 'large'
          ? 'lg'
          : size === 'medium'
            ? 'md'
            : size;

export function Dialog({
    children,
    className,
    bodyClassName,
    headerClassName,
    titleClassName,
    footerClassName,
    closeLabel = 'Close dialog',
    description,
    dismissible = true,
    dismissOnEscape = true,
    dismissOnOverlayClick = true,
    footer,
    onClose,
    open,
    role = 'dialog',
    showCloseButton = true,
    showHeader = true,
    size = 'md',
    title,
    variant = 'dialog',
}: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();
    const canDismissWithEscape = dismissible && dismissOnEscape;

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    if (!open) return null;

    return (
        <DialogContext.Provider value={{ onClose }}>
            <dialog
                aria-describedby={description ? descriptionId : undefined}
                aria-labelledby={title ? titleId : undefined}
                aria-label={!title ? closeLabel : undefined}
                className={[
                    styles.dialog,
                    styles[normalizeSize(size)],
                    styles[variant],
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                onCancel={(event) => {
                    event.preventDefault();
                    if (canDismissWithEscape) onClose();
                }}
                onClick={(event) => {
                    if (
                        dismissible &&
                        dismissOnOverlayClick &&
                        event.target === event.currentTarget
                    )
                        onClose();
                }}
                onClose={() => {
                    if (open && dismissible) onClose();
                }}
                ref={ref}
                role={role}
            >
                {showHeader && (title || description || showCloseButton) ? (
                    <header
                        className={[styles.header, headerClassName]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        <div className={styles.heading}>
                            {title ? (
                                <h2
                                    className={[styles.title, titleClassName]
                                        .filter(Boolean)
                                        .join(' ')}
                                    id={titleId}
                                >
                                    {title}
                                </h2>
                            ) : null}
                            {description ? (
                                <p
                                    className={styles.description}
                                    id={descriptionId}
                                >
                                    {description}
                                </p>
                            ) : null}
                        </div>
                        {showCloseButton ? (
                            <button
                                aria-label={closeLabel}
                                className={styles.close}
                                disabled={!dismissible}
                                onClick={() => onClose()}
                                type='button'
                            >
                                ×
                            </button>
                        ) : null}
                    </header>
                ) : null}
                {children ? (
                    <div
                        className={[styles.body, bodyClassName]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        {children}
                    </div>
                ) : (
                    <div className={styles.spacer} />
                )}
                {footer ? (
                    <footer
                        className={[styles.footer, footerClassName]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        {footer}
                    </footer>
                ) : null}
            </dialog>
        </DialogContext.Provider>
    );
}

export type DialogActionsProps = HTMLAttributes<HTMLDivElement> & {
    align?: 'between' | 'end' | 'start';
};

export function DialogActions({
    align = 'end',
    className,
    ...props
}: DialogActionsProps) {
    return (
        <div
            {...props}
            className={[styles.actions, styles[`actions-${align}`], className]
                .filter(Boolean)
                .join(' ')}
        />
    );
}

export function AlertDialog(props: Omit<DialogProps, 'role'>) {
    return <Dialog {...props} role='alertdialog' />;
}
export function BottomSheet(
    props: Omit<DialogProps, 'closeLabel' | 'variant'> & { closeLabel: string },
) {
    return <Dialog {...props} variant='sheet' />;
}
