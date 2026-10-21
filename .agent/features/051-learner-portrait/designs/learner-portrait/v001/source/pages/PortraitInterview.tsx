import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MessageCircleIcon } from 'lucide-react';
import { Button } from '../components/Button';
import { Dialog, DialogActions } from '../components/Dialog';
import { InlineAlert } from '../components/InlineAlert';
import { DraftPreviewPanel, DraftPreviewSheet } from '../components/interview/DraftPreview';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { InterviewComposer } from '../components/interview/InterviewComposer';
import { InterviewHeader } from '../components/interview/InterviewHeader';
import { InterviewTranscript } from '../components/interview/InterviewTranscript';
import { QuestionCard } from '../components/interview/QuestionCard';
import { useInterviewEngine } from '../components/interview/useInterviewEngine';
import { ConflictPanel } from '../components/portrait/ConflictPanel';
import { usePrototype } from '../contexts/PrototypeContext';
import { countItems } from '../utils/portraitItems';
import { expiryDate } from '../utils/dates';

export function PortraitInterview() {
  const navigate = useNavigate();
  const { interview, costMode, credits, showToast, expiredOn } = usePrototype();
  const engine = useInterviewEngine();
  const [previewOpen, setPreviewOpen] = useState(false);
  // Staged intro: on a brand-new interview, reveal the opening messages one at a
  // time with a typing indicator, then the question form. Resumed interviews show at once.
  const isFreshStart = useRef(Boolean(interview && interview.messages.every((m) => m.role === 'interviewer')));
  const introTotal = useRef(interview?.messages.length ?? 0).current;
  const [revealed, setRevealed] = useState(isFreshStart.current ? 0 : Number.POSITIVE_INFINITY);
  const [introTyping, setIntroTyping] = useState(isFreshStart.current);

  useEffect(() => {
    if (!isFreshStart.current) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(Number.POSITIVE_INFINITY);
      setIntroTyping(false);
      return undefined;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    for (let i = 1; i <= introTotal; i += 1) {
      t += i === 1 ? 700 : 900;
      timers.push(setTimeout(() => setRevealed(i), t));
      if (i < introTotal) {
        timers.push(setTimeout(() => setIntroTyping(false), t));
        timers.push(setTimeout(() => setIntroTyping(true), t + 250));
      }
    }
    timers.push(setTimeout(() => setIntroTyping(false), t));
    timers.push(setTimeout(() => setRevealed(Number.POSITIVE_INFINITY), t + 450));
    return () => timers.forEach(clearTimeout);
  }, [introTotal]);

  const introDone = revealed === Number.POSITIVE_INFINITY;
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const questionRef = useRef<HTMLDivElement>(null);
  const msgCount = interview?.messages.length ?? 0;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    questionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [msgCount, engine.generating]);

  if (!interview) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-background-canvas p-4">
        <div className="w-full max-w-md rounded-2xl border border-border-default bg-background-surface p-6 text-center">
          <MessageCircleIcon className="mx-auto h-8 w-8 text-text-tertiary" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-text-primary">{expiredOn ? 'This interview expired' : 'No interview in progress'}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {expiredOn
              ? 'After 14 days without activity, the transcript and working draft were removed. Any saved portrait is unchanged.'
              : 'Start a new interview, or fill in your portrait yourself.'}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate('/portrait/intro')}>{expiredOn ? 'Start again' : 'Start interview'}</Button>
            <Button variant="secondary" onClick={() => navigate('/portrait')}>
              Back to portrait
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const pause = () => {
    navigate('/portrait');
    showToast({ variant: 'info', title: 'Interview paused', description: `Resume on any device until ${expiryDate(interview.lastActivityAt)}.` });
  };
  const review = () => navigate('/portrait/review');
  const busy = Boolean(engine.generating);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background-canvas text-text-primary">
      <InterviewHeader
        interview={interview}
        reviewCount={countItems(interview.draft)}
        onExit={pause}
        onPause={pause}
        onReview={review}
        onLanguage={engine.switchLanguage}
        busy={busy}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen((v) => !v)}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-1 justify-center gap-6 px-4 pt-6">
        <motion.main layout="position" transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="flex w-full min-w-0 max-w-3xl flex-1 flex-col gap-4">
          {interview.mode === 'update' && (
            <InlineAlert tone="info" title="The interviewer can read your saved portrait for this update">
              It still can’t save changes or turn on personalization for you. Your saved portrait stays active until you approve the update.
            </InlineAlert>
          )}
          {interview.conflict && <ConflictPanel />}
          {costMode === 'paid' && credits < 1 && (
            <InlineAlert
              tone="warning"
              title="You’re out of credits"
              actions={
                <Button size="compact" variant="secondary" onClick={() => navigate('/settings/credits')}>
                  Go to credit settings
                </Button>
              }
            >
              Interviewer responses need credits. You can still skip questions, review, edit, and save your portrait without them.
            </InlineAlert>
          )}
          <InterviewTranscript
            interview={interview}
            generating={engine.generating}
            currentCost={costMode}
            onRetry={engine.retry}
            hasRetry={engine.hasRetry}
            onStop={engine.stop}
            onPause={pause}
            onFocusQuestion={() => questionRef.current?.querySelector<HTMLElement>('button, input')?.focus()}
            visibleCount={introDone ? undefined : revealed}
            introTyping={introTyping}
          />
          <div ref={questionRef} className="scroll-mt-24">
            <AnimatePresence mode="wait" initial={false}>
              {!busy && introDone && (
                <motion.div
                  key="question"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                >
                  <QuestionCard interview={interview} engine={engine} busy={busy} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="sticky bottom-0 z-10 -mx-4 mt-auto bg-background-canvas px-4 pb-4 pt-2">
            <InterviewComposer disabled={busy} onSend={engine.sendChat} />
          </div>
        </motion.main>
        {isDesktop && <DraftPreviewPanel open={previewOpen} interview={interview} onReview={review} onClose={() => setPreviewOpen(false)} />}
      </div>
      {!isDesktop && <DraftPreviewSheet open={previewOpen} interview={interview} onReview={review} onClose={() => setPreviewOpen(false)} />}

      <Dialog
        open={engine.costNotice}
        onClose={engine.cancelCostNotice}
        title="Interviewer responses now use credits"
        description="AI responses use credits under your current settings."
        size="sm"
        footer={
          <DialogActions>
            <Button variant="secondary" onClick={engine.cancelCostNotice}>
              Not now
            </Button>
            <Button onClick={engine.confirmCostNotice}>Continue with credits</Button>
          </DialogActions>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          This interview was free until now. The next response will use about 1 credit (you have {credits}). Responses that already started keep the policy they began with. Skipping, editing, and saving stay free.
        </p>
      </Dialog>
    </div>
  );
}

