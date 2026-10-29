import React from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { ExerciseItem, ExerciseKind, ExercisesBlock } from '../../../types/blocks';
import { newId } from '../../../utils/sheetNodes';
import { ru } from '../../../data/strings';

interface ExercisesEditorProps {
  draft: ExercisesBlock;
  original: ExercisesBlock;
  onChange: (next: ExercisesBlock) => void;
  touch: boolean;
  showErrors: boolean;
  /** When embedded in another block's editor (audio questions), that editor owns the title. */
  hideTitle?: boolean;
}

const itemErrors = (i: ExerciseItem) =>
  (i.prompt.trim() ? 0 : 1) + (i.answer.trim() ? 0 : 1) + (i.kind === 'choice' && i.answer.trim() && !(i.choices ?? []).includes(i.answer.trim()) ? 1 : 0);

export const exerciseErrors = (b: ExercisesBlock) => (b.title.trim() ? 0 : 1) + b.items.reduce((n, i) => n + itemErrors(i), 0);

const material = (i: ExerciseItem) => JSON.stringify([i.kind, i.prompt, i.choices ?? [], i.answer]);

const input =
  'w-full rounded-lg border bg-background-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100';

export function ExercisesEditor({ draft, original, onChange, touch, showErrors, hideTitle = false }: ExercisesEditorProps) {
  const h = touch ? 'h-11' : 'h-9';
  const setItem = (id: string, patch: Partial<ExerciseItem>) => onChange({ ...draft, items: draft.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const border = (bad: boolean) => (bad ? 'border-danger-default' : 'border-border-strong');

  return (
    <div className="space-y-5">
      {!hideTitle && (
        <div>
          <label htmlFor="block-title" className="mb-1 block text-xs font-medium text-text-secondary">
            {ru.editor.titleField}
          </label>
          <input id="block-title" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} className={`${input} ${h} ${border(showErrors && !draft.title.trim())}`} />
        </div>
      )}
      <ol className="space-y-4">
        {draft.items.map((item, idx) => {
          const prev = original.items.find((o) => o.id === item.id);
          const materialChanged = prev && material(prev) !== material(item);
          const choiceBad = item.kind === 'choice' && item.answer.trim() !== '' && !(item.choices ?? []).includes(item.answer.trim());
          return (
            <li key={item.id} className="border-t border-border-default pt-4">
              <div className="mb-2 flex items-center gap-2">
                <p className="flex-1 text-sm font-semibold text-text-primary">{ru.exercise.item(idx + 1)}</p>
                <label className="sr-only" htmlFor={`${item.id}-kind`}>
                  {ru.exercise.kind}
                </label>
                <select
                  id={`${item.id}-kind`}
                  value={item.kind}
                  onChange={(e) => setItem(item.id, { kind: e.target.value as ExerciseKind, choices: e.target.value === 'choice' ? item.choices ?? ['', ''] : undefined })}
                  className={`rounded-lg border border-border-strong bg-background-surface px-2 text-sm text-text-primary focus:border-border-focus focus:outline-none ${touch ? 'h-11' : 'h-8'}`}
                >
                  {(Object.keys(ru.exercise.kinds) as ExerciseKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ru.exercise.kinds[k]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, items: draft.items.filter((x) => x.id !== item.id) })}
                  aria-label={ru.exercise.removeItem(idx + 1)}
                  className={`inline-flex items-center justify-center rounded-md text-text-tertiary hover:bg-danger-subtle hover:text-danger-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
                >
                  <Trash2Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor={`${item.id}-prompt`} className="mb-1 block text-xs font-medium text-text-secondary">
                    {ru.exercise.prompt} <span className="text-text-tertiary">· {ru.editor.required}</span>
                  </label>
                  <textarea
                    id={`${item.id}-prompt`}
                    rows={2}
                    value={item.prompt}
                    onChange={(e) => setItem(item.id, { prompt: e.target.value })}
                    className={`${input} resize-y py-2 leading-6 ${border(showErrors && !item.prompt.trim())}`}
                  />
                </div>
                {item.kind === 'choice' && (
                  <div>
                    <label htmlFor={`${item.id}-choices`} className="mb-1 block text-xs font-medium text-text-secondary">
                      {ru.exercise.choices} <span className="text-text-tertiary">· comma-separated</span>
                    </label>
                    <input
                      id={`${item.id}-choices`}
                      lang="fr"
                      value={(item.choices ?? []).join(', ')}
                      onChange={(e) => setItem(item.id, { choices: e.target.value.split(',').map((c) => c.trim()) })}
                      className={`${input} ${h} border-border-strong`}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor={`${item.id}-answer`} className="mb-1 block text-xs font-medium text-text-secondary">
                    {ru.exercise.referenceAnswer} <span className="text-text-tertiary">· {ru.editor.required}</span>
                  </label>
                  <input
                    id={`${item.id}-answer`}
                    lang="fr"
                    value={item.answer}
                    aria-invalid={(showErrors && (!item.answer.trim() || choiceBad)) || undefined}
                    onChange={(e) => setItem(item.id, { answer: e.target.value })}
                    className={`${input} ${h} ${border(showErrors && (!item.answer.trim() || choiceBad))}`}
                  />
                  {showErrors && choiceBad && <p className="mt-1 text-xs text-danger-default">{ru.exercise.choiceMissing}</p>}
                </div>
                <div>
                  <label htmlFor={`${item.id}-expl`} className="mb-1 block text-xs font-medium text-text-secondary">
                    {ru.exercise.explanation}
                  </label>
                  <textarea
                    id={`${item.id}-expl`}
                    rows={2}
                    value={item.explanation}
                    onChange={(e) => setItem(item.id, { explanation: e.target.value })}
                    className={`${input} resize-y border-border-strong py-2 leading-6`}
                  />
                </div>
                <div>
                  <label htmlFor={`${item.id}-hint`} className="mb-1 block text-xs font-medium text-text-secondary">
                    {ru.exercise.hintField}
                  </label>
                  <input id={`${item.id}-hint`} value={item.hint ?? ''} onChange={(e) => setItem(item.id, { hint: e.target.value || undefined })} className={`${input} ${h} border-border-strong`} />
                </div>
                {materialChanged && <p className="rounded-lg bg-background-subtle px-2.5 py-1.5 text-xs leading-5 text-text-secondary">{ru.exercise.newVersion}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => onChange({ ...draft, items: [...draft.items, { id: newId('e'), kind: 'blank', prompt: '', answer: '', explanation: '', version: 1 }] })}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 text-sm font-medium text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h}`}
      >
        <PlusIcon className="h-4 w-4" aria-hidden="true" />
        {ru.exercise.addItem}
      </button>
    </div>
  );
}

