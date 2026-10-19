import React from 'react';
import { ClockIcon, LanguagesIcon, PencilLineIcon } from 'lucide-react';
import { cafeText } from '../data/sources';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';

interface TextPageProps {
  showTranslation: boolean;
  onToggleTranslation: () => void;
  hasUnsavedEdits: boolean;
  onSaveEdits: () => void;
  compact: boolean;
}

export function TextPage({ showTranslation, onToggleTranslation, hasUnsavedEdits, onSaveEdits, compact }: TextPageProps) {
  return (
    <article className={`mx-auto w-full max-w-2xl ${compact ? 'px-4 pb-32 pt-5' : 'px-8 pb-24 pt-10'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{cafeText.collection}</p>
      <h1 lang="fr" className={`mt-2 font-semibold tracking-tight text-text-primary ${compact ? 'text-2xl' : 'text-3xl'}`}>
        {cafeText.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        <Badge tone="info" size="sm">
          {cafeText.level}
        </Badge>
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" /> {cafeText.minutes} min read
        </span>
        <span aria-hidden="true">·</span>
        <span>French → English</span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-border-default py-3">
        <button
          type="button"
          aria-pressed={showTranslation}
          onClick={onToggleTranslation}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${compact ? 'h-11' : 'h-9'} ${
            showTranslation ? 'border-primary-default bg-primary-subtle text-primary-default' : 'border-border-default text-text-secondary hover:bg-background-subtle'
          }`}
        >
          <LanguagesIcon className="h-4 w-4" aria-hidden="true" />
          {showTranslation ? 'Hide translation' : 'Show translation'}
        </button>
        {!compact && <span className="text-xs text-text-tertiary">Select any passage to copy it or ask the tutor.</span>}
      </div>

      {hasUnsavedEdits && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning-200 bg-warning-subtle px-3.5 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm text-text-primary">
            <PencilLineIcon className="h-4 w-4 text-warning-default" aria-hidden="true" />
            Unsaved edits to this text
          </span>
          <Button size={compact ? 'default' : 'compact'} variant="secondary" onClick={onSaveEdits}>
            Save changes
          </Button>
        </div>
      )}

      <div data-source-selectable className={`mt-6 ${compact ? 'space-y-5' : 'space-y-6'}`}>
        {cafeText.passages.map((p) => (
          <div key={p.id} data-passage-id={p.id} data-passage-index={p.index}>
            <p lang="fr" className={`text-text-primary ${compact ? 'text-base leading-7' : 'text-lg leading-8'}`}>
              {p.fr}
            </p>
            {showTranslation && (
              <p lang="en" className="mt-2 border-l-2 border-border-default pl-3 text-sm leading-6 text-text-secondary">
                {p.en}
              </p>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

