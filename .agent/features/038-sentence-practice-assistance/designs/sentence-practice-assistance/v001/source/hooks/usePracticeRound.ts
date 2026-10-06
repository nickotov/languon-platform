import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePractice } from '../contexts/PracticeContext'
import { usePracticeJob, IDLE_JOB, type JobOptions } from './usePracticeJob'
import { ruTemplates } from '../data/practiceFixturesRu'
import { buildAttempt } from '../utils/practiceGrading'
import { compareWithReference } from '../utils/referenceCompare'
import { answerValidation } from '../utils/codePoints'
import { sentenceText } from '../utils/sentenceMarkup'
import type {
  AiAttempt,
  FailureKind,
  JobState,
  PracticeConfig,
  PracticeExercise,
  PracticeMode,
  ReferenceState,
  RoundItem,
  SessionCounters,
  SessionResults,
} from '../types/practice'

export type RoundStatus = 'loading' | 'active' | 'empty' | 'complete' | 'access-lost'
export type EmptyReason = 'review-empty' | 'review-exhausted' | 'no-more' | null
export type AiBlock = 'credits' | 'model' | 'capacity' | null

export interface RoundState {
  status: RoundStatus
  emptyReason: EmptyReason
  accessLoss: FailureKind | null
  mode: PracticeMode
  items: RoundItem[]
  seen: string[]
  isFinal: boolean
  draft: string
  submitted: string | null
  validationError: string | null
  revealedHints: string[]
  reference: ReferenceState
  counters: SessionCounters
  results: SessionResults | null
  replaySource: string[] | null
  replayIssue: { position: number; reason: 'outdated' | 'removed' | 'revoked' } | null
  fresh: { phase: 'idle' | 'admitting' | 'failed'; failure: FailureKind | null }
  fencedNotice: boolean
}

export const emptyCounters = (): SessionCounters => ({
  examples: 0,
  checks: 0,
  reviews: 0,
  skipped: 0,
  ratings: { perfect: 0, good: 0, 'not-bad': 0, again: 0 },
})

const HIDDEN_REFERENCE: ReferenceState = { phase: 'hidden', comparison: null, failure: null }

const initialState = (mode: PracticeMode): RoundState => ({
  status: 'loading',
  emptyReason: null,
  accessLoss: null,
  mode,
  items: [],
  seen: [],
  isFinal: false,
  draft: '',
  submitted: null,
  validationError: null,
  revealedHints: [],
  reference: HIDDEN_REFERENCE,
  counters: emptyCounters(),
  results: null,
  replaySource: null,
  replayIssue: null,
  fresh: { phase: 'idle', failure: null },
  fencedNotice: false,
})

const TEMPLATES: Record<string, typeof ruTemplates> = { 'dict-fr-ru': ruTemplates }
const requiredEntries = (exercise: PracticeExercise) =>
  Array.from(new Set(exercise.hints.filter((hint) => hint.role === 'required' && hint.entryId).map((hint) => hint.entryId!)))

let generatedCounter = 0

export interface RoundSeed {
  state?: Partial<RoundState>
  job?: JobState
}

/**
 * One finite practice round. Lives above the presentation so dialog/full screen
 * switching, inner views and native full-screen exit never reset it.
 */
export function usePracticeRound(config: PracticeConfig | null, seed?: RoundSeed) {
  const practice = usePractice()
  const { scenario } = practice
  const scenarioRef = useRef(scenario)
  scenarioRef.current = scenario
  const modelRef = useRef(practice.aiModel)
  modelRef.current = practice.aiModel

  const [state, setState] = useState<RoundState>(() => ({ ...initialState(config?.mode ?? 'saved-first'), ...seed?.state }))
  const stateRef = useRef(state)
  stateRef.current = state
  const patch = useCallback((next: Partial<RoundState> | ((prev: RoundState) => Partial<RoundState>)) => {
    setState((prev) => {
      const value = { ...prev, ...(typeof next === 'function' ? next(prev) : next) }
      stateRef.current = value
      return value
    })
  }, [])

  const roundKey = useRef(`round-${Date.now()}`)
  const usedTemplates = useRef(new Set<number>())
  const revealToken = useRef(0)

  const resolveOptions = useCallback((): JobOptions | null => null, [])
  const job = usePracticeJob(seed?.job ?? IDLE_JOB, resolveOptions)

  const exercise = state.items.length ? state.items[state.items.length - 1].exercise : null
  const currentItem = state.items.length ? state.items[state.items.length - 1] : null
  const selected = config?.entryIds ?? []

  // ---------- candidates ----------
  const savedCandidate = useCallback(
    (s: RoundState) => {
      if (!config) return null
      const visited = s.items.map((item) => item.exercise.id)
      return (
        practice
          .savedPoolFor(config.dictionaryId)
          .filter((ex) => ex.direction === config.direction && ex.status === 'current' && !visited.includes(ex.id))
          .filter((ex) => {
            const entries = requiredEntries(ex)
            return entries.length > 0 && entries.every((id) => selected.includes(id))
          })
          .find((ex) => s.mode === 'review' || requiredEntries(ex).some((id) => !s.seen.includes(id))) ?? null
      )
    },
    [config, practice, selected],
  )

  const templateCandidate = useCallback(
    (s: RoundState) => {
      if (!config) return null
      const list = TEMPLATES[config.dictionaryId] ?? []
      const fits = list
        .map((template, index) => ({ template, index }))
        .filter(({ template }) => template.direction === config.direction)
        .filter(({ template }) => {
          const entries = template.hints.filter((h) => h.role === 'required').map((h) => h.entryId!)
          return entries.every((id) => selected.includes(id)) && entries.some((id) => !s.seen.includes(id))
        })
      return fits.find(({ index }) => !usedTemplates.current.has(index)) ?? fits[0] ?? null
    },
    [config, selected],
  )

  const hasMore = useCallback(
    (s: RoundState) => {
      if (s.replaySource) return s.items.length < s.replaySource.length
      if (selected.every((id) => s.seen.includes(id))) return false
      if (s.mode === 'review') return Boolean(savedCandidate(s))
      if (s.mode === 'saved-first') return Boolean(savedCandidate(s) || templateCandidate(s))
      return Boolean(templateCandidate(s))
    },
    [savedCandidate, selected, templateCandidate],
  )

  // ---------- presenting ----------
  const present = useCallback(
    (ex: PracticeExercise, base?: Partial<RoundState>) => {
      const prev = { ...stateRef.current, ...base }
      const covered = requiredEntries(ex).filter((id) => selected.includes(id))
      const seen = Array.from(new Set([...prev.seen, ...covered]))
      const items = [...prev.items, { exercise: ex, attempts: [], reviewed: false, comparison: null, skipped: false, finalDraft: '' }]
      const next: RoundState = {
        ...prev,
        status: 'active',
        emptyReason: null,
        items,
        seen,
        draft: '',
        submitted: null,
        validationError: null,
        revealedHints: [],
        reference: HIDDEN_REFERENCE,
        counters: { ...prev.counters, examples: prev.counters.examples + 1 },
      }
      next.isFinal = !hasMore(next)
      practice.markLifetimeSeen(covered)
      stateRef.current = next
      setState(next)
    },
    [hasMore, practice, selected],
  )

  const generationOptions = useCallback(
    (onReady: (ex: PracticeExercise) => void, getState: () => RoundState): JobOptions => ({
      kind: 'generation',
      model: modelRef.current,
      precondition: () => {
        const sc = scenarioRef.current
        if (sc.network === 'offline') return 'offline'
        if (sc.credits === 'zero') return 'credits'
        if (sc.model === 'unavailable') return 'model'
        if (sc.capacity === 'busy') return 'capacity'
        return null
      },
      outcome: () => scenarioRef.current.generationOutcome,
      onSuccess: () => {
        const pick = templateCandidate(getState())
        if (!pick || !config) return
        usedTemplates.current.add(pick.index)
        const ex: PracticeExercise = {
          ...pick.template,
          id: `gen-${++generatedCounter}-${pick.index}`,
          origin: practice.viewer === 'owner' ? 'owner' : 'me',
          status: 'current',
          createdAt: new Date().toISOString(),
        }
        practice.addGenerated(ex)
        onReady(ex)
      },
    }),
    [config, practice, templateCandidate],
  )

  const loadNext = useCallback(
    (base?: Partial<RoundState>) => {
      if (!config) return
      const s = { ...stateRef.current, ...base }
      if (s.replaySource) {
        const id = s.replaySource[s.items.length]
        const ex = id ? practice.exerciseById(id) : undefined
        patch({ ...base, status: 'loading' })
        job.start({
          kind: 'replay',
          model: null,
          precondition: () => (scenarioRef.current.network === 'offline' ? 'offline' : null),
          outcome: () => 'success',
          onSuccess: () => ex && present(ex, base),
        })
        return
      }
      const saved = s.mode === 'new' ? null : savedCandidate(s)
      if (saved) {
        job.dismiss()
        present(saved, base)
        return
      }
      if (s.mode === 'review') {
        patch({ ...base, status: 'empty', emptyReason: s.items.length ? 'review-exhausted' : 'review-empty' })
        return
      }
      if (!templateCandidate(s)) {
        patch({ ...base, status: 'empty', emptyReason: 'no-more' })
        return
      }
      patch({ ...base, status: 'loading' })
      job.start(generationOptions((ex) => present(ex), () => stateRef.current))
    },
    [config, generationOptions, job, patch, practice, present, savedCandidate, templateCandidate],
  )

  // Start once (unless a gallery seed provides the state).
  const started = useRef(Boolean(seed?.state))
  useEffect(() => {
    if (!config || started.current) return
    started.current = true
    loadNext({ mode: config.mode })
  }, [config, loadNext])

  // ---------- access loss: clear protected content immediately ----------
  useEffect(() => {
    if (scenario.access === 'ok' || stateRef.current.status === 'access-lost') return
    job.reset()
    revealToken.current += 1
    const loss: FailureKind = scenario.access
    patch({
      ...initialState(stateRef.current.mode),
      status: 'access-lost',
      accessLoss: loss,
    })
  }, [scenario.access, job, patch])

  // ---------- completion ----------
  const complete = useCallback(() => {
    const s = stateRef.current
    const results: SessionResults = {
      items: s.items,
      counters: s.counters,
      coverage: { selected: selected.length, seen: s.seen.length },
      sequence: s.items.map((item) => item.exercise.id),
      wasReplay: Boolean(s.replaySource),
    }
    patch({ status: 'complete', results, replayIssue: null, fresh: { phase: 'idle', failure: null } })
  }, [patch, selected.length])

  const updateCurrent = useCallback(
    (fn: (item: RoundItem) => RoundItem, extra: (prev: RoundState) => Partial<RoundState> = () => ({})) => {
      patch((prev) => {
        if (!prev.items.length) return {}
        const items = [...prev.items]
        items[items.length - 1] = fn(items[items.length - 1])
        return { items, ...extra(prev) }
      })
    },
    [patch],
  )

  // ---------- draft & hints ----------
  const setDraft = useCallback((draft: string) => patch({ draft, validationError: null }), [patch])
  const markHintSeen = useCallback(
    (hintId: string) => patch((prev) => (prev.revealedHints.includes(hintId) ? {} : { revealedHints: [...prev.revealedHints, hintId] })),
    [patch],
  )

  // ---------- AI check ----------
  const aiBlocked: AiBlock = scenario.credits === 'zero' ? 'credits' : scenario.model === 'unavailable' ? 'model' : scenario.capacity === 'busy' ? 'capacity' : null

  const check = useCallback((force = false) => {
    const s = stateRef.current
    const ex = s.items[s.items.length - 1]?.exercise
    if (!ex || !config || (job.busy && !force)) return
    const submitted = force && s.submitted !== null ? s.submitted : s.draft
    const error = answerValidation(submitted)
    if (error) {
      patch({ validationError: error })
      return
    }
    const assisted = s.reference.phase === 'shown' || s.reference.phase === 'collapsed'
    patch({ submitted, validationError: null })
    job.start({
      kind: 'check',
      model: modelRef.current,
      precondition: () => {
        const sc = scenarioRef.current
        if (sc.network === 'offline') return 'offline'
        if (sc.credits === 'zero') return 'credits'
        if (sc.model === 'unavailable') return 'model'
        if (sc.capacity === 'busy') return 'capacity'
        return null
      },
      outcome: () => scenarioRef.current.checkOutcome,
      onSuccess: () => {
        const attempt: AiAttempt = buildAttempt(ex, submitted, config.explanationLanguage, { assisted })
        practice.addAttempt(attempt)
        updateCurrent(
          (item) => ({ ...item, attempts: [...item.attempts, attempt], finalDraft: submitted }),
          (prev) => ({
            counters: {
              ...prev.counters,
              checks: prev.counters.checks + 1,
              ratings: { ...prev.counters.ratings, [attempt.result.rating]: prev.counters.ratings[attempt.result.rating] + 1 },
            },
          }),
        )
        if (stateRef.current.isFinal) complete()
      },
      onStale: () => patch({ fencedNotice: true }),
    })
  }, [complete, config, job, patch, practice, updateCurrent])

  // ---------- free reference comparison ----------
  const compare = useCallback(() => {
    const s = stateRef.current
    const ex = s.items[s.items.length - 1]?.exercise
    if (!ex) return
    if (ex.status !== 'current') {
      patch({ reference: { phase: 'failed', comparison: null, failure: 'outdated' } })
      return
    }
    const mine = ++revealToken.current
    patch({ reference: { ...s.reference, phase: 'pending', failure: null } })
    window.setTimeout(() => {
      if (revealToken.current !== mine) return
      const outcome = scenarioRef.current.network === 'offline' ? 'network-fail' : scenarioRef.current.revealOutcome
      if (outcome === 'network-fail') return patch({ reference: { phase: 'failed', comparison: null, failure: 'offline' } })
      if (outcome === 'uncertain' && stateRef.current.reference.failure !== 'uncertain') {
        return patch({ reference: { phase: 'failed', comparison: null, failure: 'uncertain' } })
      }
      if (outcome === 'outdated') {
        return updateCurrent(
          (item) => ({ ...item, exercise: { ...item.exercise, status: 'outdated' } }),
          () => ({ reference: { phase: 'failed', comparison: null, failure: 'outdated' } }),
        )
      }
      const current = stateRef.current
      const comparison = compareWithReference(current.draft, ex.reference)
      const recorded = practice.addManualReview(
        {
          id: `rev-${Date.now()}`,
          exerciseId: ex.id,
          dictionaryId: ex.dictionaryId,
          sentence: sentenceText(ex.segments),
          reference: ex.reference,
          sourceLanguage: ex.sourceLanguage,
          responseLanguage: ex.responseLanguage,
          createdAt: new Date().toISOString(),
          exerciseStatus: ex.status,
        },
        `${roundKey.current}:${current.items.length}:${ex.id}`,
      )
      updateCurrent(
        (item) => ({ ...item, reviewed: true, comparison, finalDraft: current.draft }),
        (prev) => ({
          reference: { phase: 'shown', comparison, failure: null },
          counters: recorded ? { ...prev.counters, reviews: prev.counters.reviews + 1 } : prev.counters,
        }),
      )
      if (stateRef.current.isFinal) complete()
      return undefined
    }, 900)
  }, [complete, patch, practice, updateCurrent])

  /** Compare again after editing: free, uses the already revealed reference, no new record. */
  const recompare = useCallback(() => {
    const s = stateRef.current
    const ex = s.items[s.items.length - 1]?.exercise
    if (!ex || s.reference.phase === 'hidden') return
    const comparison = compareWithReference(s.draft, ex.reference)
    updateCurrent((item) => ({ ...item, comparison }), () => ({ reference: { phase: 'shown', comparison, failure: null } }))
  }, [updateCurrent])

  const toggleReference = useCallback(() => {
    patch((prev) => ({
      reference: { ...prev.reference, phase: prev.reference.phase === 'shown' ? 'collapsed' : 'shown' },
    }))
  }, [patch])

  // ---------- navigation ----------
  const skip = useCallback(() => {
    if (job.busy || stateRef.current.reference.phase === 'pending') return
    const s = stateRef.current
    const finished = currentFinished(s)
    if (!finished) {
      updateCurrent(
        (item) => ({ ...item, skipped: true, finalDraft: s.draft }),
        (prev) => ({ counters: { ...prev.counters, skipped: prev.counters.skipped + 1 } }),
      )
    }
    if (s.isFinal) complete()
    else loadNext()
  }, [complete, job.busy, loadNext, updateCurrent])

  const next = useCallback(() => {
    if (job.busy) return
    if (stateRef.current.isFinal) complete()
    else loadNext()
  }, [complete, job.busy, loadNext])

  const freshRound = useCallback(
    (mode: PracticeMode, replaySource: string[] | null): Partial<RoundState> => {
      roundKey.current = `round-${Date.now()}`
      revealToken.current += 1
      return { ...initialState(mode), replaySource }
    },
    [],
  )

  const repeatExact = useCallback(() => {
    const results = stateRef.current.results
    if (!results) return
    const issue = scenarioRef.current.replayItem
    if (issue !== 'ok') {
      patch({ replayIssue: { position: Math.min(2, results.sequence.length), reason: issue } })
      return
    }
    job.reset()
    const base = freshRound(stateRef.current.mode, results.sequence)
    patch(base)
    loadNext(base)
  }, [freshRound, job, loadNext, patch])

  const generateNew = useCallback(() => {
    if (stateRef.current.fresh.phase === 'admitting') return
    const base = freshRound('new', null)
    patch({ fresh: { phase: 'admitting', failure: null } })
    const opts = generationOptions((ex) => present(ex, base), () => ({ ...stateRef.current, ...base }))
    job.start({ ...opts, precondition: opts.precondition })
  }, [freshRound, generationOptions, job, patch, present])

  // A failed fresh admission keeps the completed results on screen.
  useEffect(() => {
    if (state.fresh.phase !== 'admitting') return
    if (job.job.kind === 'generation' && (job.job.phase === 'failed' || job.job.phase === 'cancelled')) {
      patch({ fresh: { phase: 'failed', failure: job.job.phase === 'cancelled' ? null : job.job.failure } })
    }
  }, [job.job, patch, state.fresh.phase])

  const changeMode = useCallback(
    (mode: PracticeMode) => {
      job.reset()
      const base = freshRound(mode, null)
      patch(base)
      loadNext(base)
    },
    [freshRound, job, loadNext, patch],
  )

  /** Gallery-seeded work has no live request attached: re-dispatch the same request type. */
  const redispatch = useCallback(() => {
    const kind = job.job.kind
    job.dismiss()
    if (kind === 'check') check(true)
    else if (kind === 'generation' || kind === 'replay') loadNext()
  }, [check, job, loadNext])

  const retry = useCallback(() => (job.hasOptions() ? job.retry() : redispatch()), [job, redispatch])
  const resume = useCallback(() => (job.hasOptions() ? job.resume() : redispatch()), [job, redispatch])

  const assisted = state.reference.phase === 'shown' || state.reference.phase === 'collapsed'

  return useMemo(
    () => ({
      config,
      ...state,
      exercise,
      currentItem,
      finished: currentFinished(state),
      position: state.items.length,
      replayTotal: state.replaySource?.length ?? null,
      coverage: { selected: selected.length, seen: state.seen.length },
      lifetime: { seen: practice.lifetimeSeen.length },
      job: job.job,
      busy: job.busy,
      aiBlocked,
      referenceAssisted: assisted,
      currentAttempt: currentItem?.attempts[currentItem.attempts.length - 1] ?? null,
      setDraft,
      markHintSeen,
      check: () => check(),
      compare,
      recompare,
      toggleReference,
      retryReveal: compare,
      skip,
      next,
      retry,
      resume,
      cancel: job.cancel,
      dismissJob: job.dismiss,
      repeatExact,
      generateNew,
      changeMode,
      restartReview: () => changeMode('review'),
      dismissFenced: () => patch({ fencedNotice: false }),
      retryNext: () => loadNext(),
    }),
    [aiBlocked, assisted, changeMode, check, compare, config, currentItem, exercise, generateNew, job, loadNext, markHintSeen, next, patch, practice.lifetimeSeen.length, recompare, repeatExact, resume, retry, selected.length, setDraft, skip, state, toggleReference],
  )
}

function currentFinished(s: RoundState) {
  const item = s.items[s.items.length - 1]
  return Boolean(item && (item.attempts.length > 0 || item.reviewed || item.skipped))
}

export type PracticeRound = ReturnType<typeof usePracticeRound>

