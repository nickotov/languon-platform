import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownIcon } from 'lucide-react';
import type { AssistantMsg, Conversation, SourceInfo } from '../../types/tutor';
import { AssistantMessage } from './AssistantMessage';
import { UserBubble } from './UserBubble';
import { DraftCard } from './DraftCard';
import { EmptyState } from './EmptyState';
import { useTutorContext } from '../../contexts/TutorContext';

const scrollMemory = new Map<string, number>();
const NEAR = 56;

function nearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
}

function selectionInside(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  return el.contains(sel.getRangeAt(0).commonAncestorContainer);
}

interface MessageListProps {
  conversation: Conversation;
  source: SourceInfo;
}

export function MessageList({ conversation, source }: MessageListProps) {
  const { tutor } = useTutorContext();
  const ref = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const lastToken = useRef(tutor.state.scrollToken);
  const [showJump, setShowJump] = useState(false);
  const busy = tutor.state.streaming !== null;
  const streamingHere = tutor.state.streaming?.conversationId === conversation.id;

  const last = conversation.messages[conversation.messages.length - 1];
  const signature = `${conversation.messages.length}:${last && last.role === 'assistant' ? `${last.revealed}:${last.status}:${last.activityIndex}` : ''}`;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = scrollMemory.get(conversation.id);
    if (saved !== undefined) {
      el.scrollTop = saved;
      follow.current = nearBottom(el);
    } else {
      el.scrollTop = el.scrollHeight;
      follow.current = true;
    }
    setShowJump(!follow.current && streamingHere);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (tutor.state.scrollToken !== lastToken.current) {
      lastToken.current = tutor.state.scrollToken;
      follow.current = true;
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
      return;
    }
    if (follow.current && !selectionInside(el)) {
      el.scrollTop = el.scrollHeight;
    } else if (!nearBottom(el)) {
      setShowJump(true);
    }
  }, [signature, tutor.state.scrollToken]);

  useEffect(() => {
    const onSelection = () => {
      const el = ref.current;
      if (el && selectionInside(el)) follow.current = false;
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = nearBottom(el);
    follow.current = near && !selectionInside(el);
    if (near) setShowJump(false);
    scrollMemory.set(conversation.id, el.scrollTop);
  }, [conversation.id]);

  const jump = () => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    follow.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    setShowJump(false);
  };

  const draftFor = (msg: AssistantMsg) => {
    const idx = conversation.messages.indexOf(msg);
    return conversation.messages.slice(idx + 1).some((m) => m.role === 'assistant' && m.kind === 'draft');
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={onScroll}
        role="log"
        aria-label={`Conversation: ${conversation.title}`}
        aria-live="off"
        aria-busy={streamingHere}
        tabIndex={0}
        className="h-full overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
      >
        {conversation.messages.length === 0 ? (
          <EmptyState source={source} />
        ) : (
          <div className="space-y-5">
            {conversation.messages.map((m) => {
              if (m.role === 'user') return <UserBubble key={m.id} msg={m} />;
              if (m.role === 'divider')
                return (
                  <div key={m.id} role="separator" className="flex items-center gap-3 text-xs text-text-tertiary">
                    <span className="h-px flex-1 bg-border-default" />
                    {m.label}
                    <span className="h-px flex-1 bg-border-default" />
                  </div>
                );
              if (m.role === 'draft') return <DraftCard key={m.id} draftId={m.draftId} />;
              return (
                <AssistantMessage
                  key={m.id}
                  msg={m}
                  busy={busy}
                  isNoteSource={source.kind === 'note'}
                  hasDraft={m.kind === 'answer' && draftFor(m)}
                />
              );
            })}
          </div>
        )}
      </div>
      {showJump && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={jump}
            className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border-default bg-background-elevated px-3.5 text-xs font-medium text-text-primary shadow-md hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <ArrowDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Jump to latest
          </button>
        </div>
      )}
    </div>
  );
}

