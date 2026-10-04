import React, { useEffect, useState } from 'react'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InboxIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Skeleton } from '../Skeleton'
import { SentenceWithHints } from './SentenceWithHints'
import { DraftField } from './DraftField'
import { JobStatus } from './JobStatus'
import { PracticeNotice } from './PracticeNotice'
import { AiResultPanel } from './AiResultPanel'
import { ReferencePanel } from './ReferencePanel'
import type { PracticeSession } from '../../hooks/usePracticeSession'
import type { PracticeMode } from '../../types/practice'
import { languageName } from '../../data/languages'
import { ratingLabel } from '../../utils/practiceGrading'

export const modeLabels: Record<PracticeMode, string> = {
  'saved-first': 'Saved first',
  'new-only': 'New only',
  'review-only': 'Review only',
}

interface PracticeBodyProps {
  session: PracticeSession
  hasSavedSentences: boolean
  onReturn: () => void
  onOpenPreferences: () => void
  onSignIn?: () => void
}

export function PracticeBody({
  session,
  hasSavedSentences,
  onReturn,
  onOpenPreferences,
  onSignIn,
}: PracticeBodyProps) {
  const {
    config,
    exercise,
    emptyReason,
    job,
    busy,
    currentAttempt,
    exerciseAttempts,
    reference,
    referenceFailure,
    checkUnavailable,
  } = session
  const [showEarlier, setShowEarlier] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  // Announce results once, without re-reading the whole sentence.
  useEffect(() => {
    if (!currentAttempt) return
    const { result } = currentAttempt
    setAnnouncement(
      `AI check complete: ${result.score} percent, ${ratingLabel(result.rating, 'en')}. Feedback is below your answer.`,
    )
  }, [currentAttempt])

  useEffect(() => {
    if (reference === 'revealed') setAnnouncement('Reference translation shown. Recorded as manually reviewed.')
  }, [reference])

  useEffect(() => {
    setShowEarlier(false)
  }, [exercise?.id])

  if (!config) return null

  const jobFailed = job.phase === 'failed' || job.phase === 'cancelled'
  const failure = job.phase === 'cancelled' ? 'cancelled' : job.failure
  const generating = job.kind === 'generation' && busy
  const earlier = exerciseAttempts.filter((attempt) => attempt.id !== currentAttempt?.id)

  return (
    <div className="space-y-5">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-background-subtle px-2 py-1 font-medium text-text-primary">
          {languageName(exercise?.sourceLanguage ?? config.sentenceLanguage)}
          <ArrowRightIcon aria-hidden className="h-3.5 w-3.5 text-text-tertiary rtl:rotate-180" />
          <span className="sr-only">to</span>
          {languageName(exercise?.responseLanguage ?? config.answerLanguage)}
        </span>
        <Badge size="sm" tone="neutral">
          {modeLabels[config.mode]}
        </Badge>
        <span className="text-xs text-text-tertiary">
          Feedback in {languageName(config.explanationLanguage)}
        </span>
      </div>

      {jobFailed && failure && job.kind ? (
        <PracticeNotice
          failure={failure}
          context={job.kind}
          hasSavedSentences={hasSavedSentences}
          onRetry={session.retryJob}
          onRevealReference={
            exercise && exercise.status === 'current' && reference === 'hidden'
              ? session.revealReference
              : undefined
          }
          onReviewSaved={() => session.changeMode('review-only')}
          onReturn={onReturn}
          onOpenPreferences={onOpenPreferences}
          onSignIn={onSignIn}
          onDismiss={exercise ? session.dismissJob : undefined}
        />
      ) : null}

      {!exercise && generating ? (
        <div className="space-y-4" aria-hidden>
          <div className="rounded-xl border border-border-default bg-background-surface p-5">
            <Skeleton variant="rect" width="92%" height="1.75rem" />
            <Skeleton variant="rect" width="58%" height="1.75rem" className="mt-3" />
          </div>
          <Skeleton variant="rect" width="100%" height="7rem" />
        </div>
      ) : null}
      {!exercise ? <JobStatus job={job} onCancel={session.cancelJob} /> : null}

      {!exercise && emptyReason === 'review-empty' ? (
        <EmptyBlock
          title="No saved sentences for this setup"
          body="Review only never generates. Saved sentences appear here after someone with access generates them for this direction and vocabulary. An empty pool has no free reference answers."
          actions={
            <>
              <Button size="compact" onClick={() => session.changeMode('new-only')}>
                Switch to New only
              </Button>
              <Button size="compact" variant="secondary" onClick={onReturn}>
                Back to dictionary
              </Button>
            </>
          }
        />
      ) : null}

      {!exercise && emptyReason === 'review-exhausted' ? (
        <EmptyBlock
          title="You’ve visited every saved sentence in this session"
          body="Nothing new will be generated unless you choose to. Start the review again from the beginning, or change the mode."
          actions={
            <>
              <Button
                size="compact"
                leadingIcon={<RotateCcwIcon aria-hidden className="h-4 w-4" />}
                onClick={session.restartReview}
              >
                Restart review
              </Button>
              <Button size="compact" variant="secondary" onClick={() => session.changeMode('new-only')}>
                Switch to New only
              </Button>
            </>
          }
        />
      ) : null}

      {exercise ? (
        <>
          <div className="rounded-xl border border-border-default bg-background-surface p-4 sm:p-5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
              Sentence · {languageName(exercise.sourceLanguage)}
            </p>
            <SentenceWithHints
              exercise={exercise}
              revealedHints={session.revealedHints}
              onReveal={session.revealHint}
            />
          </div>

          {checkUnavailable && !currentAttempt && !jobFailed ? (
            <PracticeNotice
              failure={checkUnavailable}
              context="check"
              onRevealReference={
                reference === 'hidden' || reference === 'failed' ? session.revealReference : undefined
              }
              onOpenPreferences={onOpenPreferences}
            />
          ) : null}

          <DraftField
            value={session.draft}
            onChange={session.setDraft}
            responseLanguage={exercise.responseLanguage}
            error={session.validationError}
            locked={job.kind === 'check' && busy}
          />

          <JobStatus job={job} onCancel={session.cancelJob} />

          {reference === 'pending' ? (
            <p role="status" className="text-sm text-text-secondary">
              Opening the reference translation…
            </p>
          ) : null}
          {reference === 'failed' && referenceFailure ? (
            <PracticeNotice
              failure={referenceFailure}
              context="reveal"
              onRetry={referenceFailure === 'offline' ? session.revealReference : undefined}
              onNext={referenceFailure === 'outdated' ? session.next : undefined}
            />
          ) : null}

          {currentAttempt ? <AiResultPanel attempt={currentAttempt} /> : null}

          <ReferencePanel exercise={exercise} phase={reference} onToggle={session.toggleReference} />

          {earlier.length > 0 ? (
            <div>
              <Button
                size="compact"
                variant="secondary"
                aria-expanded={showEarlier}
                onClick={() => setShowEarlier((prev) => !prev)}
                trailingIcon={
                  showEarlier ? (
                    <ChevronUpIcon aria-hidden className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon aria-hidden className="h-4 w-4" />
                  )
                }
              >
                Earlier attempts on this sentence ({earlier.length})
              </Button>
              {showEarlier ? (
                <div className="mt-3 space-y-3">
                  {earlier.map((attempt) => (
                    <AiResultPanel key={attempt.id} attempt={attempt} compact />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function EmptyBlock({
  title,
  body,
  actions,
}: {
  title: string
  body: string
  actions: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border-default bg-background-surface p-6 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-background-subtle text-text-secondary">
        <InboxIcon aria-hidden className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-base font-semibold text-text-primary">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">{body}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  )
}

