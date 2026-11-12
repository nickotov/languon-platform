'use client';

import {
    type ButtonHTMLAttributes,
    type HTMLAttributes,
    type Ref,
    type SyntheticEvent,
} from 'react';
import type { VirtualElement } from '@floating-ui/react';

export type TriggerChildProps = {
    'aria-controls'?: string;
    'aria-expanded'?: boolean;
    'aria-haspopup'?: 'dialog';
    className?: string;
    onClick?: (event: SyntheticEvent) => void;
    ref?: Ref<HTMLElement>;
};

export type PopoverTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
};

export type PopoverAnchorProps = HTMLAttributes<HTMLElement> & {
    asChild?: boolean;
    virtualRef?: VirtualElement | undefined;
};
