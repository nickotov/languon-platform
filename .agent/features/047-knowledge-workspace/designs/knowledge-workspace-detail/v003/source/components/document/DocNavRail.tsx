import React from 'react';
import { BookOpenTextIcon, HomeIcon, RotateCwIcon, StickyNoteIcon } from 'lucide-react';
import { Logo } from '../Logo';

const items = [
  { label: 'Home', icon: HomeIcon },
  { label: 'Texts', icon: BookOpenTextIcon },
  { label: 'Knowledge', icon: StickyNoteIcon, active: true },
  { label: 'Review', icon: RotateCwIcon },
];

/** Schematic app navigation rail (the real shell lives outside this workspace). */
export function DocNavRail() {
  return (
    <nav aria-label="App" className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border-default bg-background-surface py-3">
      <div className="mb-3">
        <Logo variant="monogram" size="sm" />
      </div>
      {items.map((it) => (
        <a
          key={it.label}
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label={it.label}
          aria-current={it.active ? 'page' : undefined}
          title={it.label}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
            it.active ? 'bg-primary-subtle text-primary-default' : 'text-text-tertiary hover:bg-background-subtle hover:text-text-primary'
          }`}
        >
          <it.icon className="h-5 w-5" aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}

