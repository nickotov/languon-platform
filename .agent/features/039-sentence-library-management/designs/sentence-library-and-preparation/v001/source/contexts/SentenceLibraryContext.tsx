import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { savedSentences } from '../data/sentenceLibrary'
import type {
  ArchiveAction,
  ConfirmationScope,
  ConfirmationSnapshot,
  LibraryFilters,
  LibraryScenario,
  RequestResult,
  SavedSentence,
  SubmitResult,
} from '../types/sentenceLibrary'

/** Product limits — explained in copy, never shown as technical numbers on the happy path. */
export const MAX_ALL_MATCHING = 10000
export const MAX_RETAINED_PER_DICTIONARY = 5
export const OVERSIZED_DEMO_TOTAL = 12480

export const DEFAULT_LIBRARY_SCENARIO: LibraryScenario = {
  initialLoad: 'ok',
  nextPage: 'ok',
  detail: 'ok',
  submit: 'success',
  matching: 'normal',
  retainedConfirmations: 0,
  credits: 'available',
  empty: false,
}

interface SentenceLibraryValue {
  scenario: LibraryScenario
  setScenario: (patch: Partial<LibraryScenario>) => void
  resetScenario: () => void
  sentencesFor: (dictionaryId: string) => SavedSentence[]
  byId: (id: string) => SavedSentence | undefined
  /** Personal counts for the dots-menu entry (only shown when known). */
  availableCount: (dictionaryId: string) => number | null
  requestConfirmation: (input: { action: ArchiveAction; scope: ConfirmationScope; ids: string[]; filters: LibraryFilters }) => RequestResult
  submitConfirmation: (snapshot: ConfirmationSnapshot) => Promise<SubmitResult>
  discardConfirmation: (token: string) => void
  /** Real restore/archive semantics for single items and undo. */
  setArchived: (ids: string[], archived: boolean) => void
}

const Ctx = createContext<SentenceLibraryValue | null>(null)

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
let tokenCounter = 0

export function SentenceLibraryProvider({ children, initialScenario }: { children: React.ReactNode; initialScenario?: Partial<LibraryScenario> }) {
  const [scenario, setScenarioState] = useState<LibraryScenario>({ ...DEFAULT_LIBRARY_SCENARIO, ...initialScenario })
  const [archived, setArchivedState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(savedSentences.map((s) => [s.id, s.archivedByMe])),
  )
  const archivedRef = useRef(archived)
  archivedRef.current = archived
  const retained = useRef<ConfirmationSnapshot[]>([])

  const setScenario = useCallback((patch: Partial<LibraryScenario>) => setScenarioState((prev) => ({ ...prev, ...patch })), [])
  const resetScenario = useCallback(() => setScenarioState({ ...DEFAULT_LIBRARY_SCENARIO, ...initialScenario }), [initialScenario])

  const materialized = useMemo(
    () => savedSentences.map((s) => ({ ...s, archivedByMe: archived[s.id] ?? s.archivedByMe })),
    [archived],
  )

  const sentencesFor = useCallback(
    (dictionaryId: string) => (scenario.empty ? [] : materialized.filter((s) => s.dictionaryId === dictionaryId && !s.removed)),
    [materialized, scenario.empty],
  )
  const byId = useCallback((id: string) => materialized.find((s) => s.id === id && !s.removed), [materialized])

  const availableCount = useCallback(
    (dictionaryId: string) => {
      const list = sentencesFor(dictionaryId)
      return list.length ? list.filter((s) => !s.archivedByMe && !s.globallyArchived).length : null
    },
    [sentencesFor],
  )

  const setArchived = useCallback((ids: string[], value: boolean) => {
    setArchivedState((prev) => {
      const next = { ...prev }
      ids.forEach((id) => {
        next[id] = value
      })
      return next
    })
  }, [])

  const requestConfirmation = useCallback<SentenceLibraryValue['requestConfirmation']>(
    ({ action, scope, ids, filters }) => {
      const total = scope === 'all-matching' && scenario.matching === 'oversized' ? OVERSIZED_DEMO_TOTAL : ids.length
      if (total > MAX_ALL_MATCHING) return { ok: false, reason: 'too-many' }
      const pending = retained.current.length + scenario.retainedConfirmations
      if (pending >= MAX_RETAINED_PER_DICTIONARY) return { ok: false, reason: 'limit' }
      const snapshot: ConfirmationSnapshot = { token: `confirm-${++tokenCounter}`, action, scope, ids: [...ids], filters, createdAt: Date.now() }
      retained.current = [...retained.current, snapshot]
      return { ok: true, snapshot }
    },
    [scenario.matching, scenario.retainedConfirmations],
  )

  const discardConfirmation = useCallback((token: string) => {
    retained.current = retained.current.filter((s) => s.token !== token)
  }, [])

  const submitConfirmation = useCallback(
    async (snapshot: ConfirmationSnapshot): Promise<SubmitResult> => {
      await wait(1100)
      discardConfirmation(snapshot.token)
      const outcome = scenario.submit
      if (outcome !== 'success') return outcome
      // A real snapshot check: never apply a selection that changed underneath.
      const target = snapshot.action === 'archive'
      const changed = snapshot.ids.some((id) => archivedRef.current[id] === target)
      if (changed) return 'stale'
      setArchived(snapshot.ids, target)
      return 'success'
    },
    [discardConfirmation, scenario.submit, setArchived],
  )

  const value = useMemo<SentenceLibraryValue>(
    () => ({
      scenario,
      setScenario,
      resetScenario,
      sentencesFor,
      byId,
      availableCount,
      requestConfirmation,
      submitConfirmation,
      discardConfirmation,
      setArchived,
    }),
    [scenario, setScenario, resetScenario, sentencesFor, byId, availableCount, requestConfirmation, submitConfirmation, discardConfirmation, setArchived],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSentenceLibrary() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSentenceLibrary must be used inside SentenceLibraryProvider')
  return value
}

export function matchesFilters(s: SavedSentence, f: LibraryFilters) {
  if (s.direction !== f.direction) return false
  if (f.mine === 'available' && s.archivedByMe) return false
  if (f.mine === 'archived' && !s.archivedByMe) return false
  if (f.current === 'current' && s.outdated) return false
  if (f.current === 'outdated' && !s.outdated) return false
  if (f.global === 'active' && s.globallyArchived) return false
  if (f.global === 'archived' && !s.globallyArchived) return false
  return true
}

