import React from 'react';
import { BookAIcon, BookOpenTextIcon, HomeIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, RotateCwIcon, StickyNoteIcon } from 'lucide-react';
import { Logo } from '../Logo';
import { NavItem } from '../NavItem';
import { DICT_SOURCE_ID, SEED_NOTE_ID, TEXT_SOURCE_ID, noteSourceId } from '../../data/sources';

interface SidebarProps {
  collapsed: boolean;
  page: string;
  onNavigate: (sourceId: string) => void;
  onToggle: () => void;
}

export function Sidebar({ collapsed, page, onNavigate, onToggle }: SidebarProps) {
  const items = [
    { label: 'Home', icon: HomeIcon, target: null as string | null },
    { label: 'Texts', icon: BookOpenTextIcon, target: TEXT_SOURCE_ID },
    { label: 'Dictionaries', icon: BookAIcon, target: DICT_SOURCE_ID },
    { label: 'Knowledge', icon: StickyNoteIcon, target: noteSourceId(SEED_NOTE_ID) },
    { label: 'Review', icon: RotateCwIcon, target: null as string | null },
  ];
  const isActive = (target: string | null) =>
    target !== null && (target === page || (target.startsWith('note:') && page.startsWith('note:')));

  return (
    <aside
      style={{ width: collapsed ? 72 : 'var(--size-nav-sidebar-width)' }}
      className="flex h-full shrink-0 flex-col border-r border-border-default bg-background-surface transition-all duration-200"
      aria-label="Main"
    >
      <div className={`flex h-16 items-center ${collapsed ? 'justify-center' : 'px-5'}`}>
        <Logo variant={collapsed ? 'monogram' : 'lockup'} size="sm" />
      </div>
      <nav className="flex-1 px-3 py-2">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.label}>
              <NavItem
                label={item.label}
                icon={item.icon}
                collapsed={collapsed}
                active={isActive(item.target)}
                disabled={item.target === null}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (item.target) onNavigate(item.target);
                }}
              />
            </li>
          ))}
        </ul>
      </nav>
      <div className={`border-t border-border-default p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {collapsed ? <PanelLeftOpenIcon className="h-4 w-4" aria-hidden="true" /> : <PanelLeftCloseIcon className="h-4 w-4" aria-hidden="true" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}

