import React, { useState } from 'react'
import { Button } from '../Button'
import { ArchiveConfirmDialog } from '../sentences/ArchiveConfirmDialog'
import { useApp } from '../../contexts/AppContext'
import { DEFAULT_FILTERS, type DialogState, type SentenceLibraryPage } from '../../hooks/useSentenceLibrary'
import { savedSentences } from '../../data/sentenceLibrary'
import type { NoticeActions } from '../preparation/PreparationNotice'
import type { ArchiveAction, SavedSentence } from '../../types/sentenceLibrary'

export const FR_ID = 'dict-fr-ru'
const noop = () => undefined

export const sentence = (id: string): SavedSentence => savedSentences.find((s) => s.id === id) ?? savedSentences[0]

export const noticeNoop: NoticeActions = {
  onResume: noop,
  onCheckStatus: noop,
  onStartAgain: noop,
  onOpenLibrary: noop,
  onOpenAiSettings: noop,
  onLeave: noop,
  onSignIn: noop,
  onDismissRecovered: noop,
}

type ToolbarPage = Pick<SentenceLibraryPage, 'selection' | 'submission' | 'matchingTotal' | 'visible' | 'openConfirm' | 'dismissFailure' | 'filters'>

/** Static selection/submission fixture for the toolbar frames. */
export function toolbarPage(patch: {
  selection?: Partial<SentenceLibraryPage['selection']>
  submission?: SentenceLibraryPage['submission']
  matchingTotal?: number
  visibleCount?: number
}): ToolbarPage {
  const visible = savedSentences.slice(0, patch.visibleCount ?? 25)
  return {
    filters: DEFAULT_FILTERS,
    matchingTotal: patch.matchingTotal ?? 186,
    visible,
    openConfirm: noop,
    dismissFailure: noop,
    submission: patch.submission ?? { status: 'idle' },
    selection: {
      ids: [],
      allMatching: false,
      selectedCount: 0,
      pageAllSelected: false,
      pageSomeSelected: false,
      selectionIsPage: false,
      archivableCount: 0,
      restorableCount: 0,
      isSelected: () => false,
      toggle: noop,
      togglePage: noop,
      selectAllMatching: noop,
      onlyThisPage: noop,
      clear: noop,
      ...patch.selection,
    },
  }
}

const snapshot = (action: ArchiveAction, scope: 'ids' | 'all-matching', n: number) => ({
  token: 'demo',
  action,
  scope,
  ids: savedSentences.slice(0, n).map((s) => s.id),
  filters: DEFAULT_FILTERS,
  createdAt: 0,
})

export const dialogFixtures: Record<string, DialogState> = {
  confirmPage: { kind: 'confirm', snapshot: snapshot('archive', 'ids', 12), count: 12 },
  confirmAll: { kind: 'confirm', snapshot: snapshot('archive', 'all-matching', 186), count: 186 },
  confirmRestore: { kind: 'confirm', snapshot: snapshot('restore', 'ids', 3), count: 3 },
  stale: { kind: 'stale', reason: 'stale', action: 'archive' },
  expired: { kind: 'stale', reason: 'expired', action: 'archive' },
  superseded: { kind: 'stale', reason: 'superseded', action: 'archive' },
  tooMany: { kind: 'blocked', reason: 'too-many', action: 'archive', count: 12480 },
  limit: { kind: 'blocked', reason: 'limit', action: 'archive', count: 12 },
}

/** Opens the real confirmation dialog with a fixed state; it never changes data. */
export function DialogLauncher({ state, label, zeroCredits = false }: { state: DialogState; label: string; zeroCredits?: boolean }) {
  const { getDictionary } = useApp()
  const [open, setOpen] = useState(false)
  const dictionary = getDictionary(FR_ID)
  if (!dictionary) return null
  return (
    <>
      <Button variant="secondary" size="compact" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ArchiveConfirmDialog
        dictionary={dictionary}
        state={open ? state : { kind: 'closed' }}
        filters={DEFAULT_FILTERS}
        zeroCredits={zeroCredits}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        onReconfirm={() => setOpen(false)}
      />
    </>
  )
}

