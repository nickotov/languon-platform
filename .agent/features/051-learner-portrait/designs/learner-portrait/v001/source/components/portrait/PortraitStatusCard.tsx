import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, HourglassIcon, MessageCircleIcon, PencilIcon, SparklesIcon } from 'lucide-react';
import { Button } from '../Button';
import { InlineAlert } from '../InlineAlert';
import { usePrototype } from '../../contexts/PrototypeContext';
import { expiryDate, formatDate } from '../../utils/dates';
import { PortraitStatusBadge, getPortraitStatus } from './PortraitStatusBadge';

interface PortraitStatusCardProps {
  variant: 'home' | 'settings';
}

export function PortraitStatusCard({ variant }: PortraitStatusCardProps) {
  const navigate = useNavigate();
  const { portrait, interview, setUseEnabled, showToast, expiredOn, dismissExpired } = usePrototype();
  const status = getPortraitStatus(portrait, interview);
  const isHome = variant === 'home';
  const HeadingTag = isHome ? 'h2' : 'h3';

  const enable = () => {
    setUseEnabled(true);
    showToast({ variant: 'success', title: 'Portrait in use', description: 'New chats will use your portrait preferences.' });
  };

  const pendingRow = interview && portrait && (
    <div className="mt-4 flex flex-col gap-3 rounded-xl bg-background-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-text-primary">
        <HourglassIcon className="mt-0.5 h-4 w-4 shrink-0 text-info-default" aria-hidden="true" />
        <span>
          Unfinished {interview.mode === 'update' ? 'update' : 'interview'} · expires {expiryDate(interview.lastActivityAt)}. Your saved portrait stays active until you approve changes.
        </span>
      </p>
      <Button size="compact" variant="secondary" onClick={() => navigate('/portrait/interview')}>
        Resume interview
      </Button>
    </div>
  );

  return (
    <section
      aria-labelledby={`portrait-card-${variant}`}
      className="rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-default">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Learner portrait</p>
            {status !== 'none' && <PortraitStatusBadge status={status} />}
          </div>

          {status === 'none' && (
            <>
              <HeadingTag id={`portrait-card-${variant}`} className="mt-1 text-lg font-semibold text-text-primary">
                Make learning feel more like you
              </HeadingTag>
              <p className="mt-1 max-w-prose text-sm text-text-secondary">
                Help us explain things in a way that works for you. Share your languages, goals, and how you like explanations. It’s optional, and you review everything before saving.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button leadingIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={() => navigate('/portrait/intro')}>
                  Start interview
                </Button>
                <Button variant="secondary" leadingIcon={<PencilIcon className="h-4 w-4" />} onClick={() => navigate('/portrait/manual')}>
                  Fill it in myself
                </Button>
              </div>
            </>
          )}

          {status === 'interview' && interview && (
            <>
              <HeadingTag id={`portrait-card-${variant}`} className="mt-1 text-lg font-semibold text-text-primary">
                Your interview is ready to continue
              </HeadingTag>
              <p className="mt-1 text-sm text-text-secondary">
                Pick up where you left off on any device. If there’s no activity, it expires on{' '}
                <span className="font-medium text-text-primary">{expiryDate(interview.lastActivityAt)}</span>.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button trailingIcon={<ArrowRightIcon className="h-4 w-4" />} onClick={() => navigate('/portrait/interview')}>
                  Resume interview
                </Button>
                <Button variant="secondary" onClick={() => navigate('/portrait/review')}>
                  Review draft
                </Button>
              </div>
            </>
          )}

          {status === 'saved-off' && portrait && (
            <>
              <HeadingTag id={`portrait-card-${variant}`} className="mt-1 text-lg font-semibold text-text-primary">
                Your portrait is saved
              </HeadingTag>
              <p className="mt-1 text-sm text-text-secondary">
                Chats don’t use it yet. Turn it on whenever you’re ready. Last updated {formatDate(portrait.updatedAt)}.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button onClick={enable}>Use my portrait</Button>
                <Button variant="secondary" onClick={() => navigate('/portrait')}>
                  View and edit
                </Button>
              </div>
            </>
          )}

          {status === 'in-use' && portrait && (
            <>
              <HeadingTag id={`portrait-card-${variant}`} className="mt-1 text-lg font-semibold text-text-primary">
                Chats use your portrait
              </HeadingTag>
              <p className="mt-1 text-sm text-text-secondary">
                New chats start with your preferences. Last updated {formatDate(portrait.updatedAt)}.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={() => navigate('/portrait')}>
                  View and edit
                </Button>
                {!interview && (
                  <Button variant="ghost" leadingIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={() => navigate('/portrait/intro?mode=update')}>
                    Update through interview
                  </Button>
                )}
              </div>
            </>
          )}

          {pendingRow}

          {expiredOn && (
            <div className="mt-4">
              <InlineAlert
                tone="info"
                title="Your unfinished interview expired"
                onDismiss={dismissExpired}
                actions={
                  <Button size="compact" variant="secondary" onClick={() => navigate('/portrait/intro')}>
                    Start again
                  </Button>
                }
              >
                After 14 days without activity, its transcript and working draft were removed on {formatDate(expiredOn)}.
                {portrait ? ' Your saved portrait hasn’t changed.' : ''}
              </InlineAlert>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

