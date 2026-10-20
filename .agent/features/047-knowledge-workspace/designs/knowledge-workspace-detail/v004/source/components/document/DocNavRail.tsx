import React from 'react';
import { BookOpenTextIcon, HomeIcon, RotateCwIcon, StickyNoteIcon } from 'lucide-react';
import { Logo } from '../Logo';
import { Tooltip } from '../Tooltip';
import { ru } from '../../data/strings';

const items = [
  { label: ru.nav.home, icon: HomeIcon },
  { label: ru.nav.texts, icon: BookOpenTextIcon },
  { label: ru.nav.knowledge, icon: StickyNoteIcon, active: true },
  { label: ru.nav.review, icon: RotateCwIcon },
];

/** Schematic app navigation rail (the real shell lives outside this workspace). */
export function DocNavRail() {
  return (
    <nav aria-label={ru.nav.label} className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border-default bg-background-surface py-3">
      <div className="mb-3">
        <Logo variant="monogram" size="sm" />
      </div>
      {items.map((it) => (
        <Tooltip key={it.label} content={it.label} placement="right">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            aria-label={it.label}
            aria-current={it.active ? 'page' : undefined}
            className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
              it.active ? 'bg-primary-subtle text-primary-default' : 'text-text-tertiary hover:bg-background-subtle hover:text-text-primary'
            }`}
          >
            {it.active && <span aria-hidden="true" className="absolute -left-3 bottom-2 top-2 w-0.5 rounded-full bg-primary-default" />}
            <it.icon className="h-5 w-5" aria-hidden="true" />
          </a>
        </Tooltip>
      ))}
    </nav>
  );
}

