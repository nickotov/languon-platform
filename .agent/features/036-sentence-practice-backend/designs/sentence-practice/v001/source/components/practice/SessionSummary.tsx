import React from 'react'
import { Button } from '../Button'
import { ProgressStrip, type VocabularyCoverage } from './ProgressStrip'
import type { SessionCounters } from '../../hooks/usePracticeSession'

interface SessionSummaryProps {
  counters: SessionCounters
  coverage: VocabularyCoverage
  onBack: () => void
  onLeave: () => void
  onOpenHistory: () => void
}

/** Summarises what actually happened in this session. No streaks, points or mastery. */
export function SessionSummary({ counters, coverage, onBack, onLeave, onOpenHistory }: SessionSummaryProps) {
  return (
    <section aria-labelledby="session-summary-title" className="space-y-5">
      <div>
        <h2 id="session-summary-title" className="text-xl font-semibold text-text-primary">
          Session summary
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {counters.exercisesShown === 0
            ? 'You haven’t practised a sentence in this session yet.'
            : `You worked through ${counters.exercisesShown} ${
                counters.exercisesShown === 1 ? 'sentence' : 'sentences'
              }${counters.generated > 0 ? `, ${counters.generated} of them newly generated` : ''}.`}
        </p>
      </div>
      <ProgressStrip counters={counters} coverage={coverage} variant="full" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onOpenHistory}>
          My history
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Keep practising
        </Button>
        <Button onClick={onLeave}>Leave practice</Button>
      </div>
    </section>
  )
}

