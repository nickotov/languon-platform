import React, { useMemo, useState } from 'react';
import { AlertCircleIcon, BookAIcon, BookOpenTextIcon, CheckCircle2Icon } from 'lucide-react';
import type { BilingualBlock, VocabularyBlock } from '../../../types/blocks';
import { libraryDictionaries } from '../../../data/blockSamples';
import { Button } from '../../Button';
import { SidePanel } from '../SidePanel';
import { Field } from '../EditorFields';
import { bs } from '../../../data/blockStrings';

interface LibrarySaveDialogProps {
  block: VocabularyBlock | BilingualBlock;
  mobile: boolean;
  /** Prototype flag: the save request fails once. */
  fails: boolean;
  onClose: () => void;
  onSaved: (destination: string) => void;
}

const EXISTING_TEXT = { id: 'text-semaine', name: 'Ma semaine en France' };

type Phase = 'edit' | 'saving' | 'saved' | 'failed';

/** Independent copy into a dictionary or Texts. No AI is involved, so it never costs credits. */
export function LibrarySaveDialog({ block, mobile, fails, onClose, onSaved }: LibrarySaveDialogProps) {
  const vocab = block.type === 'vocabulary';
  const entries = block.type === 'vocabulary' ? block.entries : [];
  const segCount = block.type === 'bilingual' ? block.segments.length : 0;
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(entries.map((e) => [e.id, true])));
  const [dest, setDest] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState(block.title);
  const [phase, setPhase] = useState<Phase>('edit');
  const [failOnce, setFailOnce] = useState(fails);
  const existing = vocab ? libraryDictionaries[0] : EXISTING_TEXT;

  const picked = entries.filter((e) => selected[e.id]);
  const duplicates = useMemo(() => {
    if (!vocab || dest !== 'existing') return 0;
    const terms = new Set(libraryDictionaries[0].entries.map((e) => e.term.toLowerCase()));
    return picked.filter((e) => terms.has(e.term.toLowerCase())).length;
  }, [vocab, dest, picked]);

  const destName = dest === 'new' ? name.trim() : existing.name;
  const nothing = vocab && picked.length === 0;
  const invalidName = dest === 'new' && !name.trim();

  const preview = vocab
    ? dest === 'new'
      ? bs.library.willCreate(destName, picked.length)
      : bs.library.willAdd(destName, picked.length - duplicates, duplicates)
    : dest === 'new'
      ? bs.library.willCreateText(destName, segCount)
      : bs.library.willAppendText(destName, segCount);

  const save = () => {
    if (nothing || invalidName) return;
    setPhase('saving');
    window.setTimeout(() => {
      if (failOnce) {
        setFailOnce(false);
        setPhase('failed');
        return;
      }
      setPhase('saved');
      onSaved(destName);
    }, 900);
  };

  const radio = (value: 'new' | 'existing', label: string, detail: string) => (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 ${dest === value ? 'border-primary-default bg-primary-subtle' : 'border-border-default hover:bg-background-subtle'}`}>
      <input type="radio" name="lib-dest" checked={dest === value} onChange={() => setDest(value)} className="mt-1 accent-primary-600" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        <span className="block text-xs text-text-tertiary">{detail}</span>
      </span>
    </label>
  );

  const size = mobile ? 'default' : 'compact';
  const footer =
    phase === 'saved' ? (
      <div className="flex items-center justify-end gap-2">
        <Button size={size} variant="ghost" onClick={onClose}>
          {bs.library.done}
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-text-tertiary">{bs.library.noCredits}</p>
        <Button size={size} variant="ghost" onClick={onClose} disabled={phase === 'saving'}>
          {bs.library.cancel}
        </Button>
        <Button size={size} onClick={save} loading={phase === 'saving'} disabled={nothing || invalidName}>
          {phase === 'failed' ? bs.library.retry : bs.library.confirm}
        </Button>
      </div>
    );

  return (
    <SidePanel
      title={vocab ? bs.library.titleDict : bs.library.titleTexts}
      subtitle={block.title}
      icon={vocab ? <BookAIcon className="h-4 w-4" aria-hidden="true" /> : <BookOpenTextIcon className="h-4 w-4" aria-hidden="true" />}
      mobile={mobile}
      container={null}
      onRequestClose={() => phase !== 'saving' && onClose()}
      footer={footer}
    >
      {phase === 'saved' ? (
        <div className="flex flex-col items-start gap-2 py-4" role="status">
          <CheckCircle2Icon className="h-6 w-6 text-success-default" aria-hidden="true" />
          <p className="text-base font-semibold text-text-primary">{bs.library.success(destName)}</p>
          <p className="text-sm leading-6 text-text-secondary">{bs.library.independent}</p>
        </div>
      ) : (
        <fieldset disabled={phase === 'saving'} className="space-y-5">
          {vocab && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-semibold text-text-primary">{bs.library.stepEntries}</p>
                <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={picked.length === entries.length}
                    onChange={(e) => setSelected(Object.fromEntries(entries.map((x) => [x.id, e.target.checked])))}
                    className="accent-primary-600"
                  />
                  {bs.library.all}
                </label>
              </div>
              <ul className="divide-y divide-border-default rounded-lg border border-border-default">
                {entries.map((e) => (
                  <li key={e.id}>
                    <label className={`flex cursor-pointer items-center gap-2.5 px-3 ${mobile ? 'min-h-11' : 'min-h-9'}`}>
                      <input type="checkbox" checked={!!selected[e.id]} onChange={(ev) => setSelected((s) => ({ ...s, [e.id]: ev.target.checked }))} className="accent-primary-600" />
                      <span lang="fr" className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                        {e.term}
                      </span>
                      <span lang="ru" className="truncate text-sm text-text-secondary">
                        {e.translation}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {nothing && <p className="mt-1 text-xs text-danger-default">{bs.library.noneSelected}</p>}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">{bs.library.stepDestination}</p>
            {radio('new', vocab ? bs.library.newDict : bs.library.newText, vocab ? bs.library.willCreate(name || '…', picked.length) : bs.library.willCreateText(name || '…', segCount))}
            {dest === 'new' && <Field id="lib-name" label={bs.library.nameField} value={name} onChange={setName} touch={mobile} invalid={invalidName} error={bs.library.nameField} />}
            {radio('existing', `${bs.library.existing} · ${existing.name}`, vocab ? `${libraryDictionaries[0].entries.length} entries` : '12 paragraphs')}
          </div>

          <div className="rounded-lg bg-background-subtle px-3 py-2.5">
            <p className="text-xs font-semibold text-text-secondary">{bs.library.preview}</p>
            <p className="mt-0.5 text-sm text-text-primary">{preview}</p>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">{bs.library.independent}</p>
          </div>

          {phase === 'failed' && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-danger-subtle px-3 py-2 text-sm text-text-primary">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger-default" aria-hidden="true" />
              {bs.library.failed}
            </p>
          )}
        </fieldset>
      )}
    </SidePanel>
  );
}

