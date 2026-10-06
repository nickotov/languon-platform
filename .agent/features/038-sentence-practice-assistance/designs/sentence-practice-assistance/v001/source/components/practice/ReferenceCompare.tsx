import React from 'react'
import { BookOpenCheckIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, InfoIcon, ScaleIcon } from 'lucide-react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import type { PracticeExercise, ReferenceState } from '../../types/practice'
import { languageDir, languageName } from '../../data/languages'
import { ignoredLabels } from '../../utils/referenceCompare'

interface ReferenceCompareProps {
  exercise: PracticeExercise
  reference: ReferenceState
  draft: string
  disabled: boolean
  onCompare: () => void
  onRecompare: () => void
  onToggle: () => void
  onSkip: () => void
}

/**
 * The free, conservative action. Distinct from scored AI feedback: no score,
 * rating or “Correct” verdict — just a normalized match against ONE reference.
 */
export function ReferenceCompare({ exercise, reference, draft, disabled, onCompare, onRecompare, onToggle, onSkip }: ReferenceCompareProps) {
  const empty = draft.trim().length === 0
  const outdated = exercise.status !== 'current'

  if (reference.phase === 'hidden' || reference.phase === 'pending' || reference.phase === 'failed') {
    return (
      <section aria-label="Free reference comparison" className="space-y-3 rounded-xl border border-dashed border-border-strong bg-background-subtle p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-prose">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <ScaleIcon aria-hidden className="h-4 w-4" />
              Two ways to check
            </h3>
            <p className="mt-1 text-xs text-text-secondary">
              <span className="font-medium text-text-primary">Check with AI</span> evaluates meaning, grammar and required words — may need credits.{' '}
              <span className="font-medium text-text-primary">{empty ? 'Show reference — free' : 'Compare with reference — free'}</span> needs no AI.
            </p>
            <p id="practice-compare-note" className="mt-1 text-xs text-text-secondary">
              {empty
                ? 'Reveals one saved translation. No comparison is made without an answer.'
                : 'Checks whether your answer matches one saved translation, ignoring case, extra spaces, punctuation and apostrophe style. It doesn’t judge meaning or grammar.'}{' '}
              Revealing records a manual review — no grade, no credits.
            </p>
          </div>
          {reference.phase === 'pending' ? (
            <p role="status" className="text-xs font-medium text-text-secondary">Revealing the reference…</p>
          ) : null}
        </div>
        {reference.phase === 'failed' ? (
          <InlineAlert
            tone={reference.failure === 'outdated' || reference.failure === 'revoked' ? 'info' : 'warning'}
            title={
              reference.failure === 'uncertain'
                ? 'We’re not sure the reveal went through'
                : reference.failure === 'outdated'
                  ? 'This example is outdated'
                  : reference.failure === 'revoked'
                    ? 'You no longer have access to this reference'
                    : 'The reference couldn’t be revealed'
            }
            actions={
              reference.failure === 'outdated' ? (
                <Button size="compact" variant="secondary" onClick={onSkip}>Skip this example</Button>
              ) : reference.failure === 'revoked' ? undefined : (
                <Button size="compact" variant="secondary" onClick={onCompare}>
                  {reference.failure === 'uncertain' ? 'Get result' : 'Try again'}
                </Button>
              )
            }
          >
            {reference.failure === 'outdated'
              ? 'Its dictionary entry changed, so the reference can’t be shown and nothing was recorded.'
              : reference.failure === 'uncertain'
                ? 'The reference stays hidden until we know. Getting the result won’t record a second review.'
                : 'The reference stays hidden, your answer is unchanged and nothing was recorded.'}
          </InlineAlert>
        ) : null}
      </section>
    )
  }

  const comparison = reference.comparison
  const open = reference.phase === 'shown'
  const changed = comparison && comparison.draft !== draft && draft.trim().length > 0

  return (
    <section aria-label="Reference translation" className="rounded-xl border border-dashed border-border-strong bg-background-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpenCheckIcon aria-hidden className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">Reference translation</h3>
          <Badge size="sm" tone="neutral">Manually reviewed</Badge>
        </div>
        <Button
          size="compact"
          variant="secondary"
          aria-expanded={open}
          onClick={onToggle}
          trailingIcon={open ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
        >
          {open ? 'Hide' : 'Show again'}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <dl className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-border-default bg-background-surface p-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">One saved translation · {languageName(exercise.responseLanguage)}</dt>
              <dd lang={exercise.responseLanguage} dir={languageDir(exercise.responseLanguage)} className="mt-1 whitespace-pre-wrap break-words text-base text-text-primary">
                {exercise.reference}
              </dd>
            </div>
            <div className="min-w-0 rounded-lg border border-border-default bg-background-surface p-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Your answer, as compared</dt>
              <dd lang={exercise.responseLanguage} dir="auto" className="mt-1 whitespace-pre-wrap break-words text-base text-text-primary">
                {comparison?.kind === 'reference-only' || !comparison ? <span className="text-sm text-text-tertiary">No answer was compared.</span> : comparison.draft}
              </dd>
            </div>
          </dl>

          {comparison?.kind === 'match' ? (
            <div role="status" className="flex gap-2 rounded-lg border border-border-strong bg-background-surface p-3 text-sm">
              <CheckIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" />
              <div>
                <p className="font-semibold text-text-primary">Matches the reference after normalization.</p>
                <p className="mt-0.5 text-text-secondary">
                  {comparison.ignored.length
                    ? `Ignored differences: ${comparison.ignored.map((key) => ignoredLabels[key]).join(', ')}.`
                    : 'The two texts are identical.'}{' '}
                  Accents, letters and word order still count. This is not a score.
                </p>
              </div>
            </div>
          ) : comparison?.kind === 'different' ? (
            <div role="status" className="flex gap-2 rounded-lg border border-border-strong bg-background-surface p-3 text-sm">
              <InfoIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info-default" />
              <div>
                <p className="font-semibold text-text-primary">Different from this reference.</p>
                <p className="mt-0.5 text-text-secondary">Another translation may still be valid. AI checking can evaluate meaning and grammar.</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">One valid translation. Your answer may also be correct.</p>
          )}

          {changed ? (
            <Button size="compact" variant="secondary" onClick={onRecompare}>
              Compare my edited answer — free
            </Button>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-xs text-text-tertiary">
        Recorded once as a manual review — no grade and no credits. Hiding the panel doesn’t remove it.
      </p>
    </section>
  )
}

