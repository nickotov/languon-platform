'use client';

import { type InputHTMLAttributes, type ReactNode } from 'react';

export type RadioSize = 'md' | 'sm';

export type RadioVariant = 'card' | 'default';

export type Context = {
    disabled: boolean;
    invalid: boolean;
    name: string;
    onChange: ((value: string) => void) | undefined;
    size: RadioSize;
    value: string | undefined;
    variant: RadioVariant;
};

export type RadioOption = {
    disabled?: boolean;
    label: ReactNode;
    value: string;
};

export type RadioGroupProps = {
    children?: ReactNode;
    className?: string;
    defaultValue?: string;
    description?: string;
    disabled?: boolean;
    error?: string;
    label?: string;
    legend?: string;
    name?: string;
    onChange?: (value: string) => void;
    options?: RadioOption[];
    orientation?: 'horizontal' | 'vertical';
    size?: RadioSize;
    value?: string;
    variant?: RadioVariant;
};

export type RadioProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'size' | 'type'
> & {
    addon?: ReactNode;
    children: ReactNode;
    description?: ReactNode;
    onChange?: (value: string) => void;
    size?: RadioSize;
    value: string;
    variant?: RadioVariant;
};
