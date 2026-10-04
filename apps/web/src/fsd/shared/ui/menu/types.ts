import type { ReactNode } from 'react';

export type MenuItem = {
    disabled?: boolean;
    icon?: ReactNode;
    label: string;
    hint?: string;
    closeOnSelect?: boolean;
    onSelect(): void;
    tone?: 'danger';
};

export type MenuProps = {
    allowDisabledItems?: boolean;
    heading?: string;
    iconOnly?: boolean;
    items: MenuItem[];
    label: string;
    trigger: ReactNode;
    triggerClassName?: string | undefined;
    menuClassName?: string;
    placement?: 'top-end' | 'bottom-end';
    variant?: 'default' | 'secondary';
    showChevron?: boolean;
};
