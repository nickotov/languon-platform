import React, { useEffect, useRef, useState } from 'react';
import { ClipboardIcon, CheckIcon, XIcon } from 'lucide-react';
import type { Reference } from '../../../types/document';
import { copiedReferences } from '../../../data/documentContent';
import { formatChars } from '../../../utils/docCompare';
import { ru } from '../../../data/strings';

interface ReferencePickerProps {
  attached: Reference[];
  error: string | null;
  touch: boolean;
  onAdd: (ref: Reference) => boolean;
  onClose: () => void;
}

export function ReferencePicker({ attached, error, touch, onAdd, onClose }: ReferencePickerProps) {
  const [query, setQuery] = useState('');
  const [paste, setPaste] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const items = copiedReferences.filter((r) => `${r.title} ${r.excerpt}`.toLowerCase().includes(query.toLowerCase()));

  const addPaste = () => {
    const text = paste.trim();
    if (!text) return;
    const ok = onAdd({ id: `paste-${Date.now()}`, title: ru.picker.pasted, excerpt: text.slice(0, 90), text });
    if (ok) setPaste('');
  };

  return (
    <div
      role="dialog"
      aria-label={ru.picker.label}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      className="absolute inset-x-3 bottom-full z-20 mb-1 overflow-hidden rounded-2xl border border-border-default bg-background-elevated shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border-default px-3">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ru.picker.search}
          aria-label={ru.picker.search}
          className={`min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none ${touch ? 'h-12' : 'h-10'}`}
        />
        <button type="button" onClick={onClose} aria-label={ru.common.close} className={`inline-flex items-center justify-center rounded-md text-text-tertiary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}>
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p role="alert" className="border-b border-border-default bg-danger-subtle px-3 py-2 text-xs leading-5 text-danger-default">
          {error}
        </p>
      )}
      <ul className="max-h-56 overflow-y-auto p-1.5">
        {items.length === 0 && <li className="px-2 py-3 text-sm text-text-secondary">{ru.picker.none(query)}</li>}
        {items.map((r) => {
          const added = attached.some((a) => a.id === r.id);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onAdd(r)}
                disabled={added}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-default ${touch ? 'min-h-11' : ''}`}
              >
                <ClipboardIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">{r.title}</span>
                  <span className="block truncate text-xs text-text-secondary">{r.excerpt}</span>
                </span>
                <span className="shrink-0 text-xs text-text-tertiary">
                  {added ? <CheckIcon className="h-4 w-4 text-primary-default" aria-label={ru.picker.attached} /> : ru.common.chars(formatChars(r.text.length))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border-default p-2">
        <label htmlFor="ref-paste" className="px-1 text-xs font-medium text-text-secondary">
          {ru.picker.paste}
        </label>
        <div className="mt-1 flex gap-1.5">
          <textarea
            id="ref-paste"
            rows={1}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={ru.picker.pastePlaceholder}
            className="min-w-0 flex-1 resize-none rounded-lg border border-border-default bg-background-surface px-2.5 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
          />
          <button type="button" onClick={addPaste} disabled={!paste.trim()} className={`shrink-0 rounded-lg border border-border-default px-3 text-xs font-medium text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40 ${touch ? 'h-11' : 'h-9'}`}>
            {ru.picker.attach}
          </button>
        </div>
      </div>
    </div>
  );
}

