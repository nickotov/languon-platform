'use client';

import { XIcon } from 'lucide-react';

import {
    createContext,
    type HTMLAttributes,
    type ReactNode,
    useContext,
    useLayoutEffect,
    useId,
    useRef,
} from 'react';

import styles from './dialog.module.css';

export type DialogSize =
    'large' | 'lg' | 'md' | 'medium' | 'sm' | 'small' | 'viewport';

export type DialogProps = {
    children?: ReactNode;
    className?: string | undefined;
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

const normalizeSize = (size: DialogSize) => {
    if (size === 'small') {
        return 'sm';
    }

    if (size === 'large') {
        return 'lg';
    }

    if (size === 'medium') {
        return 'md';
    }

    return size;
};

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
    const closingNative = useRef(false);

    const titleId = useId();

    const descriptionId = useId();

    const canDismissWithEscape = dismissible && dismissOnEscape;

    useLayoutEffect(() => {
        const dialog = ref.current;

        if (!dialog) return;
        closingNative.current = false;
        const opener = document.activeElement;

        if (open && !dialog.open) dialog.showModal();

        if (!open && dialog.open) dialog.close();
        // Close while the native node is still connected so the browser can
        // restore its opener before React removes the controlled dialog.
        return () => {
            closingNative.current = true;
            if (dialog.open) dialog.close();
            // React can detach the focused dialog child before native close.
            // Restore the captured opener after that commit, unless reopened.
            queueMicrotask(() => {
                if (
                    !ref.current?.open &&
                    opener instanceof HTMLElement &&
                    opener.isConnected
                )
                    opener.focus();
            });
        };
    }, [open]);

    if (!open) return null;

    return (
        <DialogContext.Provider value={{ onClose }}>
            <dialog
                aria-describedby={description ? descriptionId : undefined}
                aria-labelledby={title && showHeader ? titleId : undefined}
                aria-label={
                    title && !showHeader
                        ? title
                        : !title
                          ? closeLabel
                          : undefined
                }
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
                onClose={(event) => {
                    // Native close events are queued. Ignore cleanup events
                    // arriving after Strict Mode reopened or replaced the node.
                    if (
                        event.currentTarget.isConnected &&
                        !event.currentTarget.open &&
                        open &&
                        dismissible &&
                        !closingNative.current
                    )
                        onClose();
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
                                <XIcon size={20} aria-hidden />
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
