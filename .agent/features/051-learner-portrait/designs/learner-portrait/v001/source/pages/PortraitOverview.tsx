import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HourglassIcon, MessageCircleIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../components/Button';
import { InlineAlert } from '../components/InlineAlert';
import { Skeleton } from '../components/Skeleton';
import { DataUseDetails } from '../components/portrait/DataUseDetails';
import { DeletePortraitDialog } from '../components/portrait/DeletePortraitDialog';
import { PortraitDetailsList } from '../components/portrait/PortraitDetailsList';
import { PortraitStatusBadge, getPortraitStatus } from '../components/portrait/PortraitStatusBadge';
import { PortraitStatusCard } from '../components/portrait/PortraitStatusCard';
import { PortraitUseControl } from '../components/portrait/PortraitUseControl';
import { SummaryPanel } from '../components/portrait/SummaryPanel';
import { usePrototype } from '../contexts/PrototypeContext';
import { expiryDate, formatDate, formatDateTime } from '../utils/dates';

export function PortraitOverview() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { portrait, interview, loadState, setLoadState, setUseEnabled, discardInterview, showToast, expiredOn, dismissExpired } = usePrototype();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const saved = params.get('saved');
  const status = getPortraitStatus(portrait, interview);

  if (loadState === 'loading') {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 sm:px-6 sm:py-10" aria-busy="true">
        <Skeleton width="40%" height={28} />
        <Skeleton variant="rect" height={96} />
        <Skeleton variant="rect" height={220} />
      </div>
    );
  }
  if (loadState === 'error') {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold text-text-primary">Learner portrait</h1>
        <div className="mt-6">
          <InlineAlert
            tone="error"
            title="We couldn’t load your portrait"
            actions={
              <Button size="compact" leadingIcon={<RefreshCwIcon className="h-4 w-4" />} onClick={() => setLoadState('loading')}>
                Try again
              </Button>
            }
          >
            Nothing has changed. Check your connection and try again.
          </InlineAlert>
        </div>
      </div>
    );
  }

  const clearSaved = () => {
    params.delete('saved');
    setParams(params, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Account & settings</p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Learner portrait</h1>
          <p className="mt-1 max-w-prose text-base text-text-secondary">Help us explain things in a way that works for you. Private to you — never shared or published.</p>
        </div>
        <PortraitStatusBadge status={status} />
      </header>

      {saved && portrait && (
        <InlineAlert
          tone="success"
          title={saved === 'first' ? 'Portrait saved' : 'Portrait updated'}
          onDismiss={clearSaved}
          actions={
            saved === 'first' && !portrait.useEnabled ? (
              <Button
                size="compact"
                onClick={() => {
                  setUseEnabled(true);
                  clearSaved();
                  showToast({ variant: 'success', title: 'Portrait in use', description: 'New chats will use your preferences.' });
                }}
              >
                Use my portrait
              </Button>
            ) : undefined
          }
        >
          {saved === 'first'
            ? 'Chats don’t use it yet. Turn it on when you’re ready — you can turn it off anytime.'
            : `Your use setting is unchanged: ${portrait.useEnabled ? 'chats use your portrait.' : 'chats don’t use your portrait.'} Any interview transcript was removed.`}
        </InlineAlert>
      )}

      {!portrait && (
        <>
          {interview ? (
            <section className="rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6" aria-labelledby="pending-heading">
              <div className="flex items-start gap-3">
                <HourglassIcon className="mt-0.5 h-5 w-5 shrink-0 text-info-default" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 id="pending-heading" className="text-lg font-semibold text-text-primary">
                    Your interview is ready to continue
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Started {formatDate(interview.startedAt)} · resumes on any device · expires {expiryDate(interview.lastActivityAt)} without activity.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button onClick={() => navigate('/portrait/interview')}>Resume interview</Button>
                    <Button variant="secondary" onClick={() => navigate('/portrait/review')}>
                      Review draft
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        discardInterview();
                        showToast({ variant: 'success', title: 'Interview discarded', description: 'Its transcript and draft were removed.' });
                      }}
                    >
                      Discard interview
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <PortraitStatusCard variant="settings" />
          )}
          <DataUseDetails />
        </>
      )}

      {portrait && (
        <>
          {expiredOn && (
            <InlineAlert
              tone="info"
              title="Your unfinished interview expired"
              onDismiss={dismissExpired}
              actions={
                <Button size="compact" variant="secondary" onClick={() => navigate('/portrait/intro?mode=update')}>
                  Start again
                </Button>
              }
            >
              Its transcript and working draft were removed on {formatDate(expiredOn)} after 14 days without activity. Your saved portrait below hasn’t changed.
            </InlineAlert>
          )}
          {interview && (
            <InlineAlert
              tone={interview.conflict ? 'warning' : 'info'}
              title={interview.conflict ? 'Your portrait changed elsewhere' : 'You have an unfinished update'}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button size="compact" onClick={() => navigate(interview.conflict ? '/portrait/review' : '/portrait/interview')}>
                    {interview.conflict ? 'Review and reconcile' : 'Resume interview'}
                  </Button>
                  {!interview.conflict && (
                    <Button size="compact" variant="secondary" onClick={() => navigate('/portrait/review')}>
                      Review draft
                    </Button>
                  )}
                  <Button size="compact" variant="ghost" onClick={discardInterview}>
                    Discard interview
                  </Button>
                </div>
              }
            >
              {interview.conflict
                ? `An older interview draft from ${formatDate(interview.startedAt)} proposes changes that conflict with what you saved on ${portrait.updatedOn}. Nothing is overwritten until you decide. The draft is kept until ${expiryDate(interview.lastActivityAt)}.`
                : `Expires ${expiryDate(interview.lastActivityAt)} without activity. Your saved portrait stays active until you approve changes.`}
            </InlineAlert>
          )}

          <PortraitUseControl />

          <SummaryPanel items={portrait.items} language={portrait.summaryLanguage} />

          <section aria-labelledby="details-heading" className="rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="details-heading" className="text-base font-semibold text-text-primary">
                Details
              </h2>
              <Button size="compact" variant="secondary" leadingIcon={<PencilIcon className="h-4 w-4" />} onClick={() => navigate('/portrait/manual')}>
                Edit details
              </Button>
            </div>
            <PortraitDetailsList items={portrait.items} />
            <p className="mt-3 border-t border-border-default pt-3 text-xs text-text-tertiary">
              Last updated {formatDateTime(portrait.updatedAt)} on {portrait.updatedOn}.
            </p>
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button leadingIcon={<PencilIcon className="h-4 w-4" />} variant="secondary" onClick={() => navigate('/portrait/manual')}>
              Edit details
            </Button>
            <Button
              leadingIcon={<MessageCircleIcon className="h-4 w-4" />}
              variant="secondary"
              onClick={() => navigate(interview ? '/portrait/interview' : '/portrait/intro?mode=update')}
            >
              Update through interview
            </Button>
            <Button leadingIcon={<Trash2Icon className="h-4 w-4" />} variant="danger" className="sm:ml-auto" onClick={() => setDeleteOpen(true)}>
              Delete portrait
            </Button>
          </div>
          <DataUseDetails />
        </>
      )}

      <DeletePortraitDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

