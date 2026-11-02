import React, { useRef, useState } from 'react';
import { ArrowLeftIcon, BoldIcon, CheckCircle2Icon, EyeIcon, ItalicIcon, ListIcon, PencilIcon, QuoteIcon } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { NoteCategory } from '../../types/tutor';
import { Button } from '../Button';
import { Badge } from '../Badge';
import { Input } from '../Input';
import { InlineAlert } from '../InlineAlert';
import { RichBlocks } from './RichBlocks';
import { markdownToBlocks } from '../../utils/richText';
import { useTutorContext } from '../../contexts/TutorContext';

const CATEGORIES: NoteCategory[] = ['Grammar', 'Vocabulary & meaning', 'Usage & register', 'Pronunciation', 'Etymology', 'Culture', 'Learning tips'];
const LANGUAGES = ['French', 'English', 'Spanish', 'German', 'Italian', 'Arabic', 'Japanese'];

const fieldClass =
  'w-full rounded-xl border border-border-default bg-background-surface px-3 py-2 text-sm leading-6 text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100';

export function NoteEditor() {
  const { tutor, platform, onOpenNote } = useTutorContext();
  const [preview, setPreview] = useState(false);
  const [compare, setCompare] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const draft = tutor.state.editorDraftId ? tutor.state.drafts[tutor.state.editorDraftId] : undefined;
  const touch = platform === 'mobile';
  const size = touch ? 'default' : 'compact';

  if (!draft) return null;
  const target = draft.targetNoteId ? tutor.state.notes[draft.targetNoteId] : undefined;
  const update = (patch: Parameters<typeof tutor.updateDraft>[1]) => tutor.updateDraft(draft.id, patch);
  const titleMissing = !draft.title.trim();
  const saving = draft.status === 'saving';
  const back = () => tutor.setView('chat');

  const wrap = (before: string, after = before) => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    update({ body: next });
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, e + before.length);
    });
  };

  if (draft.status === 'saved') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <CheckCircle2Icon className="h-8 w-8 text-success-default" aria-hidden="true" />
        <h3 className="mt-3 text-base font-semibold text-text-primary" role="status">
          {draft.mode === 'update' ? 'Note updated' : 'Saved to Knowledge'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-text-secondary">“{draft.title}” is now a learning note you can review on its own.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size={size} onClick={() => draft.savedNoteId && onOpenNote(draft.savedNoteId)}>
            Open in Knowledge
          </Button>
          <Button size={size} variant="secondary" onClick={back}>
            Back to chat
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border-default px-3 py-2">
        <Button variant="ghost" size={size} leadingIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={back}>
          Back to chat
        </Button>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-text-tertiary sm:inline" aria-live="polite">
            Draft kept {formatDistanceToNowStrict(draft.localSavedAt, { addSuffix: true })}
          </span>
          <Badge tone="info" size="sm">
            {draft.mode === 'update' ? 'Draft update' : 'Draft'}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {draft.conflict && target && (
          <InlineAlert
            tone="warning"
            title="This note changed after the draft was made"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button size={size} variant="secondary" onClick={() => setCompare((c) => !c)}>
                  {compare ? 'Hide comparison' : 'Compare with latest'}
                </Button>
                <Button size={size} variant="secondary" onClick={() => tutor.saveDraftAsNew(draft.id)}>
                  Save as new note instead
                </Button>
              </div>
            }
          >
            {target.lastEdit ?? 'It was edited elsewhere.'} Your draft is kept, and nothing will overwrite the newer version.
          </InlineAlert>
        )}
        {compare && target && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Latest saved', title: target.title, summary: target.summary, body: target.body },
              { label: 'Your draft', title: draft.title, summary: draft.summary, body: draft.body },
            ].map((v) => (
              <section key={v.label} className="rounded-xl border border-border-default p-3 text-sm leading-6">
                <h4 className="text-xs font-medium text-text-tertiary">{v.label}</h4>
                <p className="mt-1 font-semibold text-text-primary">{v.title}</p>
                <p className="mt-1 text-text-secondary">{v.summary}</p>
                <div className="mt-2 border-t border-border-default pt-2 text-text-primary">
                  <RichBlocks blocks={markdownToBlocks(v.body)} />
                </div>
              </section>
            ))}
          </div>
        )}
        {draft.status === 'failed' && (
          <InlineAlert
            tone="error"
            title="Couldn’t save to Knowledge"
            actions={
              <Button size={size} variant="secondary" onClick={() => tutor.saveDraft(draft.id)}>
                Try saving again
              </Button>
            }
          >
            Your edits are kept in this draft. Check your connection and try again.
          </InlineAlert>
        )}

        <Input
          label="Title"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          error={titleMissing ? 'Add a title to save this note.' : undefined}
        />

        <div>
          <label htmlFor="draft-summary" className="text-sm font-medium text-text-primary">
            Short summary
          </label>
          <textarea id="draft-summary" rows={2} value={draft.summary} onChange={(e) => update({ summary: e.target.value })} className={`mt-1 resize-none ${fieldClass}`} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="draft-body" className="text-sm font-medium text-text-primary">
              Explanation and examples
            </label>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              aria-pressed={preview}
              className={`inline-flex items-center gap-1 rounded-md px-1.5 text-xs font-medium text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-7'}`}
            >
              {preview ? <PencilIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="mt-1 rounded-xl border border-border-default px-3 py-3 text-sm leading-6 text-text-primary">
              <RichBlocks blocks={markdownToBlocks(draft.body)} />
            </div>
          ) : (
            <div className="mt-1 rounded-xl border border-border-default focus-within:border-border-focus focus-within:ring-2 focus-within:ring-primary-100">
              <div className="flex gap-0.5 border-b border-border-default p-1" role="toolbar" aria-label="Formatting">
                {[
                  { icon: BoldIcon, label: 'Bold', run: () => wrap('**') },
                  { icon: ItalicIcon, label: 'Italic', run: () => wrap('*') },
                  { icon: ListIcon, label: 'List item', run: () => wrap('\n- ', '') },
                  { icon: QuoteIcon, label: 'Example with translation', run: () => wrap('\n> ', ' — translation') },
                ].map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    aria-label={t.label}
                    title={t.label}
                    onClick={t.run}
                    className={`inline-flex items-center justify-center rounded-md text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}
                  >
                    <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <textarea
                id="draft-body"
                ref={bodyRef}
                rows={7}
                value={draft.body}
                onChange={(e) => update({ body: e.target.value })}
                className="block w-full resize-y bg-transparent px-3 py-2 font-mono text-xs leading-6 text-text-primary focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'studied', label: 'Language studied', value: draft.studiedLanguage, key: 'studiedLanguage' as const },
            { id: 'explained', label: 'Explanation language', value: draft.explanationLanguage, key: 'explanationLanguage' as const },
          ].map((f) => (
            <div key={f.id}>
              <label htmlFor={`draft-${f.id}`} className="text-sm font-medium text-text-primary">
                {f.label}
              </label>
              <select id={`draft-${f.id}`} value={f.value} onChange={(e) =>
                  update(f.key === 'studiedLanguage' ? { studiedLanguage: e.target.value } : { explanationLanguage: e.target.value })
                } className={`mt-1 ${touch ? 'h-11' : 'h-10'} ${fieldClass} py-0`}>
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-text-primary">Categories</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const on = draft.categories.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ categories: on ? draft.categories.filter((x) => x !== c) : [...draft.categories, c] })}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-8'} ${on ? 'border-primary-default bg-primary-subtle text-primary-default' : 'border-border-default text-text-secondary hover:bg-background-subtle'}`}
                >
                  {on && <CheckCircle2Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {c}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="border-t border-border-default px-4 py-3">
        <p className="text-xs text-text-tertiary">
          Creating this draft used {draft.creditsUsed} credits. Editing and saving are free.
        </p>
        {draft.conflict && <p className="mt-1 text-xs text-warning-default">Resolve the newer version before updating this note.</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size={size} onClick={() => tutor.discardDraft(draft.id)} disabled={saving}>
            Discard draft
          </Button>
          <Button size={size} loading={saving} disabled={titleMissing || draft.conflict} onClick={() => tutor.saveDraft(draft.id)}>
            {draft.mode === 'update' ? 'Update note' : 'Save to Knowledge'}
          </Button>
        </div>
      </div>
    </div>
  );
}

