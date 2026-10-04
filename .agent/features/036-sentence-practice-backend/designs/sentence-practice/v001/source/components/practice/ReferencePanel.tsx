import React from 'react'
import { BookOpenCheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import type { PracticeExercise, ReferencePhase } from '../../types/practice'
import { languageDir, languageName } from '../../data/languages'

interface ReferencePanelProps {
  exercise: PracticeExercise
  phase: ReferencePhase
  onToggle: () => void
}

/**
 * Neutral manual-review panel. Deliberately unlike scored AI feedback:
 * no percentage, rating, verdict or string comparison.
 */
export function ReferencePanel({ exercise, phase, onToggle }: ReferencePanelProps) {
  if (phase !== 'revealed' && phase !== 'collapsed') return null
  const open = phase === 'revealed'

  return (
    <section
      aria-label="Reference translation"
      className="rounded-xl border border-dashed border-border-strong bg-background-subtle p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpenCheckIcon aria-hidden className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">Reference translation</h3>
          <Badge size="sm" tone="neutral">
            Manually reviewed
          </Badge>
        </div>
        <Button
          size="compact"
          variant="secondary"
          aria-expanded={open}
          onClick={onToggle}
          trailingIcon={
            open ? (
              <ChevronUpIcon aria-hidden className="h-4 w-4" />
            ) : (
              <ChevronDownIcon aria-hidden className="h-4 w-4" />
            )
          }
        >
          {open ? 'Hide' : 'Show again'}
        </Button>
      </div>

      {open ? (
        <>
          <p
            dir={languageDir(exercise.responseLanguage)}
            lang={exercise.responseLanguage}
            className="mt-3 break-words text-lg leading-relaxed text-text-primary"
          >
            {exercise.reference}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            One valid translation in {languageName(exercise.responseLanguage)}. Your answer may
            also be correct.
          </p>
        </>
      ) : null}

      <p className="mt-3 text-xs text-text-tertiary">
        Recorded as manually reviewed — this sentence counts as completed for Saved first. AI
        statistics are unchanged. Hiding the panel doesn’t remove the review.
      </p>
    </section>
  )
}

