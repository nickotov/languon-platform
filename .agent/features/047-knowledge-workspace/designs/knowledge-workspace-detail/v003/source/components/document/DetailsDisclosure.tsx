import React from 'react';
import { ChevronDownIcon, TagsIcon } from 'lucide-react';
import type { DocMeta } from '../../types/document';
import { metaCategories, metaLanguages } from '../../data/documentContent';

interface DetailsDisclosureProps {
  meta: DocMeta;
  open: boolean;
  onToggle: () => void;
  onChange: (meta: DocMeta) => void;
  touch: boolean;
}

const field =
  'w-full rounded-lg border border-border-default bg-background-surface px-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100';

export function DetailsDisclosure({ meta, open, onToggle, onChange, touch }: DetailsDisclosureProps) {
  const filled = meta.summary || meta.categories.length || meta.studiedLanguage;
  const summaryLine = filled
    ? [
        meta.studiedLanguage && `${meta.studiedLanguage}${meta.explanationLanguage ? ` → ${meta.explanationLanguage}` : ''}`,
        meta.categories.join(', '),
        meta.summary && 'Summary added',
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Add a summary, categories or languages';

  return (
    <section aria-label="Document details" className="rounded-xl border border-border-default bg-background-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="doc-details"
        className={`flex w-full items-center gap-2.5 rounded-xl px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'min-h-11 py-2' : 'py-2'}`}
      >
        <TagsIcon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="shrink-0 text-xs font-medium text-text-secondary">Details</span>
        <span className={`min-w-0 flex-1 truncate text-xs ${filled ? 'text-text-primary' : 'text-text-tertiary'}`}>{summaryLine}</span>
        <span className="shrink-0 text-xs text-text-tertiary">Optional</span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id="doc-details" className="grid gap-3 border-t border-border-default px-3 pb-3 pt-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="meta-summary" className="text-xs font-medium text-text-secondary">
              Summary
            </label>
            <textarea
              id="meta-summary"
              rows={2}
              value={meta.summary}
              onChange={(e) => onChange({ ...meta, summary: e.target.value })}
              placeholder="One or two sentences you’ll see in Knowledge"
              className={`${field} mt-1 resize-none py-2 leading-6`}
            />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="text-xs font-medium text-text-secondary">Categories</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {metaCategories.map((c) => {
                const on = meta.categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...meta, categories: on ? meta.categories.filter((x) => x !== c) : [...meta.categories, c] })}
                    className={`rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-7'} ${
                      on ? 'border-primary-default bg-primary-subtle text-primary-default' : 'border-border-default text-text-secondary hover:bg-background-subtle'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {(['studiedLanguage', 'explanationLanguage'] as const).map((key) => (
            <div key={key}>
              <label htmlFor={`meta-${key}`} className="text-xs font-medium text-text-secondary">
                {key === 'studiedLanguage' ? 'Language studied' : 'Explanation language'}
              </label>
              <select
                id={`meta-${key}`}
                value={meta[key]}
                onChange={(e) => onChange(key === 'studiedLanguage' ? { ...meta, studiedLanguage: e.target.value } : { ...meta, explanationLanguage: e.target.value })}
                className={`${field} mt-1 ${touch ? 'h-11' : 'h-9'}`}
              >
                <option value="">Not set</option>
                {metaLanguages.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

