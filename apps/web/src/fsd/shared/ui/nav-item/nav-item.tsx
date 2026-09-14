import type { LucideIcon } from 'lucide-react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import styles from './nav-item.module.css';
export type NavItemOrientation = 'vertical' | 'horizontal';
export interface NavItemProps extends Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'children'
> {
    label: string;
    icon?: LucideIcon;
    active?: boolean;
    disabled?: boolean;
    badge?: ReactNode;
    orientation?: NavItemOrientation;
    collapsed?: boolean;
}
export function NavItem({
    label,
    icon: Icon,
    active = false,
    disabled = false,
    badge,
    orientation = 'vertical',
    collapsed = false,
    className,
    href,
    onClick,
    ...rest
}: NavItemProps) {
    return (
        <a
            {...rest}
            href={disabled ? undefined : href}
            aria-current={active ? 'page' : undefined}
            aria-disabled={disabled || undefined}
            aria-label={collapsed ? label : undefined}
            title={collapsed ? label : undefined}
            tabIndex={disabled ? -1 : 0}
            onClick={(event) => {
                if (disabled) {
                    event.preventDefault();
                    return;
                }
                onClick?.(event);
            }}
            className={[
                styles.root,
                styles[orientation],
                active ? styles.active : '',
                disabled ? styles.disabled : '',
                collapsed ? styles.collapsed : '',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {Icon ? <Icon aria-hidden='true' /> : null}
            {!collapsed ? <span className={styles.label}>{label}</span> : null}
            {!collapsed && badge != null ? (
                <span className={styles.badge}>{badge}</span>
            ) : null}
        </a>
    );
}
