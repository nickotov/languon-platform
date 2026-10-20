import React from 'react';
import { CheckIcon, CircleAlertIcon, CloudAlertIcon, CloudOffIcon, Loader2Icon } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import type { DocStateApi } from '../../hooks/useDocState';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { ru } from '../../data/strings';

interface SaveStatusProps {
  doc: DocStateApi;
  compact: boolean;
}

type SaveState = 'saving' | 'failed' | 'draft' | 'dirty' | 'saved';

/** One status cluster for the whole document lifecycle; draft recovery lives in its popover. */
export function SaveStatus({ doc, compact }: SaveStatusProps) {
  const time = doc.saved ? format(doc.saved.savedAt, 'HH:mm') : '';
  const state: SaveState = doc.saving ? 'saving' : doc.saveError ? 'failed' : doc.saved === null ? 'draft' : doc.dirty ? 'dirty' : 'saved';
  const full: Record<SaveState, string> = {
    saving: ru.status.saving,
    failed: ru.status.failed,
    draft: ru.status.draft,
    dirty: ru.status.dirty,
    saved: ru.status.saved(time),
  };
  const short: Record<SaveState, string> = {
    saving: ru.status.saving,
    failed: ru.status.failed,
    draft: ru.status.draftShort,
    dirty: ru.status.dirtyShort,
    saved: ru.status.savedShort(time),
  };
  const label = compact ? short[state] : full[state];
  const tone = state === 'failed' ? 'text-danger-default' : 'text-text-secondary';
  const recoveryIssue = doc.recovery === 'local' || doc.recovery === 'error';

  const icon =
    state === 'saving' ? (
      <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
    ) : state === 'failed' ? (
      <CircleAlertIcon className="h-3.5 w-3.5" aria-hidden="true" />
    ) : state === 'saved' ? (
      <CheckIcon className="h-3.5 w-3.5 text-success-default" aria-hidden="true" />
    ) : (
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${state === 'dirty' ? 'bg-warning-500' : 'bg-neutral-400'}`} />
    );

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ru.status.detailsAria(full[state])}
            className={`inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${tone} ${compact ? 'h-11' : 'h-8'}`}
          >
            {icon}
            <span className="truncate" aria-live="polite">
              {label}
            </span>
            {recoveryIssue &&
              (doc.recovery === 'local' ? (
                <CloudOffIcon className="h-3.5 w-3.5 shrink-0 text-warning-default" aria-label={ru.status.offlineAria} />
              ) : (
                <CloudAlertIcon className="h-3.5 w-3.5 shrink-0 text-warning-default" aria-label={ru.status.recoveryErrorAria} />
              ))}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" collisionPadding={12} className="w-80 p-3.5">
          <p className="text-sm font-semibold text-text-primary">{ru.status.popTitle}</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">{ru.status.popBody}</p>
          {state === 'failed' && <p className="mt-2 text-xs leading-5 text-danger-default">{ru.status.failedBody}</p>}
          <p className={`mt-2 text-xs font-medium leading-5 ${recoveryIssue ? 'text-warning-default' : 'text-text-tertiary'}`}>
            {doc.recovery === 'recovered' && ru.status.recovered(formatDistanceToNowStrict(doc.recoveredAt, { addSuffix: true, locale: ruLocale }))}
            {doc.recovery === 'recovering' && ru.status.recovering}
            {doc.recovery === 'local' && ru.status.offline}
            {doc.recovery === 'error' && ru.status.recoveryError}
          </p>
          {doc.recovery === 'error' && (
            <button
              type="button"
              onClick={doc.retryRecovery}
              className="mt-2 h-8 rounded-md border border-border-default px-2.5 text-xs font-medium text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {ru.status.retryRecovery}
            </button>
          )}
        </PopoverContent>
      </Popover>
      {state === 'failed' && (
        <button
          type="button"
          onClick={() => doc.save()}
          className={`shrink-0 rounded-md px-2 text-xs font-semibold text-danger-default hover:bg-danger-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${compact ? 'h-11' : 'h-8'}`}
        >
          {ru.status.retry}
        </button>
      )}
    </div>
  );
}

