import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AiAttempt,
  EmptyReason,
  FailureKind,
  JobState,
  PracticeConfig,
  PracticeExercise,
  PracticeMode,
  Rating,
  ReferencePhase,
} from '../types/practice'
import { usePractice } from '../contexts/PracticeContext'
import { generationTemplates } from '../data/practiceFixtures'
import { mockCheck } from '../utils/practiceGrading'

export const MAX_ANSWER_LENGTH = 400

const idleJob: JobState = { id: null, kind: null, phase: 'idle', failure: null, resumed: false }

export interface SessionCounters {
  checks: number
  reviews: number
  ratings: Record<Rating, number>
  exercisesShown: number
  generated: number
}

const emptyCounters: SessionCounters = {
  checks: 0,
  reviews: 0,
  ratings: { perfect: 0, good: 0, 'not-bad': 0, again: 0 },
  exercisesShown: 0,
  generated: 0,
}

let jobCounter = 0
let sessionCounter = 0

export function usePracticeSession(initialConfig: PracticeConfig | null) {
  const practice = usePractice()
  const ctx = useRef(practice)
  ctx.current = practice

  const [config, setConfig] = useState<PracticeConfig | null>(initialConfig)
  const [exercise, setExercise] = useState<PracticeExercise | null>(null)
  const [emptyReason, setEmptyReason] = useState<EmptyReason>(null)
  const [draft, setDraftState] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [job, setJob] = useState<JobState>(idleJob)
  const [revealedHints, setRevealedHints] = useState<string[]>([])
  const [reference, setReference] = useState<ReferencePhase>('hidden')
  const [referenceFailure, setReferenceFailure] = useState<FailureKind | null>(null)
  const [referenceUsed, setReferenceUsed] = useState(false)
  const [currentAttempt, setCurrentAttempt] = useState<AiAttempt | null>(null)
  const [exerciseAttempts, setExerciseAttempts] = useState<AiAttempt[]>([])
  const [counters, setCounters] = useState<SessionCounters>(emptyCounters)
  const [validationError, setValidationError] = useState<string | null>(null)

  const visited = useRef<string[]>([])
  const timers = useRef<number[]>([])
  const token = useRef(0)
  const sessionId = useRef(`session-${++sessionCounter}`)
  const templateCursor = useRef(0)

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const busy =
    job.phase === 'queued' ||
    job.phase === 'running' ||
    job.phase === 'retrying' ||
    job.phase === 'stopping'

  const resetExerciseState = () => {
    setDraftState('')
    setSubmitted(null)
    setRevealedHints([])
    setReference('hidden')
    setReferenceFailure(null)
    setReferenceUsed(false)
    setCurrentAttempt(null)
    setExerciseAttempts([])
    setValidationError(null)
  }

  const show = useCallback((next: PracticeExercise) => {
    resetExerciseState()
    setEmptyReason(null)
    setExercise(next)
    visited.current = [...visited.current, next.id]
    ctx.current.markExposed(next)
    setCounters((prev) => ({ ...prev, exercisesShown: prev.exercisesShown + 1 }))
  }, [])

  const eligiblePool = useCallback((active: PracticeConfig) => {
    return ctx.current
      .savedPoolFor(active.dictionaryId)
      .filter(
        (item) =>
          item.direction === active.direction &&
          item.status === 'current' &&
          item.targets.length > 0 &&
          item.targets.every((target) => active.entryIds.includes(target.entryId)),
      )
  }, [])

  /** Simulated async job with honest phases and no invented progress. */
  const runJob = useCallback(
    (
      kind: 'generation' | 'check',
      onSuccess: () => void,
      existingId: string | null = null,
    ) => {
      const { scenario } = ctx.current
      const outcome = kind === 'generation' ? scenario.generationOutcome : scenario.checkOutcome

      // Requests that are refused up front never start (and never charge).
      const refused: FailureKind | null =
        scenario.credits === 'zero'
          ? 'credits'
          : scenario.model === 'unavailable'
            ? 'model'
            : scenario.capacity === 'busy'
              ? 'capacity'
              : null
      if (refused && !existingId) {
        setJob({ id: null, kind, phase: 'failed', failure: refused, resumed: false })
        return
      }

      const id = existingId ?? `job-${++jobCounter}`
      token.current += 1
      const current = token.current
      clearTimers()
      setJob({ id, kind, phase: existingId ? 'running' : 'queued', failure: null, resumed: Boolean(existingId) })

      const at = (ms: number, fn: () => void) =>
        timers.current.push(
          window.setTimeout(() => {
            if (token.current !== current) return
            fn()
          }, ms),
        )

      const finish = (delay: number) =>
        at(delay, () => {
          const live = ctx.current.scenario
          if (live.network === 'offline') {
            setJob({ id, kind, phase: 'failed', failure: 'offline', resumed: false })
            return
          }
          if (outcome === 'fail') {
            setJob({ id, kind, phase: 'failed', failure: 'provider', resumed: false })
            return
          }
          if (outcome === 'timeout') {
            setJob({ id, kind, phase: 'failed', failure: 'timeout', resumed: false })
            return
          }
          setJob({ id, kind, phase: 'completed', failure: null, resumed: false })
          onSuccess()
        })

      if (!existingId) at(800, () => setJob((prev) => ({ ...prev, phase: 'running' })))
      if (outcome === 'retrying') {
        at(existingId ? 1200 : 2000, () => setJob((prev) => ({ ...prev, phase: 'retrying' })))
        at(existingId ? 2400 : 3200, () => setJob((prev) => ({ ...prev, phase: 'running' })))
        finish(existingId ? 3600 : 4400)
      } else {
        finish(existingId ? 1600 : 2600)
      }
    },
    [clearTimers],
  )

  const startGeneration = useCallback(
    (active: PracticeConfig) => {
      setExercise(null)
      resetExerciseState()
      runJob('generation', () => {
        const candidates = generationTemplates.filter(
          (template) => template.direction === active.direction,
        )
        const scoped = candidates.filter((template) =>
          template.targets.every((target) => active.entryIds.includes(target.entryId)),
        )
        const pool = scoped.length > 0 ? scoped : candidates
        const template = pool[templateCursor.current % Math.max(pool.length, 1)]
        templateCursor.current += 1
        if (!template) return
        const generated: PracticeExercise = {
          ...template,
          id: `gen-${Date.now().toString(36)}-${templateCursor.current}`,
          origin: ctx.current.viewer === 'owner' ? 'owner' : 'me',
          status: 'current',
          createdAt: new Date().toISOString(),
        }
        ctx.current.addGenerated(generated)
        setCounters((prev) => ({ ...prev, generated: prev.generated + 1 }))
        show(generated)
      })
    },
    [runJob, show],
  )

  const loadNext = useCallback(
    (active: PracticeConfig) => {
      const pool = eligiblePool(active)
      if (active.mode === 'new-only') {
        startGeneration(active)
        return
      }
      if (active.mode === 'review-only') {
        if (pool.length === 0) {
          setExercise(null)
          setEmptyReason('review-empty')
          return
        }
        const candidate = pool.find((item) => !visited.current.includes(item.id))
        if (!candidate) {
          setExercise(null)
          setEmptyReason('review-exhausted')
          return
        }
        show(candidate)
        return
      }
      const candidate = pool.find(
        (item) =>
          !ctx.current.completedIds.includes(item.id) && !visited.current.includes(item.id),
      )
      if (candidate) show(candidate)
      else startGeneration(active)
    },
    [eligiblePool, show, startGeneration],
  )

  // Start a fresh session whenever a new configuration is supplied.
  useEffect(() => {
    if (!initialConfig) return
    sessionId.current = `session-${++sessionCounter}`
    visited.current = []
    setCounters(emptyCounters)
    setJob(idleJob)
    setConfig(initialConfig)
    loadNext(initialConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConfig])

  const setDraft = useCallback((value: string) => {
    setDraftState(value)
    setValidationError(null)
  }, [])

  const check = useCallback(() => {
    if (!exercise || !config || busy) return
    const answer = draft
    if (!answer.trim()) {
      setValidationError('Write a translation before checking.')
      return
    }
    if (answer.length > MAX_ANSWER_LENGTH) {
      setValidationError(
        `Your answer is ${answer.length - MAX_ANSWER_LENGTH} characters over the ${MAX_ANSWER_LENGTH}-character limit. Shorten it to check.`,
      )
      return
    }
    const assisted = referenceUsed
    const target = exercise
    const explanationLanguage = config.explanationLanguage
    setSubmitted(answer)
    setCurrentAttempt(null)
    runJob('check', () => {
      const result = mockCheck(target, answer, explanationLanguage)
      const attempt: AiAttempt = {
        id: `att-${Date.now().toString(36)}`,
        exerciseId: target.id,
        dictionaryId: target.dictionaryId,
        sentence: target.segments.map((segment) => segment.text).join(''),
        sourceLanguage: target.sourceLanguage,
        responseLanguage: target.responseLanguage,
        submittedAnswer: answer,
        result,
        assisted,
        createdAt: new Date().toISOString(),
        exerciseStatus: target.status,
      }
      ctx.current.addAttempt(attempt)
      ctx.current.markCompleted(target.id)
      setCurrentAttempt(attempt)
      setExerciseAttempts((prev) => [attempt, ...prev])
      setCounters((prev) => ({
        ...prev,
        checks: prev.checks + 1,
        ratings: { ...prev.ratings, [result.rating]: prev.ratings[result.rating] + 1 },
      }))
    })
  }, [busy, config, draft, exercise, referenceUsed, runJob])

  const lastAction = useRef<'check' | 'generation' | null>(null)
  useEffect(() => {
    if (job.kind) lastAction.current = job.kind
  }, [job.kind])

  const retryJob = useCallback(() => {
    if (!config) return
    if (job.kind === 'generation') {
      if (job.id && ['offline', 'timeout', 'provider'].includes(job.failure ?? '')) {
        // Resume the same request — not a new charge.
        runJob(
          'generation',
          () => {
            const fallback = generationTemplates.find((item) => item.direction === config.direction)
            if (!fallback) return
            const generated: PracticeExercise = {
              ...fallback,
              id: `gen-${Date.now().toString(36)}`,
              origin: ctx.current.viewer === 'owner' ? 'owner' : 'me',
              status: 'current',
              createdAt: new Date().toISOString(),
            }
            ctx.current.addGenerated(generated)
            setCounters((prev) => ({ ...prev, generated: prev.generated + 1 }))
            show(generated)
          },
          job.id,
        )
      } else {
        startGeneration(config)
      }
      return
    }
    if (job.kind === 'check' && exercise && submitted) {
      const answer = submitted
      const target = exercise
      const assisted = referenceUsed
      const resume = job.id && ['offline', 'timeout', 'provider'].includes(job.failure ?? '') ? job.id : null
      runJob(
        'check',
        () => {
          const result = mockCheck(target, answer, config.explanationLanguage)
          const attempt: AiAttempt = {
            id: `att-${Date.now().toString(36)}`,
            exerciseId: target.id,
            dictionaryId: target.dictionaryId,
            sentence: target.segments.map((segment) => segment.text).join(''),
            sourceLanguage: target.sourceLanguage,
            responseLanguage: target.responseLanguage,
            submittedAnswer: answer,
            result,
            assisted,
            createdAt: new Date().toISOString(),
            exerciseStatus: target.status,
          }
          ctx.current.addAttempt(attempt)
          ctx.current.markCompleted(target.id)
          setCurrentAttempt(attempt)
          setExerciseAttempts((prev) => [attempt, ...prev])
          setCounters((prev) => ({
            ...prev,
            checks: prev.checks + 1,
            ratings: { ...prev.ratings, [result.rating]: prev.ratings[result.rating] + 1 },
          }))
        },
        resume,
      )
    }
  }, [config, exercise, job, referenceUsed, runJob, show, startGeneration, submitted])

  const cancelJob = useCallback(() => {
    if (!busy) return
    setJob((prev) => ({ ...prev, phase: 'stopping' }))
    token.current += 1 // a late response can no longer replace anything
    clearTimers()
    timers.current.push(
      window.setTimeout(() => {
        setJob((prev) => ({ ...prev, phase: 'cancelled' }))
      }, 900),
    )
  }, [busy, clearTimers])

  const dismissJob = useCallback(() => setJob(idleJob), [])

  const revealHint = useCallback((targetId: string) => {
    setRevealedHints((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]))
  }, [])

  const revealReference = useCallback(() => {
    if (!exercise || reference === 'pending') return
    const target = exercise
    setReference('pending')
    setReferenceFailure(null)
    window.setTimeout(() => {
      const { scenario } = ctx.current
      if (scenario.network === 'offline' || scenario.revealOutcome === 'network-fail') {
        setReference('failed')
        setReferenceFailure('offline')
        return
      }
      if (scenario.revealOutcome === 'outdated') {
        setReference('failed')
        setReferenceFailure('outdated')
        return
      }
      // Replay-safe: the same session + exercise never records a second review.
      const recorded = ctx.current.addManualReview(
        {
          id: `mr-${Date.now().toString(36)}`,
          exerciseId: target.id,
          dictionaryId: target.dictionaryId,
          sentence: target.segments.map((segment) => segment.text).join(''),
          reference: target.reference,
          sourceLanguage: target.sourceLanguage,
          responseLanguage: target.responseLanguage,
          createdAt: new Date().toISOString(),
          exerciseStatus: target.status,
        },
        `${sessionId.current}:${target.id}`,
      )
      if (recorded) setCounters((prev) => ({ ...prev, reviews: prev.reviews + 1 }))
      ctx.current.markCompleted(target.id)
      setReferenceUsed(true)
      setReference('revealed')
    }, 700)
  }, [exercise, reference])

  const toggleReference = useCallback(() => {
    setReference((prev) => (prev === 'revealed' ? 'collapsed' : prev === 'collapsed' ? 'revealed' : prev))
  }, [])

  const next = useCallback(() => {
    if (!config || busy) return
    setJob(idleJob)
    loadNext(config)
  }, [busy, config, loadNext])

  const restartReview = useCallback(() => {
    if (!config) return
    visited.current = []
    loadNext(config)
  }, [config, loadNext])

  const changeMode = useCallback(
    (mode: PracticeMode) => {
      if (!config) return
      const updated = { ...config, mode }
      setConfig(updated)
      visited.current = []
      setJob(idleJob)
      loadNext(updated)
    },
    [config, loadNext],
  )

  const { scenario } = practice
  const checkUnavailable: FailureKind | null =
    scenario.credits === 'zero'
      ? 'credits'
      : scenario.model === 'unavailable'
        ? 'model'
        : scenario.capacity === 'busy'
          ? 'capacity'
          : null

  return {
    config,
    exercise,
    emptyReason,
    draft,
    setDraft,
    submitted,
    job,
    busy,
    revealedHints,
    revealHint,
    reference,
    referenceFailure,
    referenceUsed,
    revealReference,
    toggleReference,
    currentAttempt,
    exerciseAttempts,
    counters,
    validationError,
    checkUnavailable,
    check,
    retryJob,
    cancelJob,
    dismissJob,
    next,
    restartReview,
    changeMode,
  }
}

export type PracticeSession = ReturnType<typeof usePracticeSession>

