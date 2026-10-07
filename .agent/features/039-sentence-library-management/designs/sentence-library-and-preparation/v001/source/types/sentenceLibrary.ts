import type { LanguageCode } from './dictionary'
import type { PracticeDirection } from './practice'

/** A saved hint as shown in the library preview. Phrases stay whole. */
export interface LibraryHint {
  id: string
  /** Exact span in the displayed sentence. */
  source: string
  /** Contextual translation in the answer language. */
  target: string
  kind: 'word' | 'phrase'
  /** Brief explanation when one was saved. */
  note?: string
}

export interface SavedSentence {
  id: string
  dictionaryId: string
  direction: PracticeDirection
  sentenceLanguage: LanguageCode
  answerLanguage: LanguageCode
  sentence: string
  reference: string
  dictionaryHints: LibraryHint[]
  contextHints: LibraryHint[]
  /** Legacy examples carry dictionary mappings only. */
  enrichment: 'rich' | 'legacy'
  createdAt: string
  /** Supplied marker only — never a generator identity. */
  ownership: 'mine' | 'shared'
  outdated: boolean
  /** This learner's personal, reversible archive. */
  archivedByMe: boolean
  /** Administrative state; read-only for learners. */
  globallyArchived: boolean
  /** Permanently removed content never stays selectable. */
  removed?: boolean
}

export type MineFilter = 'available' | 'archived' | 'all'
export type CurrentFilter = 'all' | 'current' | 'outdated'
export type GlobalFilter = 'active' | 'archived' | 'all'

export interface LibraryFilters {
  direction: PracticeDirection
  mine: MineFilter
  current: CurrentFilter
  global: GlobalFilter
}

export type ArchiveAction = 'archive' | 'restore'

export type ConfirmationScope = 'ids' | 'all-matching'

export interface ConfirmationSnapshot {
  token: string
  action: ArchiveAction
  scope: ConfirmationScope
  ids: string[]
  filters: LibraryFilters
  createdAt: number
}

export type RequestResult =
  | { ok: true; snapshot: ConfirmationSnapshot }
  | { ok: false; reason: 'too-many' | 'limit' }

export type SubmitResult = 'success' | 'fail' | 'stale' | 'expired' | 'superseded'

/** Prototype review aids for the library — never learner settings. */
export interface LibraryScenario {
  initialLoad: 'ok' | 'fail' | 'slow'
  nextPage: 'ok' | 'fail'
  detail: 'ok' | 'fail' | 'removed'
  submit: SubmitResult
  matching: 'normal' | 'oversized'
  retainedConfirmations: number
  credits: 'available' | 'zero'
  empty: boolean
}

