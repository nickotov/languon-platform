import React from 'react'
import { ArrowRightIcon, SparklesIcon } from 'lucide-react'
import { Button } from '../Button'
import type { PracticeSession } from '../../hooks/usePracticeSession'

/** Sticky action bar shared by full-screen and dialog layouts. */
export function PracticeActions({ session }: { session: PracticeSession }) {
  const { exercise, job, busy, currentAttempt, reference, referenceUsed, checkUnavailable, draft, submitted } =
    session
  if (!exercise) return null

  const completed = Boolean(currentAttempt) || referenceUsed
  const checking = job.kind === 'check' && busy
  const generating = job.kind === 'generation' && busy
  const usable = exercise.status === 'current'
  const canReveal = usable && (reference === 'hidden' || reference === 'failed')
  const draftChanged = draft.trim().length > 0 && draft !== submitted
  const checkDisabled = busy || Boolean(checkUnavailable) || !usable || (completed && !draftChanged)

  const reason = checking
    ? 'A check is running. Cancel it or wait — another check can’t start meanwhile.'
    : checkUnavailable === 'credits'
      ? 'AI checking needs credits. The reference answer and Next are still free.'
      : checkUnavailable === 'model'
        ? 'Your selected AI model is unavailable. The reference answer is still free.'
        : checkUnavailable === 'capacity'
          ? 'AI is busy right now — try checking again later.'
          : completed && !draftChanged && !checkUnavailable
            ? currentAttempt
              ? 'Edit your answer to check a new attempt. Earlier attempts stay in your history.'
              : null
            : null

  const checkButton = (
    <Button
      variant={completed ? 'secondary' : 'primary'}
      leadingIcon={<SparklesIcon aria-hidden className="h-4 w-4" />}
      loading={checking}
      disabled={checkDisabled}
      aria-describedby={reason ? 'practice-action-reason' : undefined}
      onClick={session.check}
    >
      {checking ? 'Checking…' : currentAttempt ? 'Check new answer' : 'Check with AI'}
    </Button>
  )

  return (
    <div className="space-y-2">
      {reason ? (
        <p id="practice-action-reason" className="text-xs text-text-secondary">
          {reason}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canReveal ? (
            <Button size="compact" variant="secondary" onClick={session.revealReference} disabled={generating}>
              Show reference answer — free
            </Button>
          ) : null}
          {reference === 'pending' ? (
            <Button size="compact" variant="secondary" loading>
              Opening reference…
            </Button>
          ) : null}
          {!completed ? (
            <Button
              size="compact"
              variant="secondary"
              onClick={session.next}
              disabled={busy}
              title="Skipping doesn’t complete this sentence — it can return in a later session."
            >
              Skip
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {checkButton}
          {completed ? (
            <Button
              trailingIcon={<ArrowRightIcon aria-hidden className="h-4 w-4 rtl:rotate-180" />}
              onClick={session.next}
              disabled={busy}
            >
              Next sentence
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

