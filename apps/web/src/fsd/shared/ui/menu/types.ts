import type { ReactNode } from 'react';
import type { TooltipProps } from '../tooltip/tooltip';

export type MenuItem = {
    separatorBefore?: boolean;
    headingBefore?: string;
    disabled?: boolean;
    checked?: boolean;
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
    menuClassName?: string | undefined;
    placement?: 'top-end' | 'bottom-end';
    variant?: 'default' | 'secondary';
    showChevron?: boolean;
    showTooltip?: boolean;
    tooltipPlacement?: TooltipProps['placement'];
};
