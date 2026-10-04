import React from 'react'
import type { Rating } from '../../types/practice'
import type { SessionCounters } from '../../hooks/usePracticeSession'

export interface VocabularyCoverage {
  eligible: number
  seen: number
}

interface ProgressStripProps {
  counters: SessionCounters
  coverage: VocabularyCoverage
  variant?: 'inline' | 'full'
}

const ratingOrder: { key: Rating; label: string }[] = [
  { key: 'perfect', label: 'Perfect' },
  { key: 'good', label: 'Good' },
  { key: 'not-bad', label: 'Not bad' },
  { key: 'again', label: 'Practise again later' },
]

/**
 * Personal activity only. AI checks and manual reviews are separate events and are
 * never added together into a mastery figure.
 */
export function ProgressStrip({ counters, coverage, variant = 'inline' }: ProgressStripProps) {
  const notSeen = Math.max(coverage.eligible - coverage.seen, 0)

  if (variant === 'inline') {
    return (
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        <div className="flex gap-1">
          <dt>Vocabulary seen</dt>
          <dd className="font-semibold tabular-nums text-text-primary">
            {coverage.seen} of {coverage.eligible}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>AI checks</dt>
          <dd className="font-semibold tabular-nums text-text-primary">{counters.checks}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Manual reviews</dt>
          <dd className="font-semibold tabular-nums text-text-primary">{counters.reviews}</dd>
        </div>
      </dl>
    )
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Eligible vocabulary', value: coverage.eligible },
          { label: 'Vocabulary seen', value: coverage.seen },
          { label: 'Not yet seen', value: notSeen },
          { label: 'AI checks this session', value: counters.checks },
          { label: 'Manual reviews this session', value: counters.reviews },
          { label: 'Sentences shown', value: counters.exercisesShown },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border-default p-3">
            <dt className="text-xs text-text-secondary">{item.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          AI ratings this session
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ratingOrder.map((rating) => (
            <li
              key={rating.key}
              className="flex items-center justify-between gap-2 rounded-lg border border-border-default px-3 py-2 text-sm"
            >
              <span className="text-text-secondary">{rating.label}</span>
              <span className="font-semibold tabular-nums text-text-primary">
                {counters.ratings[rating.key]}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-text-tertiary">
        These counters describe your activity, not mastery. AI checks and manual reviews can
        cover the same sentence, so they aren’t added together. New or edited vocabulary may
        still need fresh practice.
      </p>
    </div>
  )
}

