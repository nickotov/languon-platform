import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type {
  AiAttempt,
  ManualReview,
  PracticeExercise,
  PracticeScenario,
  ViewerRole,
} from '../types/practice'
import {
  DEFAULT_SCENARIO,
  savedExercises,
  seedAttempts,
  seedCompleted,
  seedExposed,
  seedManualReviews,
  seedSeenEntries,
} from '../data/practiceFixtures'

interface PracticeContextValue {
  scenario: PracticeScenario
  setScenario: (patch: Partial<PracticeScenario>) => void
  resetScenario: () => void
  viewer: ViewerRole
  setViewer: (role: ViewerRole) => void

  /** Personal practice store — only the current learner's data. */
  attempts: AiAttempt[]
  manualReviews: ManualReview[]
  completedIds: string[]
  exposedIds: string[]
  seenEntryIds: string[]
  generated: PracticeExercise[]

  savedPoolFor: (dictionaryId: string) => PracticeExercise[]
  addAttempt: (attempt: AiAttempt) => void
  /** Idempotent: the same key never records a second review. */
  addManualReview: (review: ManualReview, key: string) => boolean
  markCompleted: (exerciseId: string) => void
  markExposed: (exercise: PracticeExercise) => void
  addGenerated: (exercise: PracticeExercise) => void
}

const PracticeContext = createContext<PracticeContextValue | null>(null)

export function PracticeProvider({ children }: { children: React.ReactNode }) {
  const [scenario, setScenarioState] = useState<PracticeScenario>(DEFAULT_SCENARIO)
  const [viewer, setViewer] = useState<ViewerRole>('owner')
  const [attempts, setAttempts] = useState<AiAttempt[]>(seedAttempts)
  const [manualReviews, setManualReviews] = useState<ManualReview[]>(seedManualReviews)
  const [reviewKeys, setReviewKeys] = useState<string[]>([])
  const [completedIds, setCompletedIds] = useState<string[]>(seedCompleted)
  const [exposedIds, setExposedIds] = useState<string[]>(seedExposed)
  const [seenEntryIds, setSeenEntryIds] = useState<string[]>(seedSeenEntries)
  const [generated, setGenerated] = useState<PracticeExercise[]>([])

  const setScenario = useCallback((patch: Partial<PracticeScenario>) => {
    setScenarioState((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetScenario = useCallback(() => setScenarioState(DEFAULT_SCENARIO), [])

  /**
   * Saved pool visible to this learner: owner generations plus their own.
   * Other readers' private generations and removed content never appear.
   */
  const savedPoolFor = useCallback(
    (dictionaryId: string) => {
      const base = scenario.savedPool === 'empty' ? [] : savedExercises
      return [...base, ...generated].filter(
        (exercise) =>
          exercise.dictionaryId === dictionaryId &&
          exercise.origin !== 'other-reader' &&
          exercise.status !== 'removed',
      )
    },
    [generated, scenario.savedPool],
  )

  const addAttempt = useCallback((attempt: AiAttempt) => {
    setAttempts((prev) => [attempt, ...prev])
  }, [])

  const addManualReview = useCallback(
    (review: ManualReview, key: string) => {
      if (reviewKeys.includes(key)) return false
      setReviewKeys((prev) => [...prev, key])
      setManualReviews((prev) => [review, ...prev])
      return true
    },
    [reviewKeys],
  )

  const markCompleted = useCallback((exerciseId: string) => {
    setCompletedIds((prev) => (prev.includes(exerciseId) ? prev : [...prev, exerciseId]))
  }, [])

  /** Exposure advances only on the first actual use of an exercise. */
  const markExposed = useCallback(
    (exercise: PracticeExercise) => {
      if (exposedIds.includes(exercise.id)) return
      setExposedIds((prev) => [...prev, exercise.id])
      setSeenEntryIds((prev) => {
        const next = new Set(prev)
        exercise.targets.forEach((target) => next.add(target.entryId))
        return Array.from(next)
      })
    },
    [exposedIds],
  )

  const addGenerated = useCallback((exercise: PracticeExercise) => {
    setGenerated((prev) => [...prev, exercise])
  }, [])

  const value = useMemo<PracticeContextValue>(
    () => ({
      scenario,
      setScenario,
      resetScenario,
      viewer,
      setViewer,
      attempts,
      manualReviews,
      completedIds,
      exposedIds,
      seenEntryIds,
      generated,
      savedPoolFor,
      addAttempt,
      addManualReview,
      markCompleted,
      markExposed,
      addGenerated,
    }),
    [
      scenario,
      setScenario,
      resetScenario,
      viewer,
      attempts,
      manualReviews,
      completedIds,
      exposedIds,
      seenEntryIds,
      generated,
      savedPoolFor,
      addAttempt,
      addManualReview,
      markCompleted,
      markExposed,
      addGenerated,
    ],
  )

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>
}

export function usePractice(): PracticeContextValue {
  const context = useContext(PracticeContext)
  if (!context) throw new Error('usePractice must be used inside PracticeProvider')
  return context
}

