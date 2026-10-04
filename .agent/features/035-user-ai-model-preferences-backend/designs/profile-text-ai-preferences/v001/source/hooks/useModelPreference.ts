import { useCallback, useEffect, useRef, useState } from 'react'
import {
  canSave,
  isDirty,
  loadedCatalogState,
  resolveSave,
  savedAuto,
  seedModelPreference,
} from '../utils/modelPreference'
import {
  AUTO_CHOICE,
  type ModelPreferenceState,
  type ModelScenario,
  type SaveOutcome,
} from '../types/modelPreference'

interface UseModelPreferenceOptions {
  scenario: ModelScenario
  /** Outcome of the next save attempt. Later attempts succeed. */
  nextSaveOutcome?: SaveOutcome
  /** Holds seeded async states (loading, saving) still, for the state gallery. */
  frozen?: boolean
}

export interface ModelPreferenceStore {
  state: ModelPreferenceState
  dirty: boolean
  saveAllowed: boolean
  selectDraft: (id: string) => void
  save: () => void
  cancel: () => void
  acceptLatest: () => void
  retryCatalog: () => void
  setOnline: (online: boolean) => void
}

export function useModelPreference({
  scenario,
  nextSaveOutcome = 'success',
  frozen = false,
}: UseModelPreferenceOptions): ModelPreferenceStore {
  const [state, setState] = useState<ModelPreferenceState>(() =>
    seedModelPreference(scenario),
  )
  const stateRef = useRef(state)
  stateRef.current = state
  const outcomeRef = useRef<SaveOutcome>(nextSaveOutcome)
  const timers = useRef<number[]>([])

  const schedule = useCallback((fn: () => void, delay: number) => {
    timers.current.push(window.setTimeout(fn, delay))
  }, [])

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  useEffect(() => {
    outcomeRef.current = nextSaveOutcome
  }, [nextSaveOutcome])

  // Seed (and re-seed) whenever the reviewed scenario changes.
  useEffect(() => {
    clearTimers()
    const seed = seedModelPreference(scenario)
    setState(seed)
    if (frozen) return clearTimers

    if (seed.prefStatus === 'loading') {
      schedule(
        () =>
          setState((current) => ({
            ...current,
            prefStatus: 'ready',
            saved: savedAuto(),
            draft: AUTO_CHOICE,
          })),
        900,
      )
    }
    if (seed.catalogStatus === 'loading') {
      schedule(() => setState((current) => loadedCatalogState(current)), 1800)
    }
    if (seed.saveStatus === 'saving') {
      schedule(
        () => setState((current) => resolveSave(current, 'success')),
        2000,
      )
    }
    return clearTimers
  }, [scenario, frozen, schedule, clearTimers])

  // Real connectivity changes also drive the offline state.
  useEffect(() => {
    const goOnline = () => setState((current) => ({ ...current, online: true }))
    const goOffline = () =>
      setState((current) => ({ ...current, online: false }))
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const selectDraft = useCallback((id: string) => {
    setState((current) => {
      if (current.saveStatus === 'saving') return current
      return {
        ...current,
        draft: id,
        saveStatus: current.saveStatus === 'conflict' ? 'conflict' : 'idle',
        rejectedModel:
          current.saveStatus === 'rejected' ? current.rejectedModel : null,
      }
    })
  }, [])

  const save = useCallback(() => {
    if (!canSave(stateRef.current)) return
    const outcome = outcomeRef.current
    outcomeRef.current = 'success'
    setState((current) => ({ ...current, saveStatus: 'saving' }))
    schedule(() => setState((current) => resolveSave(current, outcome)), 1200)
  }, [schedule])

  const cancel = useCallback(() => {
    setState((current) =>
      current.saveStatus === 'saving' || !current.saved
        ? current
        : {
            ...current,
            draft: current.saved.choice,
            saveStatus: 'idle',
            conflictBase: null,
            rejectedModel: null,
          },
    )
  }, [])

  const retryCatalog = useCallback(() => {
    setState((current) => ({ ...current, catalogStatus: 'loading' }))
    schedule(() => setState((current) => loadedCatalogState(current)), 1100)
  }, [schedule])

  const setOnline = useCallback((online: boolean) => {
    setState((current) => ({ ...current, online }))
  }, [])

  return {
    state,
    dirty: isDirty(state),
    saveAllowed: canSave(state),
    selectDraft,
    save,
    cancel,
    acceptLatest: cancel,
    retryCatalog,
    setOnline,
  }
}

