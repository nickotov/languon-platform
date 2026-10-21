import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SettingsIcon } from 'lucide-react';
import { Logo } from '../Logo';
import { NavItem } from '../NavItem';
import { NAV_ITEMS, isActive } from './navItems';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(href);
  };
  const onSettings = location.pathname.startsWith('/settings') || location.pathname.startsWith('/portrait');

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-default bg-background-surface transition-all duration-200 md:flex ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      aria-label="Main"
    >
      <div className={`flex h-16 items-center ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
        {collapsed ? <Logo variant="monogram" size="sm" href="/" /> : <Logo variant="lockup" size="sm" href="/" />}
      </div>
      <nav className="flex-1 px-2 py-2" aria-label="Sections">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavItem
                label={item.label}
                icon={item.icon}
                href={item.href}
                active={isActive(location.pathname, item.href)}
                collapsed={collapsed}
                onClick={go(item.href)}
              />
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-1 border-t border-border-default px-2 py-3">
        <a
          href="/settings"
          onClick={go('/settings')}
          aria-current={onSettings ? 'page' : undefined}
          title={collapsed ? 'Account & settings' : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 text-sm outline-none transition-colors hover:bg-background-subtle focus-visible:ring-2 focus-visible:ring-border-focus ${
            onSettings ? 'bg-primary-subtle text-primary-default' : 'text-text-primary'
          } ${collapsed ? 'justify-center' : ''}`}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-default"
          >
            MC
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">Maya Chen</span>
              <span className="block truncate text-xs text-text-secondary">Account & settings</span>
            </span>
          )}
          {!collapsed && <SettingsIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" />}
          {collapsed && <span className="sr-only">Account & settings</span>}
        </a>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-text-secondary outline-none hover:bg-background-subtle focus-visible:ring-2 focus-visible:ring-border-focus ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? <PanelLeftOpenIcon className="h-5 w-5" aria-hidden="true" /> : <PanelLeftCloseIcon className="h-5 w-5" aria-hidden="true" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

