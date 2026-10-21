import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, SaveIcon } from 'lucide-react';
import { Button } from '../components/Button';
import { InlineAlert } from '../components/InlineAlert';
import { PortraitEditor } from '../components/portrait/PortraitEditor';
import { SummaryPanel } from '../components/portrait/SummaryPanel';
import { UpdateDiff } from '../components/portrait/UpdateDiff';
import { usePrototype } from '../contexts/PrototypeContext';
import type { PortraitItems } from '../types/portrait';
import { cloneItems, diffItems, emptyItems, invalidFieldCount, isMeaningful } from '../utils/portraitItems';

export function PortraitManual() {
  const navigate = useNavigate();
  const { portrait, savePortrait, interfaceLanguage } = usePrototype();
  const [items, setItems] = useState<PortraitItems>(() => (portrait ? cloneItems(portrait.items) : emptyItems()));
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const isEdit = Boolean(portrait);
  const diff = useMemo(() => (portrait ? diffItems(portrait.items, items) : []), [portrait, items]);
  const invalid = invalidFieldCount(items);
  const meaningful = isMeaningful(items);
  const unchanged = isEdit && diff.length === 0;
  const language = portrait?.summaryLanguage ?? interfaceLanguage;

  const save = async () => {
    if (!meaningful || invalid || unchanged) return;
    setState('saving');
    const ok = await savePortrait(items, { summaryLanguage: language, fromInterview: false });
    if (ok) navigate(`/portrait?saved=${isEdit ? 'update' : 'first'}`);
    else setState('error');
  };

  const blocker = !meaningful
    ? 'Nothing to save yet — add at least one item.'
    : invalid
      ? `Fix ${invalid} field${invalid === 1 ? '' : 's'} before saving.`
      : unchanged
        ? 'No changes to save.'
        : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:pb-10">
      <Button variant="ghost" size="compact" leadingIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={() => (isEdit ? navigate('/portrait') : navigate(-1))}>
        {isEdit ? 'Back to portrait' : 'Back'}
      </Button>
      <header className="mt-4 max-w-2xl">
        <h1 className="text-2xl font-semibold text-text-primary">{isEdit ? 'Edit portrait details' : 'Fill in your portrait'}</h1>
        <p className="mt-2 text-base text-text-secondary">
          Add, correct, or remove anything. The summary updates as you go. Editing and saving here never need an AI response or credits.
        </p>
        {isEdit && portrait && (
          <p className="mt-2 text-sm text-text-secondary">
            Saving keeps your current choice: {portrait.useEnabled ? 'chats use your portrait.' : 'chats don’t use your portrait.'}
          </p>
        )}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <PortraitEditor items={items} onChange={setItems} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" aria-label="Summary and save">
          <div id="manual-summary">
            <SummaryPanel items={items} language={language} />
          </div>
          {isEdit && <UpdateDiff entries={diff} />}
          {state === 'error' && (
            <InlineAlert tone="error" title="We couldn’t save your portrait" actions={<Button size="compact" onClick={save}>Try again</Button>}>
              Your edits are still here. Check your connection and try again.
            </InlineAlert>
          )}
          <div className="hidden space-y-2 lg:block">
            <Button fullWidth leadingIcon={<SaveIcon className="h-4 w-4" />} onClick={save} loading={state === 'saving'} disabled={Boolean(blocker)}>
              Save portrait
            </Button>
            {blocker && <p className="text-sm text-text-secondary">{blocker}</p>}
            {!isEdit && <p className="text-xs text-text-tertiary">Saving doesn’t turn on personalization. You’ll choose that separately.</p>}
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border-default bg-background-surface p-3 sm:-mx-6 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <a href="#manual-summary" className="flex min-h-11 flex-1 items-center rounded-xl px-3 text-sm font-medium text-primary-default outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
            {blocker ?? 'See summary'}
          </a>
          <Button onClick={save} loading={state === 'saving'} disabled={Boolean(blocker)}>
            Save portrait
          </Button>
        </div>
      </div>
    </div>
  );
}

