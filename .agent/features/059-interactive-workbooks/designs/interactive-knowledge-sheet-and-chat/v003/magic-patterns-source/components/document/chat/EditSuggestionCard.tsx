import React from 'react';
import { FilePenLineIcon, MousePointerClickIcon } from 'lucide-react';
import type { Suggestion } from '../../../types/document';
import { htmlToText } from '../../../utils/docCompare';
import { ru } from '../../../data/strings';

interface EditSuggestionCardProps {
  suggestion: Suggestion;
  active: boolean;
  touch: boolean;
  /** Replacements can be reviewed on the text itself. */
  inlineCapable: boolean;
  onShowInline: () => void;
  onUse: () => void;
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`);

/** Compact proposal: a small diff for replacements, a preview for additions. */
export function EditSuggestionCard({ suggestion, active, touch, inlineCapable, onShowInline, onUse }: EditSuggestionCardProps) {
  const replace = suggestion.kind === 'replace';
  const inline = replace && inlineCapable;
  const label = active ? ru.chat.suggestionOpen : inline ? ru.chat.suggestionShow : ru.chat.suggestionUse;

  return (
    <div className="mt-3 rounded-xl border border-border-default">
      <p className="px-3 pt-2.5 text-xs font-medium text-text-tertiary">{replace ? ru.chat.suggestionReplace : suggestion.label}</p>
      <div className="px-3 pb-2.5 pt-1 text-sm leading-6">
        {replace ? (
          <>
            <del className="text-text-secondary decoration-danger-default">
              <span className="sr-only">{ru.review.remove}: </span>
              {clip(suggestion.original ?? '', 140)}
            </del>
            <ins className="mt-1 block rounded bg-success-subtle px-1 text-text-primary no-underline">
              <span className="sr-only">{ru.review.add}: </span>
              {suggestion.inlineText}
            </ins>
          </>
        ) : (
          <p className="border-l-2 border-success-default pl-2.5 text-text-secondary">{clip(htmlToText(suggestion.blockHtml), 180)}</p>
        )}
      </div>
      <div className="border-t border-border-default p-1">
        <button
          type="button"
          onClick={inline ? onShowInline : onUse}
          aria-pressed={active}
          className={`inline-flex w-full items-center gap-1.5 rounded-lg px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-8'} ${
            active ? 'bg-primary-subtle text-primary-default' : 'text-primary-default hover:bg-primary-subtle'
          }`}
        >
          {inline ? <MousePointerClickIcon className="h-4 w-4" aria-hidden="true" /> : <FilePenLineIcon className="h-4 w-4" aria-hidden="true" />}
          {label}
        </button>
      </div>
    </div>
  );
}

