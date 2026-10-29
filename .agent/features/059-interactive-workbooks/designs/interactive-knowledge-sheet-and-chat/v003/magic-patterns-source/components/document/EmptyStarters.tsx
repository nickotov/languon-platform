import React from 'react';
import { BookOpenIcon, LanguagesIcon, PencilLineIcon, SparklesIcon } from 'lucide-react';
import type { StarterKind } from '../../types/document';
import { ru } from '../../data/strings';

interface EmptyStartersProps {
  touch: boolean;
  aiBusy: boolean;
  onStart: (kind: StarterKind) => void;
}

const starters: { id: StarterKind; label: string; icon: typeof PencilLineIcon; ai?: boolean }[] = [
  { id: 'write', label: ru.starters.write, icon: PencilLineIcon },
  { id: 'outline', label: ru.starters.outline, icon: SparklesIcon, ai: true },
  { id: 'lesson', label: ru.starters.lesson, icon: BookOpenIcon },
  { id: 'language', label: ru.starters.language, icon: LanguagesIcon },
];

/** Compact starting actions under an empty body. Rendered outside the editable area. */
export function EmptyStarters({ touch, aiBusy, onStart }: EmptyStartersProps) {
  return (
    <div role="group" aria-label={ru.starters.label} className="mt-4 flex flex-wrap gap-1.5">
      {starters.map((s) => (
        <button
          key={s.id}
          type="button"
          // Keep focus/caret where it is when clicked with a pointer.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onStart(s.id)}
          disabled={s.ai && aiBusy}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-border-default px-2.5 text-sm text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50 ${touch ? 'h-11' : 'h-8'}`}
        >
          <s.icon className={`h-4 w-4 ${s.ai ? 'text-primary-default' : 'text-text-tertiary'}`} aria-hidden="true" />
          {s.label}
        </button>
      ))}
    </div>
  );
}

