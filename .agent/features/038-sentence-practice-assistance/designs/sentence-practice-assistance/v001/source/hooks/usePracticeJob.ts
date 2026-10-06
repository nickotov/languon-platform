import { useCallback, useEffect, useRef, useState } from 'react'
import type { FailureKind, JobKind, JobState } from '../types/practice'

export type JobOutcome =
  | 'success'
  | 'retrying'
  | 'retry-after'
  | 'delayed'
  | 'uncertain'
  | 'poll'
  | 'fail'
  | 'timeout'
  | 'malformed'
  | 'wrong-language'

export interface JobOptions {
  kind: JobKind
  /** Evaluated whenever work is admitted or resumed. */
  precondition: () => FailureKind | null
  outcome: () => JobOutcome
  model: string | null
  onSuccess: () => void
  /** A response that arrives after a reset/restart. It never replaces current content. */
  onStale?: () => void
}

export const IDLE_JOB: JobState = {
  id: null,
  kind: null,
  phase: 'idle',
  failure: null,
  resumed: false,
  retryAfter: null,
  model: null,
}

const BUSY = ['queued', 'running', 'recovering', 'retry-after', 'delayed', 'uncertain', 'stopping']
export const isBusy = (job: JobState) => BUSY.includes(job.phase)
/** Phases where the original work is held and can be resumed without a new paid request. */
export const RESUMABLE: FailureKind[] = ['offline', 'poll', 'timeout', 'provider', 'malformed']

let jobCounter = 0
const SERVER_RETRY_SECONDS = 6

/**
 * Simulated async job lifecycle with honest phases, bounded automatic recovery,
 * explicit resume, cancellation and fencing of late responses.
 */
export function usePracticeJob(initial: JobState = IDLE_JOB, resolveOptions?: (job: JobState) => JobOptions | null) {
  const [job, setJob] = useState<JobState>(initial)
  const jobRef = useRef(job)
  jobRef.current = job
  const token = useRef(0)
  const timers = useRef<number[]>([])
  const options = useRef<JobOptions | null>(null)

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current.forEach((id) => window.clearInterval(id))
    timers.current = []
  }
  useEffect(() => clear, [])

  const later = (ms: number, fn: () => void) => {
    const mine = token.current
    timers.current.push(window.setTimeout(() => token.current === mine && fn(), ms))
  }

  const succeed = useCallback(() => {
    setJob((prev) => ({ ...prev, phase: 'completed', failure: null, retryAfter: null }))
    options.current?.onSuccess()
  }, [])

  const settle = useCallback(
    (outcome: JobOutcome) => {
      const set = (patch: Partial<JobState>) => setJob((prev) => ({ ...prev, ...patch }))
      switch (outcome) {
        case 'success':
          return succeed()
        case 'retrying':
        case 'wrong-language':
          set({ phase: 'recovering', failure: outcome === 'wrong-language' ? 'wrong-language' : null })
          return later(1500, () => {
            set({ resumed: true })
            succeed()
          })
        case 'retry-after': {
          set({ phase: 'retry-after', retryAfter: SERVER_RETRY_SECONDS })
          const mine = token.current
          const interval = window.setInterval(() => {
            if (token.current !== mine) return window.clearInterval(interval)
            setJob((prev) => {
              if (prev.phase !== 'retry-after' || !prev.retryAfter) return prev
              return { ...prev, retryAfter: prev.retryAfter - 1 }
            })
          }, 1000)
          timers.current.push(interval)
          return undefined
        }
        case 'delayed':
          return set({ phase: 'delayed' })
        case 'uncertain':
          return set({ phase: 'uncertain' })
        case 'poll':
          return set({ phase: 'failed', failure: 'poll' })
        case 'timeout':
          return set({ phase: 'failed', failure: 'timeout' })
        case 'malformed':
          return set({ phase: 'failed', failure: 'malformed' })
        default:
          return set({ phase: 'failed', failure: 'provider' })
      }
    },
    [succeed],
  )

  const admit = useCallback(
    (opts: JobOptions, resumeId: string | null) => {
      clear()
      token.current += 1
      options.current = opts
      const blocked = opts.precondition()
      const id = resumeId ?? `job-${++jobCounter}`
      if (blocked) {
        setJob({ ...IDLE_JOB, id: resumeId, kind: opts.kind, phase: 'failed', failure: blocked, resumed: Boolean(resumeId), model: opts.model })
        return
      }
      setJob({ ...IDLE_JOB, id, kind: opts.kind, phase: resumeId ? 'running' : 'queued', resumed: Boolean(resumeId), model: opts.model })
      if (resumeId) {
        later(900, succeed)
        return
      }
      later(600, () => setJob((prev) => ({ ...prev, phase: 'running' })))
      later(1700, () => settle(opts.outcome()))
    },
    [settle, succeed],
  )

  const start = useCallback((opts: JobOptions) => admit(opts, null), [admit])

  /** Resume the same work (same id) — never a replacement paid request. */
  const resume = useCallback(() => {
    const current = jobRef.current
    const opts = options.current ?? resolveOptions?.(current) ?? null
    if (!opts) return
    admit(opts, current.id ?? `job-${++jobCounter}`)
  }, [admit, resolveOptions])

  /** Retry a failure. Admission failures start fresh; held work resumes. */
  const retry = useCallback(() => {
    const current = jobRef.current
    const opts = options.current ?? resolveOptions?.(current) ?? null
    if (!opts) return
    if (current.failure && RESUMABLE.includes(current.failure) && current.id) admit(opts, current.id)
    else admit(opts, null)
  }, [admit, resolveOptions])

  const cancel = useCallback(() => {
    if (!isBusy(jobRef.current)) return
    clear()
    token.current += 1
    setJob((prev) => ({ ...prev, phase: 'stopping', retryAfter: null }))
    later(1100, () => setJob((prev) => ({ ...prev, phase: 'cancelled' })))
  }, [])

  const dismiss = useCallback(() => {
    clear()
    token.current += 1
    options.current = null
    setJob(IDLE_JOB)
  }, [])

  /** Restart/reset: fence any in-flight response. */
  const reset = useCallback(() => {
    const wasBusy = isBusy(jobRef.current) && jobRef.current.phase !== 'stopping'
    const stale = options.current?.onStale
    clear()
    token.current += 1
    options.current = null
    setJob(IDLE_JOB)
    if (wasBusy && stale) window.setTimeout(stale, 1200)
  }, [])

  const hasOptions = useCallback(() => options.current !== null || Boolean(resolveOptions?.(jobRef.current)), [resolveOptions])

  return { job, busy: isBusy(job), start, resume, retry, cancel, dismiss, reset, setJob, hasOptions }
}

