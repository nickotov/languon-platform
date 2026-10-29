import React from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { VocabEntry, VocabularyBlock } from '../../../types/blocks';
import type { FieldAiApi } from '../../../hooks/useFieldAi';
import { FieldAiAction } from '../FieldAiAction';
import { newId } from '../../../utils/sheetNodes';
import { ru } from '../../../data/strings';

interface VocabularyEditorProps {
  draft: VocabularyBlock;
  onChange: (next: VocabularyBlock) => void;
  ai: FieldAiApi;
  touch: boolean;
  showErrors: boolean;
}

export const vocabErrors = (b: VocabularyBlock) =>
  (b.title.trim() ? 0 : 1) + b.entries.reduce((n, e) => n + (e.term.trim() ? 0 : 1) + (e.translation.trim() ? 0 : 1), 0);

const input =
  'w-full rounded-lg border bg-background-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100';

/** Focused entry/field controls; the inline block never becomes a form. */
export function VocabularyEditor({ draft, onChange, ai, touch, showErrors }: VocabularyEditorProps) {
  const h = touch ? 'h-11' : 'h-9';
  const setEntry = (id: string, patch: Partial<VocabEntry>) => onChange({ ...draft, entries: draft.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const field = (e: VocabEntry, key: keyof VocabEntry, label: string, opts: { lang?: string; required?: boolean; ai?: 'check' | 'generate' | 'auto'; aiLabel?: string } = {}) => {
    const value = (e[key] as string | undefined) ?? '';
    const id = `${e.id}-${key}`;
    const error = showErrors && opts.required && !value.trim();
    const aiKind = opts.ai === 'auto' ? (value.trim() ? 'check' : 'generate') : opts.ai;
    return (
      <div>
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-secondary">
          {label}
          {opts.required && <span className="text-text-tertiary"> · {ru.editor.required}</span>}
        </label>
        <input
          id={id}
          lang={opts.lang}
          value={value}
          aria-invalid={error || undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(ev) => setEntry(e.id, { [key]: ev.target.value })}
          className={`${input} ${h} ${error ? 'border-danger-default' : 'border-border-strong'}`}
        />
        {error && (
          <p id={`${id}-err`} className="mt-1 text-xs text-danger-default">
            {ru.editor.required}
          </p>
        )}
        {aiKind && (
          <FieldAiAction
            ai={ai}
            fieldKey={id}
            value={value}
            kind={aiKind}
            touch={touch}
            label={aiKind === 'generate' ? ru.fieldAi.generateTranslation : opts.aiLabel ?? ru.fieldAi.checkTranslation}
            onAccept={(v) => setEntry(e.id, { [key]: v })}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="block-title" className="mb-1 block text-xs font-medium text-text-secondary">
          {ru.editor.titleField}
        </label>
        <input
          id="block-title"
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          className={`${input} ${h} ${showErrors && !draft.title.trim() ? 'border-danger-default' : 'border-border-strong'}`}
        />
        <p className="mt-1 text-xs text-text-tertiary">{ru.vocab.langPair}</p>
      </div>

      <ol className="space-y-4">
        {draft.entries.map((e, i) => (
          <li key={e.id} className="border-t border-border-default pt-4">
            <div className="mb-2 flex items-center gap-2">
              <p className="flex-1 text-sm font-semibold text-text-primary">
                {ru.vocab.entry(i + 1)}
                {e.term && (
                  <span lang="fr" className="font-normal text-text-tertiary">
                    {' '}
                    · {e.term}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => onChange({ ...draft, entries: draft.entries.filter((x) => x.id !== e.id) })}
                aria-label={ru.vocab.removeEntry(e.term)}
                className={`inline-flex items-center justify-center rounded-md text-text-tertiary hover:bg-danger-subtle hover:text-danger-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
              >
                <Trash2Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field(e, 'term', ru.vocab.term, { lang: 'fr', required: true })}
              {field(e, 'translation', ru.vocab.translation, { lang: 'ru', required: true, ai: 'auto' })}
            </div>
            <div className="mt-3 grid gap-3">
              {field(e, 'ipa', ru.vocab.ipa)}
              {field(e, 'example', ru.vocab.example, { lang: 'fr' })}
              {e.example && field(e, 'exampleTranslation', ru.vocab.exampleTranslation, { lang: 'ru', ai: 'auto', aiLabel: ru.fieldAi.checkExample })}
            </div>
          </li>
        ))}
      </ol>
      {!draft.entries.length && <p className="text-sm text-text-tertiary">{ru.vocab.empty}</p>}
      <button
        type="button"
        onClick={() => onChange({ ...draft, entries: [...draft.entries, { id: newId('v'), term: '', translation: '' }] })}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 text-sm font-medium text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h}`}
      >
        <PlusIcon className="h-4 w-4" aria-hidden="true" />
        {ru.vocab.addEntry}
      </button>
    </div>
  );
}

