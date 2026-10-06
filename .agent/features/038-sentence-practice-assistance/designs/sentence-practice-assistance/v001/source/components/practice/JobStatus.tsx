import React from 'react'
import { Button } from '../Button'
import type { JobKind, JobState } from '../../types/practice'

const work: Record<JobKind, string> = {
  generation: 'Preparing a sentence',
  check: 'Checking your answer',
  reveal: 'Revealing the reference',
  replay: 'Loading saved replay',
  history: 'Loading personal results',
}

interface JobStatusProps {
  job: JobState
  onCancel: () => void
  onResume: () => void
}

/** Honest, indeterminate progress. No percentages, queue positions or estimates. */
export function JobStatus({ job, onCancel, onResume }: JobStatusProps) {
  if (!job.kind) return null
  const visible = ['queued', 'running', 'recovering', 'retry-after', 'delayed', 'uncertain', 'stopping'].includes(job.phase)
  if (!visible) return null
  const label = work[job.kind]
  const paid = job.kind === 'generation' || job.kind === 'check'
  const resumeLabel = job.kind === 'check' ? 'Resume checking' : 'Resume preparing'

  let title = label
  let body: string | null = null
  let action: React.ReactNode = null
  const animated = ['queued', 'running', 'recovering', 'stopping'].includes(job.phase)

  switch (job.phase) {
    case 'queued':
      title = `${label} — waiting to start`
      break
    case 'running':
      title = job.resumed ? `${label} — resumed the same request` : label
      break
    case 'recovering':
      title =
        job.failure === 'wrong-language'
          ? 'The sentence came back in the wrong language — preparing it again'
          : 'Connection interrupted — reconnecting to the same request'
      body = 'Recovering automatically for a short while. Your work is kept.'
      break
    case 'retry-after':
      title = job.retryAfter ? `AI is busy — you can resume in ${job.retryAfter}s` : 'You can resume now'
      body = 'The service told us when to try again. Resuming continues the same request.'
      action = (
        <Button size="compact" variant="secondary" disabled={Boolean(job.retryAfter)} onClick={onResume}>
          {resumeLabel}
        </Button>
      )
      break
    case 'delayed':
      title = 'This is taking longer than usual'
      body = 'Automatic recovery has stopped. Resuming picks up the same request — it doesn’t start a new one.'
      action = (
        <Button size="compact" variant="secondary" onClick={onResume}>
          {resumeLabel}
        </Button>
      )
      break
    case 'uncertain':
      title = 'We lost the response — your request may still be running'
      body = 'Get the result before starting anything new. Your answer is kept in this session.'
      action = (
        <Button size="compact" variant="secondary" onClick={onResume}>
          Get result
        </Button>
      )
      break
    case 'stopping':
      title = 'Stopping…'
      body = paid ? 'Work that already started may still use credits.' : null
      break
    default:
      break
  }

  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-border-default bg-background-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <div className="flex flex-wrap gap-2">
          {action}
          {job.phase === 'stopping' ? (
            <Button size="compact" variant="secondary" disabled>
              Stopping…
            </Button>
          ) : (
            <Button size="compact" variant="secondary" onClick={onCancel}>
              Stop request
            </Button>
          )}
        </div>
      </div>
      {body ? <p className="mt-1 text-xs text-text-secondary">{body}</p> : null}
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-progress-track" aria-hidden>
        <div className={`h-full w-1/3 rounded-full bg-progress-fill ${animated ? 'practice-indeterminate' : 'opacity-40'}`} />
      </div>
      {job.model && job.kind === 'check' ? (
        <p className="mt-1 text-[11px] text-text-tertiary">Uses the AI preference chosen when this check started.</p>
      ) : null}
    </div>
  )
}

