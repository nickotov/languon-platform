import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import type { SourceInfo } from '../../types/tutor';
import { TutorMark } from '../tutor/TutorMark';

interface TopbarProps {
  source: SourceInfo;
  tutorOpen: boolean;
  onOpenTutor: () => void;
}

const section: Record<SourceInfo['kind'], string> = { text: 'Texts', dictionary: 'Dictionaries', note: 'Knowledge' };

export function Topbar({ source, tutorOpen, onOpenTutor }: TopbarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border-default bg-background-surface px-6">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          <li className="text-text-secondary">{section[source.kind]}</li>
          <li aria-hidden="true">
            <ChevronRightIcon className="h-3.5 w-3.5 text-text-tertiary" />
          </li>
          <li lang="fr" aria-current="page" className="truncate font-medium text-text-primary">
            {source.title}
          </li>
        </ol>
      </nav>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenTutor}
          aria-pressed={tutorOpen}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-default pl-1 pr-3 text-sm font-medium text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <TutorMark size="sm" />
          Tutor
        </button>
        <span aria-label="Claire Laurent" role="img" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background-subtle text-xs font-semibold text-text-secondary">
          CL
        </span>
      </div>
    </header>
  );
}

