'use client';

import { type HTMLAttributes, type ReactNode } from 'react';

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

export type DialogActionsProps = HTMLAttributes<HTMLDivElement> & {
    align?: 'between' | 'end' | 'start';
};
