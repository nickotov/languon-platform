import React, { useState } from 'react';
import { AlertTriangleIcon, ArrowLeftIcon, HistoryIcon, XIcon } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import type { Revision } from '../../types/document';
import { Button } from '../Button';
import { InlineAlert } from '../InlineAlert';
import { wordCount } from '../../utils/docCompare';
import { ru } from '../../data/strings';

interface RevisionHistoryProps {
  revisions: Revision[];
  status: 'loading' | 'ready' | 'error';
  dirty: boolean;
  savedAt: number | null;
  touch: boolean;
  onClose: () => void;
  onRetry: () => void;
  onRestore: (rev: Revision) => void;
}

function when(at: number) {
  const t = format(at, 'HH:mm');
  if (isToday(at)) return ru.history.today(t);
  if (isYesterday(at)) return ru.history.yesterday(t);
  return format(at, 'EEEEEE, d MMM, HH:mm', { locale: ruLocale });
}

export function RevisionHistory({ revisions, status, dirty, savedAt, touch, onClose, onRetry, onRestore }: RevisionHistoryProps) {
  const [selected, setSelected] = useState<Revision | null>(null);
  const [confirming, setConfirming] = useState(false);
  const size = touch ? 'default' : 'compact';
  const iconBtn = `inline-flex items-center justify-center rounded-md text-text-tertiary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`;

  return (
    <aside aria-label={ru.history.title} className="flex h-full flex-col bg-background-surface" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header className="flex items-center gap-2 border-b border-border-default px-4 py-2.5">
        {selected ? (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setConfirming(false);
            }}
            aria-label={ru.history.back}
            className={iconBtn}
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <HistoryIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
        )}
        <h2 className="flex-1 text-sm font-semibold text-text-primary">{selected ? when(selected.at) : ru.history.title}</h2>
        <button type="button" onClick={onClose} aria-label={ru.history.close} className={iconBtn}>
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === 'loading' && (
          <div className="space-y-2 p-4" role="status" aria-label={ru.history.loading}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-background-subtle" />
            ))}
          </div>
        )}
        {status === 'error' && (
          <div className="p-4">
            <InlineAlert
              tone="error"
              title={ru.history.errorTitle}
              actions={
                <Button size={size} variant="secondary" onClick={onRetry}>
                  {ru.history.tryAgain}
                </Button>
              }
            >
              {ru.history.errorBody}
            </InlineAlert>
          </div>
        )}
        {status === 'ready' && !selected && (
          <ul className="p-2">
            <li className="mx-2 mb-1 rounded-xl border border-dashed border-border-default px-3 py-2.5">
              <p className="text-sm font-medium text-text-primary">{ru.history.working}</p>
              <p className="text-xs text-text-secondary">{dirty ? ru.history.workingDirty : ru.history.workingClean}</p>
            </li>
            {revisions.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className={`flex w-full flex-col rounded-xl px-4 py-2.5 text-left hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'min-h-11' : ''}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    {when(r.at)}
                    {r.at === savedAt && <span className="rounded bg-success-subtle px-1.5 text-xs font-medium text-success-default">{ru.history.current}</span>}
                    {r.kind === 'kept' && <span className="rounded bg-background-subtle px-1.5 text-xs font-medium text-text-secondary">{ru.history.kept}</span>}
                  </span>
                  <span className="truncate text-xs text-text-secondary">
                    {r.label} · {r.device} · {ru.common.words(wordCount(r.html))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {status === 'ready' && selected && (
          <div className="p-4">
            <p className="text-xs text-text-tertiary">
              {selected.label} · {selected.device}
            </p>
            <h3 className="mt-1 text-base font-semibold text-text-primary">{selected.title}</h3>
            <div className="doc-prose doc-prose-compact mt-2 rounded-xl border border-border-default px-3 py-2" dangerouslySetInnerHTML={{ __html: selected.html }} />
          </div>
        )}
      </div>

      {status === 'ready' && selected && (
        <footer className="space-y-2 border-t border-border-default p-4">
          {confirming && dirty && (
            <p className="flex items-start gap-2 text-xs leading-5 text-warning-default" role="alert">
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {ru.history.warn}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {confirming && (
              <Button variant="ghost" size={size} onClick={() => setConfirming(false)}>
                {ru.common.cancel}
              </Button>
            )}
            <Button
              size={size}
              variant={confirming ? 'primary' : 'secondary'}
              onClick={() => {
                if (dirty && !confirming) {
                  setConfirming(true);
                  return;
                }
                onRestore(selected);
              }}
            >
              {confirming ? ru.history.restoreKeep : ru.history.restore}
            </Button>
          </div>
          <p className="text-xs text-text-tertiary">{ru.history.footnote}</p>
        </footer>
      )}
    </aside>
  );
}

