import React, { useState } from 'react';
import { ArrowLeftIcon, MessageSquareIcon, SquarePenIcon, Trash2Icon } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { Conversation } from '../../types/tutor';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { getSourceInfo } from '../../data/sources';
import { useTutorContext } from '../../contexts/TutorContext';

export function HistoryView({ pageSourceId }: { pageSourceId: string }) {
  const { tutor, platform } = useTutorContext();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const touch = platform === 'mobile';
  const sorted = [...tutor.state.conversations]
    .filter((c) => c.messages.length > 0 || c.id === tutor.state.activeId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const here = sorted.filter((c) => c.sourceId === pageSourceId);
  const elsewhere = sorted.filter((c) => c.sourceId !== pageSourceId);
  const pageTitle = getSourceInfo(pageSourceId, tutor.state.notes).title;

  const row = (c: Conversation) => {
    const active = c.id === tutor.state.activeId;
    const src = getSourceInfo(c.sourceId, tutor.state.notes);
    if (confirmId === c.id) {
      return (
        <li key={c.id} className="rounded-xl border border-danger-200 bg-danger-subtle p-3">
          <p className="text-sm font-medium text-text-primary">Delete “{c.title}”?</p>
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">
            The conversation is removed. Knowledge notes you saved from it stay in Knowledge.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button
              variant="danger"
              size={touch ? 'default' : 'compact'}
              onClick={() => {
                tutor.deleteConversation(c.id, pageSourceId);
                setConfirmId(null);
              }}
            >
              Delete
            </Button>
            <Button variant="ghost" size={touch ? 'default' : 'compact'} onClick={() => setConfirmId(null)} autoFocus>
              Cancel
            </Button>
          </div>
        </li>
      );
    }
    return (
      <li key={c.id} className={`group flex items-center gap-1 rounded-xl ${active ? 'bg-primary-subtle' : 'hover:bg-background-subtle'}`}>
        <button
          type="button"
          onClick={() => tutor.switchConversation(c.id)}
          aria-current={active ? 'true' : undefined}
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <MessageSquareIcon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-primary-default' : 'text-text-tertiary'}`} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-text-primary">{c.title}</span>
            <span className="block truncate text-xs text-text-tertiary">
              {c.sourceId !== pageSourceId && `${src.title} · `}
              {formatDistanceToNowStrict(c.updatedAt, { addSuffix: true })} · {c.messages.filter((m) => m.role === 'user').length} questions
            </span>
          </span>
        </button>
        <IconButton
          icon={<Trash2Icon />}
          label={`Delete conversation “${c.title}”`}
          variant="ghost"
          size={touch ? 'lg' : 'sm'}
          showTooltip={false}
          onClick={() => setConfirmId(c.id)}
          className="mr-1 shrink-0"
        />
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border-default px-3 py-2">
        <Button variant="ghost" size={touch ? 'default' : 'compact'} leadingIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={() => tutor.setView('chat')}>
          Back to chat
        </Button>
        <Button variant="secondary" size={touch ? 'default' : 'compact'} leadingIcon={<SquarePenIcon className="h-4 w-4" />} onClick={() => tutor.newConversation(pageSourceId)}>
          New
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <h3 className="px-2 pb-1.5 text-xs font-medium text-text-tertiary">This page · {pageTitle}</h3>
        {here.length ? (
          <ul className="space-y-0.5">{here.map(row)}</ul>
        ) : (
          <p className="px-2 py-2 text-sm text-text-secondary">No conversations about this page yet.</p>
        )}
        {elsewhere.length > 0 && (
          <>
            <h3 className="px-2 pb-1.5 pt-4 text-xs font-medium text-text-tertiary">Other pages</h3>
            <ul className="space-y-0.5">{elsewhere.map(row)}</ul>
          </>
        )}
      </div>
    </div>
  );
}

