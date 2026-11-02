import React from 'react';
import { CheckCircle2Icon, ExternalLinkIcon, Undo2Icon } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { useTutorContext } from '../../contexts/TutorContext';

export function DraftCard({ draftId }: { draftId: string }) {
  const { tutor, platform, onOpenNote } = useTutorContext();
  const draft = tutor.state.drafts[draftId];
  if (!draft) return null;
  const touch = platform === 'mobile';
  const size = touch ? 'default' : 'compact';

  if (draft.status === 'discarded') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border-default px-3 py-2 text-xs text-text-tertiary">
        <span>Draft “{draft.title}” discarded.</span>
        <Button variant="ghost" size={size} leadingIcon={<Undo2Icon className="h-3.5 w-3.5" />} onClick={() => tutor.restoreDraft(draft.id)}>
          Restore
        </Button>
      </div>
    );
  }

  const statusText =
    draft.status === 'saving'
      ? 'Saving…'
      : draft.status === 'saved'
        ? 'Saved to Knowledge'
        : draft.status === 'failed'
          ? 'Not saved yet · edits kept'
          : `Draft kept · ${formatDistanceToNowStrict(draft.localSavedAt, { addSuffix: true })}`;

  return (
    <section aria-label="Knowledge draft" className="rounded-2xl border border-border-default bg-background-surface p-4">
      <div className="flex items-center justify-between gap-2">
        {draft.status === 'saved' ? (
          <Badge tone="success" size="sm" icon={<CheckCircle2Icon />}>
            Saved
          </Badge>
        ) : (
          <Badge tone="info" size="sm">
            {draft.mode === 'update' ? 'Draft update' : 'Draft'}
          </Badge>
        )}
        <span className="text-xs text-text-tertiary" aria-live="polite">
          {statusText}
        </span>
      </div>
      <h4 className="mt-2.5 text-sm font-semibold text-text-primary">{draft.title}</h4>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">{draft.summary}</p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Categories">
        {draft.categories.map((c) => (
          <li key={c} className="rounded-md bg-background-subtle px-2 py-0.5 text-xs text-text-secondary">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {draft.status === 'saved' && draft.savedNoteId ? (
          <Button variant="secondary" size={size} trailingIcon={<ExternalLinkIcon className="h-3.5 w-3.5" />} onClick={() => onOpenNote(draft.savedNoteId as string)}>
            Open in Knowledge
          </Button>
        ) : (
          <>
            <Button size={size} onClick={() => tutor.openEditor(draft.id)} loading={draft.status === 'saving'}>
              Review and save
            </Button>
            <Button variant="ghost" size={size} onClick={() => tutor.discardDraft(draft.id)} disabled={draft.status === 'saving'}>
              Discard
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

