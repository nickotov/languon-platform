import React, { useEffect, useRef } from 'react';
import { AlertTriangleIcon, CheckIcon, Columns3Icon, XIcon } from 'lucide-react';
import type { DocChatMessage } from '../../types/document';
import type { RichEditor } from '../../utils/richEditor';
import { ru } from '../../data/strings';

interface InlineReviewProps {
  editor: RichEditor;
  message: DocChatMessage;
  touch: boolean;
  onAccept: () => void;
  onReject: () => void;
  /** Open the full review with the original / current / proposed comparison. */
  onCompare: () => void;
}

/**
 * Proposed replacement shown on the text itself: the remembered passage is struck through
 * (drawn as a highlight, the document is untouched) and the proposal sits right beneath it.
 */
export function InlineReview({ editor, message, touch, onAccept, onReject, onCompare }: InlineReviewProps) {
  const suggestion = message.suggestion!;
  const id = message.targetId ?? '';
  const target = editor.getTarget(id);
  const changed = !!target && target.range.toString() !== target.original;
  const scrolled = useRef(false);

  useEffect(() => {
    editor.setActiveTarget(id, changed ? 'target' : 'remove');
    return () => editor.setActiveTarget(null);
  }, [editor, id, changed]);

  useEffect(() => {
    if (target && !scrolled.current) {
      scrolled.current = true;
      editor.scrollToRange(target.range);
    }
  }, [editor, target]);

  const wrapEl = editor.el?.parentElement;
  if (!target || !wrapEl || target.range.collapsed) return null;
  const wrap = wrapEl.getBoundingClientRect();
  const rects = target.range.getClientRects();
  const last = rects.length ? rects[rects.length - 1] : target.range.getBoundingClientRect();
  const width = Math.min(440, wrap.width + 16);
  const left = Math.max(-8, Math.min(last.left - wrap.left - 12, wrap.width - width + 8));
  const top = last.bottom - wrap.top + 8;
  const btn = `inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-8'}`;

  return (
    <section
      aria-label={ru.inline.label}
      style={{ top, left, width }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onReject();
      }}
      className="absolute z-20 rounded-xl border border-border-default bg-background-elevated shadow-lg"
    >
      <p className="px-3 pt-2.5 text-xs font-medium text-text-tertiary">
        {ru.inline.from} · {suggestion.label}
      </p>
      {changed ? (
        <p className="flex items-start gap-2 px-3 pt-1.5 text-sm leading-6 text-warning-default">
          <AlertTriangleIcon className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          {ru.inline.changed}
        </p>
      ) : (
        <p className="px-3 pt-1.5 text-base leading-7">
          <span className="sr-only">{ru.review.remove}: {target.original}. {ru.review.add}: </span>
          <ins className="rounded bg-success-subtle px-1 text-text-primary no-underline">{suggestion.inlineText}</ins>
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border-default p-1.5">
        {!changed && (
          <button type="button" onClick={onAccept} className={`${btn} bg-primary-default text-background-surface hover:bg-primary-hover`}>
            <CheckIcon className="h-4 w-4" aria-hidden="true" />
            {ru.inline.accept}
          </button>
        )}
        <button type="button" onClick={onCompare} className={`${btn} ${changed ? 'bg-primary-default text-background-surface hover:bg-primary-hover' : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'}`}>
          <Columns3Icon className="h-4 w-4" aria-hidden="true" />
          {ru.inline.compare}
        </button>
        <button type="button" onClick={onReject} className={`${btn} text-text-secondary hover:bg-background-subtle hover:text-text-primary`}>
          <XIcon className="h-4 w-4" aria-hidden="true" />
          {ru.inline.reject}
        </button>
      </div>
    </section>
  );
}

