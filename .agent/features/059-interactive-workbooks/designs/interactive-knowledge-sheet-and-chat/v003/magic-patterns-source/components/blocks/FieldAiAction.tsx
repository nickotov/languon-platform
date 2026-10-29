import React from 'react';
import { AlertTriangleIcon, CheckIcon, Loader2Icon, RotateCcwIcon, SparklesIcon } from 'lucide-react';
import type { FieldAiApi, FieldAiKind } from '../../hooks/useFieldAi';
import { ru } from '../../data/strings';

interface FieldAiActionProps {
  ai: FieldAiApi;
  fieldKey: string;
  value: string;
  kind: FieldAiKind;
  label: string;
  touch: boolean;
  onAccept: (value: string) => void;
}

/** Scoped AI action + its result, rendered directly under one field. */
export function FieldAiAction({ ai, fieldKey, value, kind, label, touch, onAccept }: FieldAiActionProps) {
  const s = ai.states[fieldKey];
  const stale = s && s.status !== 'pending' && s.status !== 'failed' && s.captured !== value;
  const h = touch ? 'h-11' : 'h-7';
  const small = `inline-flex items-center gap-1 rounded-md px-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h}`;

  return (
    <div className="mt-1">
      {!s && (
        <button type="button" onClick={() => ai.run(fieldKey, kind, value)} disabled={kind === 'check' && !value.trim()} className={`${small} text-primary-default hover:bg-primary-subtle disabled:opacity-40`}>
          <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </button>
      )}
      <div aria-live="polite">
        {s?.status === 'pending' && (
          <p className="flex items-center gap-1.5 py-1 text-xs text-text-secondary">
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {kind === 'check' ? ru.fieldAi.checking : ru.fieldAi.generating}
          </p>
        )}
        {s?.status === 'failed' && (
          <div className="flex flex-wrap items-center gap-1.5 py-1 text-xs text-danger-default">
            <AlertTriangleIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {ru.fieldAi.failed}
            <button type="button" onClick={() => ai.run(fieldKey, kind, value)} className={`${small} text-text-primary hover:bg-background-subtle`}>
              <RotateCcwIcon className="h-3 w-3" aria-hidden="true" />
              {ru.fieldAi.retry}
            </button>
          </div>
        )}
        {stale && (
          <div className="mt-1 rounded-lg bg-warning-subtle px-2.5 py-1.5 text-xs leading-5 text-text-primary">
            <p className="flex items-start gap-1.5">
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-default" aria-hidden="true" />
              {ru.fieldAi.stale}
            </p>
            {s.proposed && (
              <p className="mt-1 text-text-secondary">
                {ru.fieldAi.suggested}: <span lang="ru">{s.proposed}</span>
              </p>
            )}
            <div className="mt-1 flex gap-1">
              <button type="button" onClick={() => ai.run(fieldKey, kind, value)} className={`${small} text-primary-default hover:bg-primary-subtle`}>
                {ru.fieldAi.recheck}
              </button>
              <button type="button" onClick={() => ai.clear(fieldKey)} className={`${small} text-text-secondary hover:bg-background-subtle`}>
                {ru.fieldAi.dismiss}
              </button>
            </div>
          </div>
        )}
        {!stale && s?.status === 'ok' && (
          <p className="flex flex-wrap items-center gap-1.5 py-1 text-xs text-success-default">
            <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-medium">{ru.fieldAi.looksCorrect}</span>
            {s.note && <span className="text-text-secondary">· {s.note}</span>}
            <button type="button" onClick={() => ai.clear(fieldKey)} className={`${small} text-text-secondary hover:bg-background-subtle`}>
              {ru.fieldAi.dismiss}
            </button>
          </p>
        )}
        {!stale && s?.status === 'suggest' && s.proposed && (
          <div className="mt-1 rounded-lg border border-border-default px-2.5 py-2 text-sm">
            {s.captured && (
              <p className="text-xs text-text-tertiary">
                {ru.fieldAi.current}: <del className="text-text-secondary decoration-danger-default">{s.captured}</del>
              </p>
            )}
            <p className="text-xs text-text-tertiary">{ru.fieldAi.suggested}</p>
            <ins lang="ru" className="block rounded bg-success-subtle px-1 text-text-primary no-underline">
              {s.proposed}
            </ins>
            {s.note && <p className="mt-1 text-xs leading-5 text-text-secondary">{s.note}</p>}
            <div className="mt-1.5 flex gap-1">
              <button
                type="button"
                onClick={() => {
                  onAccept(s.proposed!);
                  ai.clear(fieldKey);
                }}
                className={`${small} bg-primary-default text-background-surface hover:bg-primary-hover`}
              >
                <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {ru.fieldAi.accept}
              </button>
              <button type="button" onClick={() => ai.clear(fieldKey)} className={`${small} text-text-secondary hover:bg-background-subtle`}>
                {ru.fieldAi.dismiss}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

