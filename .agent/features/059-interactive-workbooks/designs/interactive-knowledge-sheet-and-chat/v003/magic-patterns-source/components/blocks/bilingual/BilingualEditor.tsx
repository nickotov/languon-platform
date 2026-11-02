import React, { useState } from 'react';
import type { BilingualBlock, TranslationLang } from '../../../types/blocks';
import { newId } from '../../../utils/sheetNodes';
import { AddButton, Field, RemoveButton, TitleField } from '../EditorFields';
import { bs, langNames } from '../../../data/blockStrings';

interface BilingualEditorProps {
  draft: BilingualBlock;
  onChange: (next: BilingualBlock) => void;
  touch: boolean;
  showErrors: boolean;
}

const ALL: TranslationLang[] = ['ru', 'en', 'de', 'es'];

export const bilingualErrors = (b: BilingualBlock) => (b.title.trim() ? 0 : 1) + (b.segments.some((s) => s.source.trim()) ? 0 : 1);

/** Source segments with the translation for one prepared language at a time; other languages are kept untouched. */
export function BilingualEditor({ draft, onChange, touch, showErrors }: BilingualEditorProps) {
  const [lang, setLang] = useState<TranslationLang>(draft.prepared[0] ?? 'ru');
  const set = (patch: Partial<BilingualBlock>) => onChange({ ...draft, ...patch });
  const addable = ALL.filter((l) => !draft.prepared.includes(l));

  return (
    <div className="space-y-4">
      <TitleField value={draft.title} onChange={(title) => set({ title })} touch={touch} invalid={showErrors && !draft.title.trim()} />

      <div className="flex flex-wrap items-end gap-2 border-t border-border-default pt-4">
        <label className="flex-1 text-xs font-medium text-text-secondary">
          {bs.bilingual.editingLanguage}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as TranslationLang)}
            className={`mt-1 block w-full rounded-lg border border-border-strong bg-background-surface px-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100 ${touch ? 'h-11' : 'h-9'}`}
          >
            {draft.prepared.map((l) => (
              <option key={l} value={l}>
                {langNames[l]}
              </option>
            ))}
          </select>
        </label>
        {addable.length > 0 && (
          <label className="text-xs font-medium text-text-secondary">
            <span className="sr-only">{bs.bilingual.addLanguage}</span>
            <select
              value=""
              onChange={(e) => {
                const l = e.target.value as TranslationLang;
                if (!l) return;
                set({ prepared: [...draft.prepared, l] });
                setLang(l);
              }}
              className={`rounded-lg border border-dashed border-border-strong bg-background-surface px-2 text-sm text-primary-default focus:border-border-focus focus:outline-none ${touch ? 'h-11' : 'h-9'}`}
            >
              <option value="">+ {bs.bilingual.addLanguage}</option>
              {addable.map((l) => (
                <option key={l} value={l}>
                  {langNames[l]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-text-tertiary">{bs.bilingual.alignedNote}</p>

      {showErrors && !draft.segments.some((s) => s.source.trim()) && <p className="text-xs text-danger-default">{bs.bilingual.segmentSource(1)}</p>}
      <ol className="space-y-4">
        {draft.segments.map((s, i) => (
          <li key={s.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              <Field
                id={`${s.id}-src`}
                label={bs.bilingual.segmentSource(i + 1)}
                value={s.source}
                lang="fr"
                multiline
                rows={2}
                touch={touch}
                onChange={(source) => set({ segments: draft.segments.map((x) => (x.id === s.id ? { ...x, source } : x)) })}
              />
              <Field
                id={`${s.id}-${lang}`}
                label={bs.bilingual.segmentTranslation(i + 1, langNames[lang])}
                value={s.translations[lang] ?? ''}
                lang={lang}
                multiline
                rows={2}
                touch={touch}
                onChange={(t) => set({ segments: draft.segments.map((x) => (x.id === s.id ? { ...x, translations: { ...x.translations, [lang]: t } } : x)) })}
              />
            </div>
            <span className="pt-5">
              <RemoveButton label={`${bs.grammar.remove} ${i + 1}`} touch={touch} onClick={() => set({ segments: draft.segments.filter((x) => x.id !== s.id) })} />
            </span>
          </li>
        ))}
      </ol>
      <AddButton label={bs.bilingual.addSegment} touch={touch} onClick={() => set({ segments: [...draft.segments, { id: newId('s'), source: '', translations: {} }] })} />
    </div>
  );
}

