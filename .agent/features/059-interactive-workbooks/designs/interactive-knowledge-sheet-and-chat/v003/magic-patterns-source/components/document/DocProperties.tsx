import React, { useState } from 'react';
import { CheckIcon, LanguagesIcon, PlusIcon, TagIcon, TextIcon } from 'lucide-react';
import type { DocMeta } from '../../types/document';
import { metaCategories, metaLanguages } from '../../data/documentContent';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { ru } from '../../data/strings';

interface DocPropertiesProps {
  meta: DocMeta;
  onChange: (meta: DocMeta) => void;
  touch: boolean;
}

const field =
  'w-full rounded-lg border border-border-default bg-background-surface px-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100';

/** Optional summary, categories and languages as quiet inline chips under the title. */
export function DocProperties({ meta, onChange, touch }: DocPropertiesProps) {
  const [expanded, setExpanded] = useState(false);
  const hasLang = Boolean(meta.studiedLanguage || meta.explanationLanguage);
  const hasCats = meta.categories.length > 0;
  const hasSummary = meta.summary.trim().length > 0;
  const h = touch ? 'h-11' : 'h-7';

  if (!hasLang && !hasCats && !hasSummary && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`inline-flex items-center gap-1.5 rounded-md px-1.5 text-sm text-text-tertiary hover:bg-background-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h}`}
      >
        <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {ru.props.add}
      </button>
    );
  }

  const chip = (filled: boolean) =>
    `inline-flex max-w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h} ${
      filled ? 'bg-background-subtle text-text-secondary hover:text-text-primary' : 'border border-dashed border-border-strong text-text-tertiary hover:text-text-secondary'
    }`;

  const langLabel = [meta.studiedLanguage || ru.props.notSet, meta.explanationLanguage].filter(Boolean).join(' → ');

  return (
    <div role="group" aria-label={ru.props.label} className="flex flex-wrap items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={chip(hasLang)} aria-label={hasLang ? ru.props.edit(`${ru.props.languages}: ${langLabel}`) : undefined}>
            <LanguagesIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{hasLang ? langLabel : ru.props.languages}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={12} className="grid w-64 gap-3 p-3">
          {(['studiedLanguage', 'explanationLanguage'] as const).map((key) => (
            <div key={key}>
              <label htmlFor={`meta-${key}`} className="text-xs font-medium text-text-secondary">
                {key === 'studiedLanguage' ? ru.props.studied : ru.props.explanation}
              </label>
              <select
                id={`meta-${key}`}
                value={meta[key]}
                onChange={(e) => onChange({ ...meta, [key]: e.target.value })}
                className={`${field} mt-1 ${touch ? 'h-11' : 'h-9'}`}
              >
                <option value="">{ru.props.notSet}</option>
                {metaLanguages.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
          ))}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={chip(hasCats)} aria-label={hasCats ? ru.props.edit(`${ru.props.categories}: ${meta.categories.join(', ')}`) : undefined}>
            <TagIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{hasCats ? meta.categories.join(', ') : ru.props.categories}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={12} className="w-64 p-1.5">
          <p className="px-2 pb-1 pt-1 text-xs text-text-tertiary">{ru.props.categoriesHint}</p>
          <ul role="group" aria-label={ru.props.categories}>
            {metaCategories.map((c) => {
              const on = meta.categories.includes(c);
              return (
                <li key={c}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => onChange({ ...meta, categories: on ? meta.categories.filter((x) => x !== c) : [...meta.categories, c] })}
                    className={`flex w-full items-center gap-2 rounded-md px-2 text-left text-sm text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'min-h-11' : 'h-8'}`}
                  >
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-primary-default bg-primary-default text-background-surface' : 'border-border-strong'}`}>
                      {on && <CheckIcon className="h-3 w-3" aria-hidden="true" />}
                    </span>
                    {c}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={`${chip(hasSummary)} ${hasSummary ? 'max-w-xs' : ''}`} aria-label={hasSummary ? ru.props.edit(ru.props.summary) : undefined}>
            <TextIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{hasSummary ? meta.summary : ru.props.summary}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={12} className="w-80 p-3">
          <label htmlFor="meta-summary" className="text-xs font-medium text-text-secondary">
            {ru.props.summary}
          </label>
          <textarea
            id="meta-summary"
            rows={3}
            value={meta.summary}
            onChange={(e) => onChange({ ...meta, summary: e.target.value })}
            placeholder={ru.props.summaryPlaceholder}
            className={`${field} mt-1 resize-none py-2 leading-6`}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

