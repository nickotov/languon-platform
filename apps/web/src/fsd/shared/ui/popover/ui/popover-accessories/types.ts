'use client';

import {
    type ButtonHTMLAttributes,
    type HTMLAttributes,
    type Ref,
    type SyntheticEvent,
} from 'react';

export type TriggerChildProps = {
    className?: string;
    onClick?: (event: SyntheticEvent) => void;
    ref?: Ref<HTMLElement>;
};

export type PopoverHeaderProps = HTMLAttributes<HTMLDivElement>;

export type PopoverItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    selected?: boolean;
};

export type PopoverSeparatorProps = HTMLAttributes<HTMLDivElement>;

export type PopoverCloseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
};
