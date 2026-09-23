import React from "react";
import { BoxIcon } from "lucide-react";
export type NavItemOrientation = 'vertical' | 'horizontal';
export interface NavItemProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  /** Visible text label for the item. */
  label: string;
  /** Optional leading icon component from lucide-react. */
  icon?: BoxIcon;
  /** Marks the item as the current page/section. */
  active?: boolean;
  /** Disables interaction and dims the item. */
  disabled?: boolean;
  /** Optional trailing badge content (count, status, etc.). */
  badge?: React.ReactNode;
  /** Layout context: sidebar (vertical) or topbar (horizontal). */
  orientation?: NavItemOrientation;
  /** Hides the label, leaving an icon-only item (sidebar rail). */
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
  className = '',
  href,
  onClick,
  ...rest
}: NavItemProps) {
  const isVertical = orientation === 'vertical';
  const base = 'group relative inline-flex items-center gap-3 rounded-md text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white';
  const layout = isVertical ? `w-full ${collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'}` : `px-3 py-2 ${collapsed ? 'justify-center' : ''}`;
  const state = disabled ? 'cursor-not-allowed text-slate-400' : active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900';
  const activeIndicator = active && !disabled ? isVertical ? 'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-slate-900' : 'after:absolute after:left-3 after:right-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-slate-900' : '';
  return <a href={disabled ? undefined : href} aria-current={active ? 'page' : undefined} aria-disabled={disabled || undefined} aria-label={collapsed ? label : undefined} title={collapsed ? label : undefined} tabIndex={disabled ? -1 : 0} onClick={event => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }} className={`${base} ${layout} ${state} ${activeIndicator} ${className}`.trim()} {...rest}>
      {Icon ? <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${disabled ? 'text-slate-300' : active ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-700'}`} /> : null}

      {!collapsed && <span className="truncate">{label}</span>}

      {!collapsed && badge != null ? <span className={`ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium ${disabled ? 'bg-slate-100 text-slate-400' : active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
          {badge}
        </span> : null}
    </a>;
}
