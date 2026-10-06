import React from 'react'
import { ArrowRightIcon, ScaleIcon, SkipForwardIcon, SparklesIcon } from 'lucide-react'
import { Button } from '../Button'
import type { PracticeRound } from '../../hooks/usePracticeRound'

/** Sticky, stable action bar: Skip · Compare with reference — free · Check with AI. */
export function PracticeActions({ round }: { round: PracticeRound }) {
  const { exercise, job, busy, currentAttempt, finished, aiBlocked, draft, submitted, status, isFinal, reference } = round
  const active = status === 'active' && exercise
  const checking = job.kind === 'check' && busy
  const outdated = exercise?.status !== 'current'
  const draftChanged = draft.trim().length > 0 && draft !== submitted
  const needsEdit = Boolean(currentAttempt) && !draftChanged

  const reason = !active
    ? null
    : checking
      ? 'Checking this answer — another check can’t start until it ends.'
      : outdated
        ? 'This example is outdated, so it can’t be checked.'
        : aiBlocked === 'credits'
          ? 'AI checking needs credits. Hints and the free reference comparison still work.'
          : aiBlocked === 'model'
            ? 'Your selected AI model is unavailable — change it in AI settings, or use the free comparison.'
            : aiBlocked === 'capacity'
              ? 'AI is busy right now — try again shortly. The free comparison still works.'
              : needsEdit
                ? 'Edit your answer to check a new attempt. Earlier attempts stay in your history.'
                : null

  const emptyDraft = draft.trim().length === 0
  const revealing = reference.phase === 'pending'
  const showCompare = Boolean(active) && (reference.phase === 'hidden' || reference.phase === 'pending' || reference.phase === 'failed')
  const compareDisabled = busy || outdated || revealing || reference.failure === 'revoked'

  const checkDisabled = !active || busy || Boolean(aiBlocked) || outdated || needsEdit || reference.phase === 'pending'

  return (
    <div className="space-y-2">
      {reason ? (
        <p id="practice-check-reason" className="text-xs text-text-secondary">
          {reason}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {active && !finished ? (
            <Button
              variant="secondary"
              leadingIcon={<SkipForwardIcon aria-hidden className="h-4 w-4" />}
              onClick={round.skip}
              disabled={busy || reference.phase === 'pending'}
            >
              {isFinal ? 'Skip and finish' : 'Skip'}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showCompare ? (
            <Button
              variant="secondary"
              leadingIcon={<ScaleIcon aria-hidden className="h-4 w-4" />}
              loading={revealing}
              disabled={compareDisabled}
              aria-describedby="practice-compare-note"
              onClick={round.compare}
            >
              {revealing ? 'Revealing…' : emptyDraft ? 'Show reference — free' : 'Compare with reference — free'}
            </Button>
          ) : null}
          <Button
            variant={finished ? 'secondary' : 'primary'}
            leadingIcon={<SparklesIcon aria-hidden className="h-4 w-4" />}
            loading={checking}
            disabled={checkDisabled}
            aria-describedby={reason ? 'practice-check-reason' : undefined}
            onClick={round.check}
          >
            {checking ? 'Checking…' : currentAttempt ? 'Check new answer' : 'Check with AI'}
          </Button>
          {active && finished && !isFinal ? (
            <Button trailingIcon={<ArrowRightIcon aria-hidden className="h-4 w-4 rtl:rotate-180" />} onClick={round.next} disabled={busy}>
              Next sentence
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

