import React from 'react'
import { Button } from '../Button'
import type { JobState } from '../../types/practice'

const copy: Record<'generation' | 'check', Record<string, string>> = {
  generation: {
    queued: 'Preparing a new sentence — waiting to start',
    running: 'Preparing a new sentence…',
    retrying: 'Preparing a new sentence — retrying after a temporary problem',
    stopping: 'Stopping…',
  },
  check: {
    queued: 'Checking your translation — waiting to start',
    running: 'Checking your translation…',
    retrying: 'Checking your translation — retrying after a temporary problem',
    stopping: 'Stopping…',
  },
}

/** Honest, indeterminate progress. No percentages, queue positions or ETAs. */
export function JobStatus({ job, onCancel }: { job: JobState; onCancel: () => void }) {
  if (!job.kind) return null
  const active = ['queued', 'running', 'retrying', 'stopping'].includes(job.phase)
  if (!active) return null
  const stopping = job.phase === 'stopping'

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-border-default bg-background-subtle p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{copy[job.kind][job.phase]}</p>
          {job.resumed ? (
            <p className="mt-0.5 text-xs text-text-secondary">
              Resuming the same request — this is not a new charge.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-text-secondary">
              {job.kind === 'check'
                ? 'Your submitted answer is kept exactly as sent.'
                : 'Your setup is kept. Nothing else on this screen will change.'}
            </p>
          )}
        </div>
        <Button size="compact" variant="secondary" onClick={onCancel} disabled={stopping}>
          {stopping ? 'Stopping…' : 'Cancel'}
        </Button>
      </div>
      <div
        aria-hidden
        className="mt-3 h-1 w-full overflow-hidden rounded-full bg-progress-track"
      >
        <div className="practice-indeterminate h-full w-1/3 rounded-full bg-progress-fill" />
      </div>
      {stopping ? (
        <p className="mt-2 text-xs text-text-secondary">
          If the AI had already started, this request may still use credits. Refunds are not
          guaranteed.
        </p>
      ) : null}
    </div>
  )
}

