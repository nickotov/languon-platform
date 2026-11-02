import React from 'react';
import { BookAIcon, BookOpenTextIcon, StickyNoteIcon } from 'lucide-react';
import { Logo } from '../Logo';
import { DICT_SOURCE_ID, SEED_NOTE_ID, TEXT_SOURCE_ID, noteSourceId } from '../../data/sources';

interface MobileTopbarProps {
  page: string;
  onNavigate: (sourceId: string) => void;
}

export function MobileTopbar({ page, onNavigate }: MobileTopbarProps) {
  const items = [
    { id: TEXT_SOURCE_ID, label: 'Text', icon: BookOpenTextIcon },
    { id: DICT_SOURCE_ID, label: 'Dictionary', icon: BookAIcon },
    { id: noteSourceId(SEED_NOTE_ID), label: 'Knowledge', icon: StickyNoteIcon },
  ];
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-default bg-background-surface px-3">
      <Logo variant="monogram" size="sm" />
      <nav aria-label="Pages">
        <ul className="flex items-center gap-0.5">
          {items.map((item) => {
            const active = item.id === page || (item.id.startsWith('note:') && page.startsWith('note:'));
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                    active ? 'bg-primary-subtle text-primary-default' : 'text-text-secondary hover:bg-background-subtle'
                  }`}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

