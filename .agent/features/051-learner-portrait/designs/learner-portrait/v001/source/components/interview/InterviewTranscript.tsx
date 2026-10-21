import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LibraryIcon, PauseIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { AiTutorMessage } from '../AiTutorMessage';
import { Button } from '../Button';
import { InlineAlert } from '../InlineAlert';
import { UserMessage } from '../UserMessage';
import { ProposalCard } from '../portrait/ProposalCard';
import type { CostMode, Interview, InterviewMessage } from '../../types/portrait';

interface InterviewTranscriptProps {
  interview: Interview;
  generating: { cost: CostMode } | null;
  currentCost: CostMode;
  onRetry: (id: string) => void;
  hasRetry: (id: string) => boolean;
  onStop: () => void;
  onPause: () => void;
  onFocusQuestion: () => void;
  /** Limits how many messages are shown (used for the staged intro). */
  visibleCount?: number;
  /** Shows a typing indicator between staged intro messages. */
  introTyping?: boolean;
}

export function InterviewTranscript({ interview, generating, currentCost, onRetry, hasRetry, onStop, onPause, onFocusQuestion, visibleCount, introTyping }: InterviewTranscriptProps) {
  const navigate = useNavigate();

  const renderSystem = (m: InterviewMessage) => {
    if (m.kind === 'notice') {
      return <p className="px-2 text-center text-xs text-text-tertiary">{m.text}</p>;
    }
    if (m.resolved) {
      return <p className="px-2 text-center text-xs text-text-tertiary">Retried · {m.time}</p>;
    }
    if (m.kind === 'stopped') {
      return (
        <InlineAlert
          tone="info"
          title="Stopped"
          actions={
            hasRetry(m.id) ? (
              <Button size="compact" variant="secondary" leadingIcon={<RotateCcwIcon className="h-4 w-4" />} onClick={() => onRetry(m.id)} disabled={Boolean(generating)}>
                Ask again
              </Button>
            ) : undefined
          }
        >
          {m.text}
        </InlineAlert>
      );
    }
    const titles = {
      unavailable: 'Interviewer unavailable',
      offline: 'Connection lost',
      interrupted: 'Response interrupted',
      context: 'Interview limit reached',
      credits: 'Not enough credits',
    } as const;
    const kind = m.errorKind ?? 'unavailable';
    return (
      <InlineAlert
        tone={kind === 'credits' || kind === 'context' ? 'warning' : 'error'}
        title={titles[kind]}
        actions={
          <div className="flex flex-wrap gap-2">
            {kind === 'credits' && (
              <Button size="compact" onClick={() => navigate('/settings/credits')}>
                Go to credit settings
              </Button>
            )}
            {kind === 'context' ? (
              <>
                <Button size="compact" onClick={() => navigate('/portrait/review')}>
                  Review draft
                </Button>
                <Button size="compact" variant="secondary" onClick={() => navigate('/portrait/review?restart=1')}>
                  Start a new interview
                </Button>
              </>
            ) : (
              <>
                <Button size="compact" variant={kind === 'credits' ? 'secondary' : 'primary'} leadingIcon={<RotateCcwIcon className="h-4 w-4" />} onClick={() => onRetry(m.id)} disabled={Boolean(generating) || !hasRetry(m.id)}>
                  Try again
                </Button>
                <Button size="compact" variant="ghost" onClick={() => navigate('/portrait/review')}>
                  Edit draft by hand
                </Button>
              </>
            )}
          </div>
        }
      >
        {m.text}
      </InlineAlert>
    );
  };

  const renderMessage = (m: InterviewMessage) => {
        if (m.role === 'system') return renderSystem(m);
        if (m.role === 'user') {
          return (
            <div role="list">
              <UserMessage text={m.text} timestamp={m.time} status={m.status ?? 'sent'} />
            </div>
          );
        }
        const proposal = m.proposalId ? interview.proposals.find((p) => p.id === m.proposalId) : undefined;
        return (
          <div className="space-y-2">
            <AiTutorMessage tutorName="Interviewer" message={m.text} timestamp={m.costTag ? `${m.time} · ${m.costTag}` : m.time} />
            {m.kind === 'proposal' && (
              <div className="pl-0 sm:pl-12">
                {proposal ? (
                  <ProposalCard proposal={proposal} />
                ) : (
                  <p className="text-xs text-text-tertiary">This proposal was added to your draft or dismissed.</p>
                )}
              </div>
            )}
            {m.kind === 'redirect' && (
              <div className="flex flex-wrap gap-2 sm:pl-12">
                <Button size="compact" onClick={onFocusQuestion}>
                  Continue interview
                </Button>
                <Button size="compact" variant="secondary" leadingIcon={<PauseIcon className="h-4 w-4" />} onClick={onPause}>
                  Pause
                </Button>
                <Button size="compact" variant="ghost" leadingIcon={<LibraryIcon className="h-4 w-4" />} onClick={() => navigate('/knowledge')}>
                  Go to Knowledge
                </Button>
              </div>
            )}
          </div>
        );
  };

  const shown = typeof visibleCount === 'number' ? interview.messages.slice(0, visibleCount) : interview.messages;

  return (
    <div role="log" aria-live="polite" aria-label="Interview conversation" className="space-y-4">
      <AnimatePresence initial={false}>
        {shown.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
          >
            {renderMessage(m)}
          </motion.div>
        ))}
        {introTyping && !generating && (
          <motion.div key="intro-typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <AiTutorMessage tutorName="Interviewer" status="typing" />
          </motion.div>
        )}
      </AnimatePresence>
      {generating && (
        <div className="space-y-2">
          <AiTutorMessage tutorName="Interviewer" status="typing" />
          <div className="flex flex-wrap items-center gap-3 sm:pl-12">
            <Button size="compact" variant="secondary" leadingIcon={<SquareIcon className="h-4 w-4" />} onClick={onStop}>
              Stop
            </Button>
            <span className="text-xs text-text-tertiary">
              {generating.cost === 'free'
                ? currentCost === 'paid'
                  ? 'Started while free — this response won’t use credits.'
                  : 'Free response'
                : 'Uses 1 credit'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

