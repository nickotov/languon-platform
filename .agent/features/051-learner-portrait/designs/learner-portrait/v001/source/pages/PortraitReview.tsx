import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, CompassIcon, MessageCircleIcon, SaveIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../components/Button';
import { Dialog, DialogActions } from '../components/Dialog';
import { InlineAlert } from '../components/InlineAlert';
import { ConflictPanel } from '../components/portrait/ConflictPanel';
import { PortraitEditor } from '../components/portrait/PortraitEditor';
import { ProposalCard } from '../components/portrait/ProposalCard';
import { SummaryPanel } from '../components/portrait/SummaryPanel';
import { UpdateDiff } from '../components/portrait/UpdateDiff';
import { usePrototype } from '../contexts/PrototypeContext';
import { INTERVIEW_COPY } from '../data/interviewCopy';
import type { PortraitItems } from '../types/portrait';
import { TODAY, expiryDate, timeLabel } from '../utils/dates';
import { diffItems, invalidFieldCount, isMeaningful } from '../utils/portraitItems';
import { uid } from '../utils/text';

export function PortraitReview() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { interview, setInterview, portrait, savePortrait, discardInterview, showToast } = usePrototype();
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const diff = useMemo(() => (portrait && interview ? diffItems(portrait.items, interview.draft) : []), [portrait, interview]);

  if (!interview) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-text-primary">No draft to review</h1>
        <p className="mt-2 text-sm text-text-secondary">Your draft was saved, discarded, or expired. Any saved portrait is unchanged.</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => navigate('/portrait')}>Go to portrait</Button>
          <Button variant="secondary" onClick={() => navigate('/portrait/intro')}>
            Start an interview
          </Button>
        </div>
      </div>
    );
  }

  const items = interview.draft;
  const setItems = (next: PortraitItems) => setInterview((iv) => (iv ? { ...iv, draft: next, lastActivityAt: TODAY.toISOString() } : iv));
  const meaningful = isMeaningful(items);
  const invalid = invalidFieldCount(items);
  const isUpdate = Boolean(portrait);
  const blocker = interview.conflict
    ? 'Reconcile the changes made elsewhere before saving.'
    : !meaningful
      ? 'Nothing to save yet — add at least one item.'
      : invalid
        ? `Fix ${invalid} field${invalid === 1 ? '' : 's'} before saving.`
        : isUpdate && diff.length === 0
          ? 'No changes from your saved portrait.'
          : null;
  const canExplore = interview.mode === 'new' && !interview.topicStatus.interests && !interview.topicStatus.age;

  const save = async () => {
    if (blocker) return;
    setState('saving');
    const ok = await savePortrait(items, { summaryLanguage: interview.language, fromInterview: true });
    if (ok) navigate(`/portrait?saved=${isUpdate ? 'update' : 'first'}`);
    else setState('error');
  };

  const explore = () => {
    setInterview((iv) =>
      iv
        ? {
            ...iv,
            phase: 'questions',
            topic: 'interests',
            messages: [...iv.messages, { id: uid('m'), role: 'interviewer', kind: 'question', text: INTERVIEW_COPY[iv.language].questions.interests.title, time: timeLabel() }],
          }
        : iv,
    );
    navigate('/portrait/interview');
  };

  const restartFromDraft = () => {
    setInterview((iv) =>
      iv
        ? {
            ...iv,
            phase: 'questions',
            contextUsed: 0,
            proposals: [],
            messages: [
              { id: uid('m'), role: 'system', kind: 'notice', text: 'New interview started from your draft. The previous transcript was removed.', time: timeLabel() },
              { id: uid('m'), role: 'interviewer', kind: 'question', text: INTERVIEW_COPY[iv.language].questions[iv.topic].title, time: timeLabel() },
            ],
          }
        : iv,
    );
    showToast({ variant: 'info', title: 'Fresh interview started', description: 'Your draft was kept.' });
    navigate('/portrait/interview');
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:pb-10">
      <Button variant="ghost" size="compact" leadingIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={() => navigate('/portrait/interview')}>
        Back to interview
      </Button>
      <header className="mt-4 max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{isUpdate ? 'Update · not saved yet' : 'Not saved yet'}</p>
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">Portrait draft</h1>
        <p className="mt-2 text-base text-text-secondary">
          Check the description, correct any item, and save when it looks right. The description is built only from the items below.
          {isUpdate && ' Your saved portrait stays active until you save.'}
        </p>
      </header>

      {params.get('restart') && (
        <div className="mt-4">
          <InlineAlert
            tone="warning"
            title="This interview reached its length limit"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button size="compact" onClick={restartFromDraft}>
                  Start a new interview from this draft
                </Button>
                <Button size="compact" variant="secondary" onClick={() => navigate('/portrait/review', { replace: true })}>
                  Keep reviewing
                </Button>
              </div>
            }
          >
            Your draft and edits are kept. Shorten long notes below, save what you have, or continue in a fresh interview.
          </InlineAlert>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {interview.conflict && <ConflictPanel />}
          <SummaryPanel items={items} language={interview.language} title="Description" />
          {interview.proposals.length > 0 && (
            <section aria-labelledby="proposals-heading" className="space-y-3 rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6">
              <div>
                <h2 id="proposals-heading" className="text-base font-semibold text-text-primary">
                  Needs your review ({interview.proposals.length})
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Interpretations from your chat messages. They’re not part of your draft unless you add them, and are discarded when you save.
                </p>
              </div>
              {interview.proposals.map((p) => (
                <ProposalCard key={p.id} proposal={p} />
              ))}
            </section>
          )}
          <h2 className="pt-2 text-lg font-semibold text-text-primary">Details</h2>
          <PortraitEditor items={items} onChange={setItems} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" aria-label="Save and next steps">
          {isUpdate && <UpdateDiff entries={diff} />}
          <div className="space-y-3 rounded-2xl border border-border-default bg-background-surface p-4 sm:p-5">
            <h2 className="text-base font-semibold text-text-primary">Ready to save?</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
              <li>Saving approves this portrait and removes the interview transcript.</li>
              {isUpdate && portrait ? (
                <li>{portrait.useEnabled ? 'Chats keep using your portrait.' : 'Chats still won’t use it — that stays off until you turn it on.'}</li>
              ) : (
                <li>Chats won’t use it until you turn that on separately.</li>
              )}
              <li>Unsaved draft expires on {expiryDate(interview.lastActivityAt)} if inactive.</li>
            </ul>
            {state === 'error' && (
              <InlineAlert tone="error" title="We couldn’t save your portrait" actions={<Button size="compact" onClick={save}>Try again</Button>}>
                Your draft and edits are kept. Nothing was saved.
              </InlineAlert>
            )}
            <div className="hidden lg:block">
              <Button fullWidth leadingIcon={<SaveIcon className="h-4 w-4" />} onClick={save} loading={state === 'saving'} disabled={Boolean(blocker)}>
                Save portrait
              </Button>
              {blocker && <p className="mt-2 text-sm text-text-secondary">{blocker}</p>}
            </div>
            <Button fullWidth variant="secondary" leadingIcon={<MessageCircleIcon className="h-4 w-4" />} onClick={() => navigate('/portrait/interview')}>
              Continue interview
            </Button>
            {canExplore && (
              <Button fullWidth variant="ghost" leadingIcon={<CompassIcon className="h-4 w-4" />} onClick={explore}>
                Explore interests and age range
              </Button>
            )}
            <Button fullWidth variant="ghost" leadingIcon={<Trash2Icon className="h-4 w-4" />} onClick={() => setConfirmDiscard(true)}>
              Discard interview
            </Button>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border-default bg-background-surface p-3 sm:-mx-6 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <p className="flex-1 text-sm text-text-secondary">{blocker ?? 'Looks good? Save to approve.'}</p>
          <Button onClick={save} loading={state === 'saving'} disabled={Boolean(blocker)}>
            Save portrait
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this interview?"
        description="The transcript and working draft will be removed."
        size="sm"
        footer={
          <DialogActions>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
              Keep draft
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                discardInterview();
                setConfirmDiscard(false);
                showToast({ variant: 'success', title: 'Interview discarded', description: portrait ? 'Your saved portrait is unchanged.' : 'Nothing was saved.' });
                navigate('/portrait');
              }}
            >
              Discard interview
            </Button>
          </DialogActions>
        }
      >
        <p className="text-sm text-text-secondary">{portrait ? 'Your saved portrait stays exactly as it is.' : 'Nothing has been saved yet, so no portrait will remain.'}</p>
      </Dialog>
    </div>
  );
}

