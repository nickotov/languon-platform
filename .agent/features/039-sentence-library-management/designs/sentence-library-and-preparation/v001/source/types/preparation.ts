import type { LanguageCode } from './dictionary'
import type { PracticeDirection, PracticeMode } from './practice'

export type PrepStatus =
  | 'submitting'
  | 'uncertain'
  | 'checking'
  | 'queued'
  | 'running'
  | 'stopping'
  | 'paused'
  | 'interrupted'
  | 'completed'
  | 'stale'
  | 'expired'
  | 'access-lost'

export type PrepInterruption = 'credits' | 'capacity' | 'model' | 'provider' | 'network'
export type PrepAccessLoss = 'revoked' | 'session' | 'removed'

export interface PrepRound {
  index: number
  wordCount: number
  ready: number
}

export interface PreparationRun {
  id: string
  dictionaryId: string
  direction: PracticeDirection
  mode: PracticeMode
  sentenceLanguage: LanguageCode
  answerLanguage: LanguageCode
  /** Size of the intended practice round (prepared first). */
  roundWords: number
  totalWords: number
  /** Words that now have a usable example. Main progress measure. */
  covered: number
  /** Saved examples reused (secondary; one sentence can cover several words). */
  reused: number
  /** New examples generated (secondary). */
  generated: number
  /** Words that saved examples can cover without generation. */
  reuseBudget: number
  status: PrepStatus
  activity: 'reusing' | 'generating'
  interruption: PrepInterruption | null
  accessLoss: PrepAccessLoss | null
  /** Polling is slow; last known progress stays visible. */
  slow: boolean
  /** One-shot notice after an uncertain start was recovered. */
  recovered: boolean
}

export type StartResult = 'started' | 'concurrent' | 'quota'

/** Prototype review aids — never learner settings. */
export interface PrepScenario {
  startOutcome: 'success' | 'uncertain' | 'quota'
  interruptAt: 'none' | PrepInterruption
  slowPolling: boolean
  credits: 'available' | 'zero'
  /** How much of the dictionary saved examples already cover. */
  savedCoverage: 'partial' | 'all'
}

