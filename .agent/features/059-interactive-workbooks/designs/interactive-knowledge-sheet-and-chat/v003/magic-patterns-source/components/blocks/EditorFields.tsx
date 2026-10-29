import React from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { ru } from '../../data/strings';

const base =
  'w-full rounded-lg border bg-background-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100';

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  touch: boolean;
  multiline?: boolean;
  rows?: number;
  lang?: string;
  invalid?: boolean;
  help?: string;
  error?: string;
  inputMode?: 'numeric' | 'text' | 'url';
  type?: string;
}

/** Labelled input/textarea used by every block editor so validation and focus look the same. */
export function Field({ id, label, value, onChange, touch, multiline, rows = 3, lang, invalid, help, error, inputMode, type }: FieldProps) {
  const border = invalid ? 'border-danger-default' : 'border-border-strong';
  const describedBy = [help ? `${id}-help` : '', invalid && error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          lang={lang}
          rows={rows}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border} resize-y py-2 leading-6`}
        />
      ) : (
        <input
          id={id}
          lang={lang}
          type={type}
          inputMode={inputMode}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border} ${touch ? 'h-11' : 'h-9'}`}
        />
      )}
      {help && (
        <p id={`${id}-help`} className="mt-1 text-xs text-text-tertiary">
          {help}
        </p>
      )}
      {invalid && error && (
        <p id={`${id}-err`} className="mt-1 text-xs text-danger-default">
          {error}
        </p>
      )}
    </div>
  );
}

export function TitleField({ value, onChange, touch, invalid }: { value: string; onChange: (v: string) => void; touch: boolean; invalid: boolean }) {
  return <Field id="block-title" label={ru.editor.titleField} value={value} onChange={onChange} touch={touch} invalid={invalid} error={ru.editor.required} />;
}

export function RemoveButton({ label, onClick, touch }: { label: string; onClick: () => void; touch: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-danger-subtle hover:text-danger-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
    >
      <Trash2Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export function AddButton({ label, onClick, touch }: { label: string; onClick: () => void; touch: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-primary-default hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-8'}`}
    >
      <PlusIcon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-border-default pt-4 text-sm font-semibold text-text-primary">{children}</p>;
}

