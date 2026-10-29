import React from 'react';
import { FileTextIcon } from 'lucide-react';
import { Button } from '../Button';
import { ru } from '../../data/strings';

interface KnowledgePlaceholderProps {
  title: string;
  deleted: boolean;
  onReopen: () => void;
}

/** Schematic Knowledge library, shown after leaving or deleting. */
export function KnowledgePlaceholder({ title, deleted, onReopen }: KnowledgePlaceholderProps) {
  return (
    <div className="flex h-full flex-col bg-background-canvas">
      <header className="flex h-12 items-center border-b border-border-default bg-background-surface px-6">
        <h1 className="text-base font-semibold text-text-primary">{ru.knowledge.title}</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl p-6">
        <p className="text-xs text-text-tertiary">{ru.knowledge.note}</p>
        <ul className="mt-4 space-y-2">
          {!deleted && (
            <li className="flex items-center gap-3 rounded-xl border border-border-default bg-background-surface p-3">
              <FileTextIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
              <span className="flex-1 truncate text-sm font-medium text-text-primary">{title || ru.common.untitled}</span>
              <Button size="compact" variant="secondary" onClick={onReopen}>
                {ru.knowledge.open}
              </Button>
            </li>
          )}
          {ru.knowledge.others.map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-xl border border-border-default bg-background-surface p-3 opacity-60">
              <FileTextIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
              <span className="flex-1 truncate text-sm text-text-primary">{t}</span>
            </li>
          ))}
        </ul>
        {deleted && (
          <Button className="mt-4" size="compact" variant="ghost" onClick={onReopen}>
            {ru.knowledge.restart}
          </Button>
        )}
      </div>
    </div>
  );
}

