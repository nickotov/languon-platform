import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightLeftIcon } from 'lucide-react';
import { TutorHeader } from './TutorHeader';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { HistoryView } from './HistoryView';
import { NoteEditor } from './NoteEditor';
import { Button } from '../Button';
import { getSourceInfo } from '../../data/sources';
import { useTutorContext } from '../../contexts/TutorContext';
import type { AssistantMsg } from '../../types/tutor';

interface TutorBodyProps {
  onFold: () => void;
  onHeaderPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function TutorBody({ onFold, onHeaderPointerDown }: TutorBodyProps) {
  const { tutor, ui, platform } = useTutorContext();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const conv = tutor.active;
  const source = getSourceInfo(conv.sourceId, tutor.state.notes);
  const pageSource = getSourceInfo(ui.page, tutor.state.notes);
  const mismatch = conv.sourceId !== ui.page && !conv.mismatchDismissed && conv.messages.length > 0;
  const size = platform === 'mobile' ? 'default' : 'compact';

  useEffect(() => setConfirmDelete(false), [conv.id]);

  return (
    <>
      <TutorHeader
        conversation={conv}
        source={source}
        pageSourceId={ui.page}
        onFold={onFold}
        onRequestDelete={() => {
          tutor.setView('chat');
          setConfirmDelete(true);
        }}
        onPointerDown={onHeaderPointerDown}
      />

      {tutor.state.view === 'history' && <HistoryView pageSourceId={ui.page} />}
      {tutor.state.view === 'editor' && <NoteEditor />}
      {tutor.state.view === 'chat' && (
        <>
          {confirmDelete && (
            <div role="alertdialog" aria-labelledby="del-title" className="border-b border-border-default bg-danger-subtle px-4 py-3">
              <p id="del-title" className="text-sm font-medium text-text-primary">
                Delete this conversation?
              </p>
              <p className="mt-0.5 text-xs leading-5 text-text-secondary">Knowledge notes you saved from it stay in Knowledge.</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="danger"
                  size={size}
                  onClick={() => {
                    tutor.deleteConversation(conv.id, ui.page);
                    setConfirmDelete(false);
                  }}
                >
                  Delete
                </Button>
                <Button variant="ghost" size={size} autoFocus onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {mismatch && (
            <div className="flex items-start gap-2.5 border-b border-border-default bg-background-subtle px-4 py-2.5">
              <ArrowRightLeftIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              <div className="min-w-0 flex-1 text-xs leading-5 text-text-secondary">
                <p>
                  This conversation is about <span lang="fr" className="font-medium text-text-primary">“{source.title}”</span>. You’re now viewing{' '}
                  <span lang="fr" className="font-medium text-text-primary">“{pageSource.title}”</span>.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button size={size} variant="secondary" onClick={() => tutor.openForSource(ui.page)}>
                    Switch to this page
                  </Button>
                  <Button size={size} variant="ghost" onClick={tutor.dismissMismatch}>
                    Keep this conversation
                  </Button>
                </div>
              </div>
            </div>
          )}
          <MessageList conversation={conv} source={source} />
          <Composer conversation={conv} source={source} />
        </>
      )}
      <LiveAnnouncer />
    </>
  );
}

function LiveAnnouncer() {
  const { tutor } = useTutorContext();
  const [message, setMessage] = useState('');
  const conv = tutor.active;
  const last = [...conv.messages].reverse().find((m) => m.role === 'assistant') as AssistantMsg | undefined;
  const status = last?.status;
  const prev = useRef(status);

  useEffect(() => {
    if (status === prev.current) return;
    prev.current = status;
    const map: Record<string, string> = {
      preparing: 'Tutor is preparing an answer.',
      reconnecting: 'Connection lost. Reconnecting.',
      done: last?.kind === 'draft' ? 'Knowledge draft ready to review.' : 'Answer ready.',
      failed: 'Answer incomplete. Retry is available.',
      stopped: 'Answer stopped.',
    };
    if (status && map[status]) setMessage(map[status]);
  }, [status, last?.kind]);

  return (
    <div className="sr-only" role="status" aria-live="polite">
      {message}
    </div>
  );
}

