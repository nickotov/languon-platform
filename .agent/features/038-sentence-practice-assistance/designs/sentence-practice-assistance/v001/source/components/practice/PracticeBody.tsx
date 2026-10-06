import React, { useEffect, useState } from 'react'
import { ArrowRightIcon, ChevronDownIcon, ChevronUpIcon, FlagIcon, InboxIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { Skeleton } from '../Skeleton'
import { HintedSentence } from './HintedSentence'
import { HintLegend } from './HintLegend'
import { DraftField } from './DraftField'
import { JobStatus } from './JobStatus'
import { PracticeNotice } from './PracticeNotice'
import { AiResultPanel } from './AiResultPanel'
import { ReferenceCompare } from './ReferenceCompare'
import type { PracticeRound } from '../../hooks/usePracticeRound'
import { languageName } from '../../data/languages'
import { ratingLabel } from '../../utils/practiceGrading'

interface PracticeBodyProps {
  round: PracticeRound
  hasSavedExample: boolean
  onReturn: () => void
  onOpenSettings: () => void
  onSignIn: () => void
  /** Gallery: open a hint occurrence on mount. */
  initialOpenHint?: number
}

export function PracticeBody({ round, hasSavedExample, onReturn, onOpenSettings, onSignIn, initialOpenHint }: PracticeBodyProps) {
  const { exercise, job, busy, status, config, currentItem, currentAttempt, reference } = round
  const [announcement, setAnnouncement] = useState('')
  const [showEarlier, setShowEarlier] = useState(false)

  useEffect(() => {
    if (currentAttempt) setAnnouncement(`AI check finished: ${currentAttempt.result.score} percent, ${ratingLabel(currentAttempt.result.rating, 'en')}.`)
  }, [currentAttempt])
  useEffect(() => {
    if (reference.phase === 'shown' && reference.comparison)
      setAnnouncement(
        reference.comparison.kind === 'match'
          ? 'Reference shown. Matches after normalization.'
          : reference.comparison.kind === 'different'
            ? 'Reference shown. Different from this reference.'
            : 'Reference shown.',
      )
  }, [reference])
  useEffect(() => {
    if (exercise) setAnnouncement(`New sentence ${round.position}. Translate from ${languageName(exercise.sourceLanguage)}.`)
    setShowEarlier(false)
  }, [exercise?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) return null

  if (status === 'access-lost' && round.accessLoss) {
    return (
      <div className="space-y-4">
        <PracticeNotice failure={round.accessLoss} context="access" onReturn={onReturn} onSignIn={round.accessLoss === 'session' ? onSignIn : undefined} />
      </div>
    )
  }

  const jobFailed = job.phase === 'failed' || job.phase === 'cancelled'
  const failure = job.phase === 'cancelled' ? 'cancelled' : job.failure
  const earlier = currentItem ? currentItem.attempts.slice(0, -1) : []

  return (
    <div className="space-y-5">
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {round.fencedNotice ? (
        <InlineAlert tone="info" title="A late result was ignored" onDismiss={round.dismissFenced}>
          A response from before you restarted arrived afterwards. It didn’t change this screen.
        </InlineAlert>
      ) : null}

      {status === 'loading' ? (
        <>
          {jobFailed && failure && job.kind ? (
            <PracticeNotice
              failure={failure}
              context={job.kind}
              hasSavedExample={hasSavedExample}
              onRetry={failure === 'cancelled' ? round.retryNext : round.retry}
              onReviewSaved={() => round.changeMode('review')}
              onReturn={onReturn}
              onOpenSettings={onOpenSettings}
            />
          ) : (
            <div aria-hidden className="rounded-xl border border-border-default bg-background-surface p-5">
              <Skeleton variant="rect" width="88%" height="1.9rem" />
              <Skeleton variant="rect" width="54%" height="1.9rem" className="mt-3" />
            </div>
          )}
          <JobStatus job={job} onCancel={round.cancel} onResume={round.resume} />
        </>
      ) : null}

      {status === 'empty' ? <EmptyRound round={round} onReturn={onReturn} /> : null}

      {status === 'active' && exercise ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-background-surface px-2 py-1 font-medium text-text-primary">
              Translate from {languageName(exercise.sourceLanguage)}
              <ArrowRightIcon aria-hidden className="h-3.5 w-3.5 text-text-tertiary rtl:rotate-180" />
              <span className="sr-only">into</span>
              {languageName(exercise.responseLanguage)}
            </span>
            {exercise.enrichment === 'legacy' ? <span className="text-xs text-text-tertiary">Saved example · dictionary hints only</span> : null}
          </div>

          {round.isFinal ? (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-border-strong bg-background-surface p-3 text-sm">
              <FlagIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary-default" />
              <p className="text-text-primary">
                <span className="font-semibold">Last {round.replaySource ? 'example of this replay' : 'sentence'}.</span>{' '}
                {round.replaySource
                  ? 'Finish it to see this replay’s results.'
                  : 'All selected words have appeared — no more sentences will be prepared. Check, compare or skip it to see your results.'}
              </p>
            </div>
          ) : null}

          {exercise.status !== 'current' ? (
            <PracticeNotice failure="outdated" context="access" onSkip={round.skip} />
          ) : null}

          <div className="rounded-xl border border-border-default bg-background-surface p-4 sm:p-6">
            <HintedSentence exercise={exercise} seenHints={round.revealedHints} onHintSeen={round.markHintSeen} initialOpen={initialOpenHint} />
            <HintLegend exercise={exercise} seenHints={round.revealedHints} />
          </div>

          <DraftField
            value={round.draft}
            onChange={round.setDraft}
            answerLanguage={exercise.responseLanguage}
            error={round.validationError}
            locked={job.kind === 'check' && busy}
          />

          {job.kind === 'check' ? <JobStatus job={job} onCancel={round.cancel} onResume={round.resume} /> : null}

          {job.kind === 'check' && jobFailed && failure ? (
            <PracticeNotice
              failure={failure}
              context="check"
              hasSavedExample
              onRetry={failure === 'cancelled' ? round.check : round.retry}
              onCompare={exercise.status === 'current' && reference.phase !== 'shown' && reference.phase !== 'collapsed' ? round.compare : undefined}
              onOpenSettings={onOpenSettings}
              onDismiss={round.dismissJob}
            />
          ) : null}

          {currentAttempt ? <AiResultPanel attempt={currentAttempt} /> : null}

          {earlier.length > 0 ? (
            <div>
              <Button
                size="compact"
                variant="secondary"
                aria-expanded={showEarlier}
                onClick={() => setShowEarlier((prev) => !prev)}
                trailingIcon={showEarlier ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
              >
                Earlier attempts on this sentence ({earlier.length})
              </Button>
              {showEarlier ? (
                <div className="mt-3 space-y-3">
                  {earlier.map((attempt) => <AiResultPanel key={attempt.id} attempt={attempt} compact />)}
                </div>
              ) : null}
            </div>
          ) : null}

          <ReferenceCompare
            exercise={exercise}
            reference={reference}
            draft={round.draft}
            disabled={job.kind === 'check' && busy}
            onCompare={round.compare}
            onRecompare={round.recompare}
            onToggle={round.toggleReference}
            onSkip={round.skip}
          />
        </>
      ) : null}
    </div>
  )
}

function EmptyRound({ round, onReturn }: { round: PracticeRound; onReturn: () => void }) {
  const copy =
    round.emptyReason === 'review-exhausted'
      ? { title: 'You’ve visited every saved example in this session', body: 'Review saved never generates. Restart the review from the beginning, or change the mode.' }
      : round.emptyReason === 'no-more'
        ? { title: 'No more sentences can be prepared for these words', body: 'Try the other direction or choose different entries.' }
        : { title: 'No saved examples for this setup', body: 'Review saved never generates, and an empty saved pool has no free references. Switch to New examples to generate some (may need credits).' }
  return (
    <div className="rounded-xl border border-border-default bg-background-surface p-6 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-background-subtle text-text-secondary">
        <InboxIcon aria-hidden className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-base font-semibold text-text-primary">{copy.title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">{copy.body}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {round.emptyReason === 'review-exhausted' ? (
          <Button size="compact" leadingIcon={<RotateCcwIcon aria-hidden className="h-4 w-4" />} onClick={round.restartReview}>
            Restart review
          </Button>
        ) : null}
        {round.emptyReason !== 'no-more' ? (
          <Button size="compact" variant="secondary" onClick={() => round.changeMode('new')}>
            Switch to New examples
          </Button>
        ) : null}
        <Button size="compact" variant="secondary" onClick={onReturn}>
          Back to dictionary
        </Button>
      </div>
    </div>
  )
}

