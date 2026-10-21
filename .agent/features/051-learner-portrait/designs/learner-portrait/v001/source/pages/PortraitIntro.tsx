import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, ClockIcon, CoinsIcon, GiftIcon, MessageCircleIcon, PencilIcon } from 'lucide-react';
import { Button } from '../components/Button';
import { InlineAlert } from '../components/InlineAlert';
import { DataUseDetails } from '../components/portrait/DataUseDetails';
import { usePrototype } from '../contexts/PrototypeContext';
import { expiryDate } from '../utils/dates';

export function PortraitIntro() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { costMode, credits, aiStatus, interview, portrait, startInterview, discardInterview } = usePrototype();
  const isUpdate = params.get('mode') === 'update' && Boolean(portrait);

  const start = () => {
    startInterview(isUpdate ? 'update' : 'new');
    navigate('/portrait/interview');
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Button variant="ghost" size="compact" leadingIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={() => navigate(-1)}>
        Back
      </Button>
      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-primary-default">Learner portrait</p>
      <h1 className="mt-2 text-2xl font-semibold leading-tight text-text-primary sm:text-3xl">
        {isUpdate ? 'Update your portrait through the interview' : 'Let’s discover what helps you learn'}
      </h1>
      <div className="mt-4 space-y-3 text-base leading-relaxed text-text-primary">
        <p>This optional interview takes about 3–5 minutes. You can skip questions, pause, or review your portrait early.</p>
        <p>
          We’ll ask about your languages, goals, and learning preferences—not diagnose conditions or test your ability. You’ll review everything before saving, and choose separately whether chats use your portrait.
        </p>
        {isUpdate && (
          <p className="text-text-secondary">
            Starting this update lets the interviewer read your approved portrait, even if chats don’t use it. It can’t approve changes or turn on personalization for you.
          </p>
        )}
      </div>

      <ul className="mt-6 space-y-3">
        <li className="flex items-start gap-3 rounded-xl bg-background-subtle p-4">
          {costMode === 'paid' ? (
            <CoinsIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
          ) : (
            <GiftIcon className="mt-0.5 h-5 w-5 shrink-0 text-success-default" aria-hidden="true" />
          )}
          <p className="text-sm text-text-primary">
            {costMode === 'paid'
              ? `AI responses use credits under your current settings. You have ${credits} credits.`
              : 'This interview is currently free; it won’t use your credits.'}
          </p>
        </li>
        <li className="flex items-start gap-3 rounded-xl bg-background-subtle p-4">
          <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
          <p className="text-sm text-text-primary">
            Unfinished interviews expire after 14 days of inactivity. Approving your portrait or discarding the interview removes its transcript.
          </p>
        </li>
      </ul>

      {aiStatus === 'unavailable' && (
        <div className="mt-4">
          <InlineAlert tone="warning" title="The interviewer may be unavailable right now">
            You can still start and skip questions, or fill in your portrait yourself — that never needs an AI response.
          </InlineAlert>
        </div>
      )}
      {costMode === 'paid' && credits < 1 && (
        <div className="mt-4">
          <InlineAlert
            tone="warning"
            title="Not enough credits for interviewer responses"
            actions={
              <Button size="compact" variant="secondary" onClick={() => navigate('/settings/credits')}>
                Go to credit settings
              </Button>
            }
          >
            Filling it in yourself is always free.
          </InlineAlert>
        </div>
      )}

      <div className="mt-6">
        <DataUseDetails />
      </div>

      {interview ? (
        <div className="mt-6 rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6">
          <h2 className="font-semibold text-text-primary">You already have an unfinished interview</h2>
          <p className="mt-1 text-sm text-text-secondary">
            One interview at a time. It expires on {expiryDate(interview.lastActivityAt)} if there’s no activity.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => navigate('/portrait/interview')}>Resume interview</Button>
            <Button variant="secondary" onClick={() => navigate('/portrait/review')}>
              Review draft
            </Button>
            <Button variant="ghost" onClick={discardInterview}>
              Discard and start over
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button size="large" leadingIcon={<MessageCircleIcon className="h-5 w-5" />} onClick={start}>
            Start interview
          </Button>
          <Button size="large" variant="secondary" leadingIcon={<PencilIcon className="h-5 w-5" />} onClick={() => navigate('/portrait/manual')}>
            Fill it in myself
          </Button>
          <Button size="large" variant="ghost" onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}

