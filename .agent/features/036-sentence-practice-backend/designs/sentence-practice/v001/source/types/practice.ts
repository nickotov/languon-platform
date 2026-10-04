import type { LanguageCode } from './dictionary'

/** forward = dictionary source → target; reverse = target → source. */
export type PracticeDirection = 'forward' | 'reverse'
export type PracticeMode = 'saved-first' | 'new-only' | 'review-only'
export type ViewerRole = 'owner' | 'reader' | 'anonymous'
export type Presentation = 'fullscreen' | 'dialog'

export interface PracticeTarget {
  id: string
  /** Normalized dictionary mapping admitted for this exercise (lemma or phrase). */
  hint: string
  kind: 'word' | 'phrase'
  /** Dictionary entry this target belongs to. */
  entryId: string
  /** Forms accepted in a response (inflections allowed). */
  acceptedForms: string[]
  /** Near-synonyms that convey meaning but do not satisfy the target. */
  synonyms?: string[]
}

/** Sentence text is stored as ordered segments so exact spacing/punctuation is preserved. */
export interface SentenceSegment {
  text: string
  targetId?: string
}

export type ExerciseOrigin = 'owner' | 'me' | 'other-reader'
export type ExerciseStatus = 'current' | 'outdated' | 'removed'

export interface PracticeExercise {
  id: string
  dictionaryId: string
  direction: PracticeDirection
  sourceLanguage: LanguageCode
  responseLanguage: LanguageCode
  segments: SentenceSegment[]
  targets: PracticeTarget[]
  /** One valid reference translation. */
  reference: string
  origin: ExerciseOrigin
  status: ExerciseStatus
  createdAt: string
}

export type Rating = 'perfect' | 'good' | 'not-bad' | 'again'

export type CorrectionKind = 'meaning' | 'grammar' | 'spelling' | 'vocabulary' | 'punctuation'

export interface Correction {
  id: string
  kind: CorrectionKind
  /** Exact substring of the submitted answer, or null for a spanless issue. */
  original: string | null
  suggestion: string | null
  note: string
  /** Code-unit offsets aligned to grapheme boundaries in the submitted answer. */
  span: { start: number; end: number } | null
}

export interface TargetStatus {
  targetId: string
  hint: string
  status: 'used' | 'missing' | 'synonym'
  note?: string
}

export interface AiResult {
  score: number
  rating: Rating
  explanation: string
  explanationLanguage: LanguageCode
  corrections: Correction[]
  targets: TargetStatus[]
  improved?: string
  details: string[]
}

export interface AiAttempt {
  id: string
  exerciseId: string
  dictionaryId: string
  sentence: string
  sourceLanguage: LanguageCode
  responseLanguage: LanguageCode
  submittedAnswer: string
  result: AiResult
  /** True when the reference was revealed before this submission. */
  assisted: boolean
  createdAt: string
  exerciseStatus: ExerciseStatus
}

export interface ManualReview {
  id: string
  exerciseId: string
  dictionaryId: string
  sentence: string
  reference: string
  sourceLanguage: LanguageCode
  responseLanguage: LanguageCode
  createdAt: string
  exerciseStatus: ExerciseStatus
}

export type JobPhase =
  | 'idle'
  | 'queued'
  | 'running'
  | 'retrying'
  | 'stopping'
  | 'cancelled'
  | 'failed'
  | 'completed'

export type FailureKind =
  | 'credits'
  | 'model'
  | 'capacity'
  | 'offline'
  | 'timeout'
  | 'provider'
  | 'outdated'
  | 'removed'
  | 'revoked'
  | 'session'
  | 'archived'

export interface JobState {
  id: string | null
  kind: 'generation' | 'check' | null
  phase: JobPhase
  failure: FailureKind | null
  /** True when a retry resumed the same request rather than starting a new one. */
  resumed: boolean
}

export type ReferencePhase = 'hidden' | 'pending' | 'revealed' | 'collapsed' | 'failed'

export type EmptyReason =
  | 'review-empty'
  | 'review-exhausted'
  | 'needs-generation'
  | null

export interface PracticeConfig {
  dictionaryId: string
  direction: PracticeDirection
  /** Language of the shown sentence for this direction. */
  sentenceLanguage: LanguageCode
  /** Language the learner answers in. */
  answerLanguage: LanguageCode
  explanationLanguage: LanguageCode
  mode: PracticeMode
  entryIds: string[]
}

/** Review aids for the prototype; never shown as product settings. */
export interface PracticeScenario {
  feature: 'enabled' | 'disabled'
  preparation: 'ok' | 'fail'
  credits: 'available' | 'zero'
  model: 'available' | 'unavailable'
  capacity: 'ok' | 'busy'
  network: 'online' | 'offline'
  generationOutcome: 'success' | 'retrying' | 'fail' | 'timeout'
  checkOutcome: 'success' | 'retrying' | 'fail' | 'timeout'
  revealOutcome: 'success' | 'network-fail' | 'outdated'
  historyPage: 'ok' | 'fail'
  savedPool: 'partial' | 'empty'
  fullscreenApi: 'available' | 'unavailable'
}

