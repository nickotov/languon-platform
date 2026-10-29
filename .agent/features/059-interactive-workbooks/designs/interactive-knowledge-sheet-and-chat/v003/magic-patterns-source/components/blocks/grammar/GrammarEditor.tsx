import React from 'react';
import type { GrammarBlock } from '../../../types/blocks';
import { newId } from '../../../utils/sheetNodes';
import { AddButton, Field, RemoveButton, SectionLabel, TitleField } from '../EditorFields';
import { bs } from '../../../data/blockStrings';

interface GrammarEditorProps {
  draft: GrammarBlock;
  onChange: (next: GrammarBlock) => void;
  touch: boolean;
  showErrors: boolean;
}

const hasContent = (b: GrammarBlock) => !!(b.rule.trim() || b.pattern.trim() || b.examples.some((e) => e.source.trim()));

export const grammarErrors = (b: GrammarBlock) =>
  (b.title.trim() ? 0 : 1) +
  (hasContent(b) ? 0 : 1) +
  b.examples.filter((e) => e.source.trim() && !e.translation.trim()).length +
  b.mistakes.filter((m) => (m.wrong.trim() || m.right.trim()) && !(m.wrong.trim() && m.right.trim())).length;

export function GrammarEditor({ draft, onChange, touch, showErrors }: GrammarEditorProps) {
  const set = (patch: Partial<GrammarBlock>) => onChange({ ...draft, ...patch });
  const empty = showErrors && !hasContent(draft);

  return (
    <div className="space-y-4">
      <TitleField value={draft.title} onChange={(title) => set({ title })} touch={touch} invalid={showErrors && !draft.title.trim()} />
      {empty && <p className="text-xs text-danger-default">{bs.grammar.emptyNote}</p>}
      <Field id="g-rule" label={bs.grammar.ruleField} value={draft.rule} onChange={(rule) => set({ rule })} touch={touch} multiline rows={4} help={bs.grammar.optional} />
      <Field id="g-pattern" label={bs.grammar.patternField} value={draft.pattern} onChange={(pattern) => set({ pattern })} touch={touch} lang="fr" help={bs.grammar.optional} />

      <SectionLabel>{bs.grammar.examples}</SectionLabel>
      <ol className="space-y-3">
        {draft.examples.map((e, i) => (
          <li key={e.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              <Field
                id={`${e.id}-src`}
                label={`${bs.grammar.exampleSource} · ${i + 1}`}
                value={e.source}
                lang="fr"
                touch={touch}
                onChange={(source) => set({ examples: draft.examples.map((x) => (x.id === e.id ? { ...x, source } : x)) })}
              />
              <Field
                id={`${e.id}-tr`}
                label={bs.grammar.exampleTranslation}
                value={e.translation}
                lang="ru"
                touch={touch}
                invalid={showErrors && !!e.source.trim() && !e.translation.trim()}
                error={bs.grammar.exampleTranslation}
                onChange={(translation) => set({ examples: draft.examples.map((x) => (x.id === e.id ? { ...x, translation } : x)) })}
              />
            </div>
            <span className="pt-5">
              <RemoveButton label={`${bs.grammar.remove} ${i + 1}`} touch={touch} onClick={() => set({ examples: draft.examples.filter((x) => x.id !== e.id) })} />
            </span>
          </li>
        ))}
      </ol>
      <AddButton label={bs.grammar.addExample} touch={touch} onClick={() => set({ examples: [...draft.examples, { id: newId('g'), source: '', translation: '' }] })} />

      <SectionLabel>{bs.grammar.mistakes}</SectionLabel>
      <ol className="space-y-3">
        {draft.mistakes.map((m, i) => {
          const partial = showErrors && (m.wrong.trim() || m.right.trim()) && !(m.wrong.trim() && m.right.trim());
          const patch = (p: Partial<typeof m>) => set({ mistakes: draft.mistakes.map((x) => (x.id === m.id ? { ...x, ...p } : x)) });
          return (
            <li key={m.id} className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <Field id={`${m.id}-w`} label={bs.grammar.wrong} value={m.wrong} lang="fr" touch={touch} invalid={!!partial && !m.wrong.trim()} onChange={(wrong) => patch({ wrong })} />
                <Field id={`${m.id}-r`} label={bs.grammar.right} value={m.right} lang="fr" touch={touch} invalid={!!partial && !m.right.trim()} onChange={(right) => patch({ right })} />
                <div className="sm:col-span-2">
                  <Field id={`${m.id}-why`} label={bs.grammar.reason} value={m.reason} touch={touch} onChange={(reason) => patch({ reason })} />
                </div>
              </div>
              <span className="pt-5">
                <RemoveButton label={`${bs.grammar.remove} ${i + 1}`} touch={touch} onClick={() => set({ mistakes: draft.mistakes.filter((x) => x.id !== m.id) })} />
              </span>
            </li>
          );
        })}
      </ol>
      <AddButton label={bs.grammar.addMistake} touch={touch} onClick={() => set({ mistakes: [...draft.mistakes, { id: newId('g'), wrong: '', right: '', reason: '' }] })} />
      <p className="text-xs text-text-tertiary">{bs.grammar.libraryDeferred}</p>
    </div>
  );
}

