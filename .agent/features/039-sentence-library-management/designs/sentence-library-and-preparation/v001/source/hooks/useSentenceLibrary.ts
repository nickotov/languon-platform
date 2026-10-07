import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { matchesFilters, OVERSIZED_DEMO_TOTAL, useSentenceLibrary } from '../contexts/SentenceLibraryContext'
import { useApp } from '../contexts/AppContext'
import { useInterfaceText } from './useInterfaceText'
import type { ArchiveAction, ConfirmationSnapshot, CurrentFilter, GlobalFilter, LibraryFilters, MineFilter, SubmitResult } from '../types/sentenceLibrary'
import type { PracticeDirection } from '../types/practice'

export const LIBRARY_PAGE_SIZE = 25

export const DEFAULT_FILTERS: LibraryFilters = { direction: 'reverse', mine: 'available', current: 'all', global: 'active' }

export type LoadStatus = 'loading' | 'ready' | 'error'
export type NextStatus = 'idle' | 'loading' | 'error'

export type DialogState =
  | { kind: 'closed' }
  | { kind: 'confirm'; snapshot: ConfirmationSnapshot; count: number }
  | { kind: 'blocked'; reason: 'too-many' | 'limit'; action: ArchiveAction; count: number }
  | { kind: 'stale'; reason: Exclude<SubmitResult, 'success' | 'fail'>; action: ArchiveAction }

export type Submission = { status: 'idle' } | { status: 'submitting'; action: ArchiveAction; count: number } | { status: 'failed'; action: ArchiveAction }

function readFilters(params: URLSearchParams): LibraryFilters {
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T) => {
    const value = params.get(key) as T | null
    return value && allowed.includes(value) ? value : fallback
  }
  return {
    direction: pick<PracticeDirection>('dir', ['reverse', 'forward'], DEFAULT_FILTERS.direction),
    mine: pick<MineFilter>('mine', ['available', 'archived', 'all'], DEFAULT_FILTERS.mine),
    current: pick<CurrentFilter>('cur', ['all', 'current', 'outdated'], DEFAULT_FILTERS.current),
    global: pick<GlobalFilter>('glob', ['active', 'archived', 'all'], DEFAULT_FILTERS.global),
  }
}

const PARAM: Record<keyof LibraryFilters, string> = { direction: 'dir', mine: 'mine', current: 'cur', global: 'glob' }

/** Filters (in the address), paging, selection scopes and confirmed archive/restore. */
export function useSentenceLibraryPage(dictionaryId: string) {
  const library = useSentenceLibrary()
  const { pushToast } = useApp()
  const { L } = useInterfaceText()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(params), [params])
  const filterKey = `${filters.direction}|${filters.mine}|${filters.current}|${filters.global}`

  const all = library.sentencesFor(dictionaryId)
  const matching = useMemo(() => all.filter((s) => matchesFilters(s, filters)), [all, filters])
  const matchingTotal = library.scenario.matching === 'oversized' ? OVERSIZED_DEMO_TOTAL : matching.length

  const [status, setStatus] = useState<LoadStatus>('loading')
  const [reloadToken, setReloadToken] = useState(0)
  const loadAttempts = useRef(0)
  const [pages, setPages] = useState(1)
  const [nextStatus, setNextStatus] = useState<NextStatus>('idle')
  const nextAttempts = useRef(0)
  const [ids, setIds] = useState<string[]>([])
  const [allMatching, setAllMatching] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const [submission, setSubmission] = useState<Submission>({ status: 'idle' })

  // Initial load per filter set — distinct from next-page loading.
  useEffect(() => {
    setStatus('loading')
    setPages(1)
    setNextStatus('idle')
    const slow = library.scenario.initialLoad === 'slow'
    const timer = window.setTimeout(() => {
      const fail = library.scenario.initialLoad === 'fail' && loadAttempts.current === 0
      loadAttempts.current += 1
      setStatus(fail ? 'error' : 'ready')
    }, slow ? 2600 : 650)
    return () => window.clearTimeout(timer)
  }, [filterKey, reloadToken, library.scenario.initialLoad])

  const hadSelection = useRef(false)
  hadSelection.current = ids.length > 0 || allMatching
  const previousKey = useRef(filterKey)
  useEffect(() => {
    if (previousKey.current === filterKey) return
    previousKey.current = filterKey
    if (hadSelection.current) {
      setIds([])
      setAllMatching(false)
      setAnnouncement(L('selectionCleared'))
    }
  }, [filterKey, L])

  const visible = status === 'ready' ? matching.slice(0, pages * LIBRARY_PAGE_SIZE) : []
  const hasMore = status === 'ready' && visible.length < matching.length

  const setFilter = useCallback(
    <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === DEFAULT_FILTERS[key]) next.delete(PARAM[key])
          else next.set(PARAM[key], value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const resetFilters = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        Object.values(PARAM).forEach((key) => next.delete(key))
        return next
      },
      { replace: true },
    )
  }, [setParams])

  const activeFilterCount = (Object.keys(DEFAULT_FILTERS) as (keyof LibraryFilters)[]).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length

  const loadMore = useCallback(() => {
    if (nextStatus === 'loading') return
    setNextStatus('loading')
    window.setTimeout(() => {
      const fail = library.scenario.nextPage === 'fail' && nextAttempts.current === 0
      nextAttempts.current += 1
      if (fail) setNextStatus('error')
      else {
        setPages((p) => p + 1)
        setNextStatus('idle')
      }
    }, 750)
  }, [library.scenario.nextPage, nextStatus])

  const retryLoad = useCallback(() => setReloadToken((n) => n + 1), [])

  // ---------- selection ----------
  const selectedIds = allMatching ? matching.map((s) => s.id) : ids
  const selectedCount = allMatching ? matchingTotal : ids.length
  const pageAllSelected = allMatching || (visible.length > 0 && visible.every((s) => ids.includes(s.id)))
  const pageSomeSelected = !pageAllSelected && visible.some((s) => ids.includes(s.id))
  const selectionIsPage = !allMatching && pageAllSelected && ids.length === visible.length

  const toggle = useCallback(
    (id: string) => {
      if (allMatching) {
        setAllMatching(false)
        setIds(matching.map((s) => s.id).filter((x) => x !== id))
        return
      }
      setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    },
    [allMatching, matching],
  )

  const togglePage = useCallback(() => {
    if (pageAllSelected) {
      setAllMatching(false)
      setIds([])
      return
    }
    setIds((prev) => Array.from(new Set([...prev, ...visible.map((s) => s.id)])))
  }, [pageAllSelected, visible])

  const selectAllMatching = useCallback(() => {
    setAllMatching(true)
    setAnnouncement(L('selAll', { n: matchingTotal }))
  }, [L, matchingTotal])

  const onlyThisPage = useCallback(() => {
    setAllMatching(false)
    setIds(visible.map((s) => s.id))
    setAnnouncement(L('selPage', { n: visible.length }))
  }, [L, visible])

  const clearSelection = useCallback(() => {
    setAllMatching(false)
    setIds([])
  }, [])

  const selectedItems = useMemo(() => {
    const set = new Set(selectedIds)
    return all.filter((s) => set.has(s.id))
  }, [all, selectedIds])
  const archivableIds = selectedItems.filter((s) => !s.archivedByMe).map((s) => s.id)
  const restorableIds = selectedItems.filter((s) => s.archivedByMe).map((s) => s.id)
  const countFor = (action: ArchiveAction) => {
    const n = action === 'archive' ? archivableIds.length : restorableIds.length
    return allMatching && library.scenario.matching === 'oversized' ? OVERSIZED_DEMO_TOTAL : n
  }

  // ---------- confirmed bulk actions ----------
  const openConfirm = useCallback(
    (action: ArchiveAction, forceAll = false) => {
      const scopeAll = forceAll || allMatching
      const pool = forceAll ? matching : selectedItems
      const targetIds = pool.filter((s) => (action === 'archive' ? !s.archivedByMe : s.archivedByMe)).map((s) => s.id)
      const count = scopeAll && library.scenario.matching === 'oversized' ? OVERSIZED_DEMO_TOTAL : targetIds.length
      if (forceAll) setAllMatching(true)
      const result = library.requestConfirmation({ action, scope: scopeAll ? 'all-matching' : 'ids', ids: targetIds, filters })
      if (result.ok) setDialog({ kind: 'confirm', snapshot: result.snapshot, count })
      else setDialog({ kind: 'blocked', reason: result.reason, action, count })
    },
    [allMatching, filters, library, matching, selectedItems],
  )

  const closeDialog = useCallback(() => {
    if (dialog.kind === 'confirm') library.discardConfirmation(dialog.snapshot.token)
    setDialog({ kind: 'closed' })
  }, [dialog, library])

  const confirm = useCallback(async () => {
    if (dialog.kind !== 'confirm' || submission.status === 'submitting') return
    const { snapshot } = dialog
    setDialog({ kind: 'closed' })
    setSubmission({ status: 'submitting', action: snapshot.action, count: snapshot.ids.length })
    setAnnouncement(L('submittingStatus'))
    const result = await library.submitConfirmation(snapshot)
    if (result === 'success') {
      setSubmission({ status: 'idle' })
      setAllMatching(false)
      setIds([])
      const n = snapshot.ids.length
      const title = snapshot.action === 'archive' ? L('successRemoved', { n }) : L('successRestored', { n })
      setAnnouncement(title)
      pushToast({
        title,
        variant: 'success',
        action: {
          label: L('undo'),
          onClick: () => {
            library.setArchived(snapshot.ids, snapshot.action !== 'archive')
            pushToast({ title: L('undone'), variant: 'info' })
          },
        },
      })
      return
    }
    if (result === 'fail') {
      setSubmission({ status: 'failed', action: snapshot.action })
      setAnnouncement(L('failTitle'))
      return
    }
    setSubmission({ status: 'idle' })
    setDialog({ kind: 'stale', reason: result, action: snapshot.action })
  }, [L, dialog, library, pushToast, submission.status])

  const singleToggle = useCallback(
    (id: string, archive: boolean) => {
      library.setArchived([id], archive)
      const title = archive ? L('successRemoved', { n: 1 }) : L('successRestored', { n: 1 })
      setAnnouncement(title)
      setIds((prev) => prev.filter((x) => x !== id))
      pushToast({
        title,
        variant: 'success',
        action: { label: L('undo'), onClick: () => library.setArchived([id], !archive) },
      })
    },
    [L, library, pushToast],
  )

  return {
    filters,
    filterKey,
    setFilter,
    resetFilters,
    activeFilterCount,
    all,
    matching,
    matchingTotal,
    visible,
    status,
    retryLoad,
    hasMore,
    nextStatus,
    loadMore,
    selection: {
      ids,
      allMatching,
      selectedCount,
      pageAllSelected,
      pageSomeSelected,
      selectionIsPage,
      archivableCount: countFor('archive'),
      restorableCount: countFor('restore'),
      isSelected: (id: string) => allMatching || ids.includes(id),
      toggle,
      togglePage,
      selectAllMatching,
      onlyThisPage,
      clear: clearSelection,
    },
    dialog,
    openConfirm,
    closeDialog,
    confirm,
    submission,
    dismissFailure: () => setSubmission({ status: 'idle' }),
    singleToggle,
    announcement,
    scenario: library.scenario,
  }
}

export type SentenceLibraryPage = ReturnType<typeof useSentenceLibraryPage>

