import type { ReactNode } from 'react';

export type MenuItem = {
    disabled?: boolean;
    icon?: ReactNode;
    label: string;
    onSelect(): void;
    tone?: 'danger';
};

export type MenuProps = {
    iconOnly?: boolean;
    items: MenuItem[];
    label: string;
    trigger: ReactNode;
};
