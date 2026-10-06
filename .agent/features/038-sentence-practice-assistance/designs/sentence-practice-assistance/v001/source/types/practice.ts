import type { LanguageCode } from './dictionary'

/** forward = dictionary front (learning) → back; reverse = back (familiar) → front. */
export type PracticeDirection = 'forward' | 'reverse'
export type PracticeMode = 'saved-first' | 'new' | 'review'
export type ViewerRole = 'owner' | 'reader' | 'anonymous'
export type Presentation = 'fullscreen' | 'dialog'

/** Required = dictionary vocabulary task. Context = supporting help saved with the sentence. */
export type HintRole = 'required' | 'context'
export type HintKind = 'word' | 'phrase' | 'idiom'

export interface PracticeHint {
  id: string
  role: HintRole
  kind: HintKind
  /** Normalized gloss in the answer language (lemma, infinitive or phrase meaning). */
  gloss: string
  /** Short sense note for contextual meanings, e.g. “here: is located”. */
  note?: string
  /** Dictionary entry for required hints only. */
  entryId?: string
  /** Forms accepted in an answer for required hints (inflections allowed). */
  acceptedForms?: string[]
  /** Near-synonyms that convey meaning but do not satisfy a required word. */
  synonyms?: string[]
}

/** Ordered sentence runs preserve exact spacing, punctuation, case and order. */
export interface SentenceSegment {
  text: string
  hintId?: string
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
  hints: PracticeHint[]
  /** One valid reference translation. Never shown before an explicit reveal. */
  reference: string
  origin: ExerciseOrigin
  status: ExerciseStatus
  /** Legacy examples carry dictionary-target hints only. */
  enrichment: 'rich' | 'legacy'
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
  span: { start: number; end: number } | null
}

export interface RequiredStatus {
  hintId: string
  gloss: string
  status: 'used' | 'missing' | 'synonym'
  note?: string
}

export interface AiResult {
  score: number
  rating: Rating
  explanation: string
  explanationLanguage: LanguageCode
  corrections: Correction[]
  required: RequiredStatus[]
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
  /** Reference was revealed before this submission. Set once, never relabelled. */
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

export type ComparisonKind = 'match' | 'different' | 'reference-only'
export type IgnoredDifference = 'case' | 'spaces' | 'punctuation' | 'apostrophes' | 'unicode'

export interface ComparisonResult {
  kind: ComparisonKind
  /** Exact strings, never normalized for display. */
  draft: string
  reference: string
  ignored: IgnoredDifference[]
}

export type JobKind = 'generation' | 'check' | 'reveal' | 'replay' | 'history'

export type JobPhase =
  | 'idle'
  | 'queued'
  | 'running'
  /** Automatic, bounded recovery from a transient failure. */
  | 'recovering'
  /** Server supplied a retry time; a truthful countdown runs. */
  | 'retry-after'
  /** Beyond automatic recovery; explicit resume is offered. */
  | 'delayed'
  /** Response lost; the original task may still be running. */
  | 'uncertain'
  | 'stopping'
  | 'cancelled'
  | 'failed'
  | 'completed'

export type FailureKind =
  | 'offline'
  | 'poll'
  | 'capacity'
  | 'credits'
  | 'model'
  | 'malformed'
  | 'timeout'
  | 'provider'
  | 'wrong-language'
  | 'reference'
  | 'outdated'
  | 'removed'
  | 'revoked'
  | 'session'
  | 'archived'

export interface JobState {
  id: string | null
  kind: JobKind | null
  phase: JobPhase
  failure: FailureKind | null
  /** A retry resumed the same request instead of starting a new one. */
  resumed: boolean
  /** Seconds left in a server-provided retry window. */
  retryAfter: number | null
  /** Model preference captured when the work started. */
  model: string | null
}

export type ReferencePhase = 'hidden' | 'pending' | 'shown' | 'collapsed' | 'failed'

export interface ReferenceState {
  phase: ReferencePhase
  comparison: ComparisonResult | null
  failure: 'offline' | 'uncertain' | 'outdated' | 'revoked' | null
}

export interface PracticeConfig {
  dictionaryId: string
  direction: PracticeDirection
  sentenceLanguage: LanguageCode
  answerLanguage: LanguageCode
  explanationLanguage: LanguageCode
  mode: PracticeMode
  /** At most 100 eligible entries. */
  entryIds: string[]
  scope: 'batch' | 'manual'
}

export interface SessionCounters {
  examples: number
  checks: number
  reviews: number
  skipped: number
  ratings: Record<Rating, number>
}

export interface RoundItem {
  exercise: PracticeExercise
  attempts: AiAttempt[]
  reviewed: boolean
  comparison: ComparisonResult | null
  skipped: boolean
  /** Exact draft at the moment the item finished (for skipped/reviewed items). */
  finalDraft: string
}

export interface SessionResults {
  items: RoundItem[]
  counters: SessionCounters
  coverage: { selected: number; seen: number }
  /** Exercise ids in presentation order, used for exact replay. */
  sequence: string[]
  wasReplay: boolean
}

/** Review aids for the prototype; never shown as learner settings. */
export interface PracticeScenario {
  feature: 'enabled' | 'disabled'
  preparation: 'ok' | 'fail'
  credits: 'available' | 'zero'
  model: 'available' | 'unavailable'
  capacity: 'ok' | 'busy'
  network: 'online' | 'offline'
  generationOutcome:
    | 'success'
    | 'retrying'
    | 'retry-after'
    | 'delayed'
    | 'uncertain'
    | 'poll'
    | 'fail'
    | 'timeout'
    | 'wrong-language'
  checkOutcome:
    | 'success'
    | 'retrying'
    | 'retry-after'
    | 'delayed'
    | 'uncertain'
    | 'poll'
    | 'fail'
    | 'timeout'
    | 'malformed'
  revealOutcome: 'success' | 'network-fail' | 'uncertain' | 'outdated'
  historyPage: 'ok' | 'fail'
  savedPool: 'available' | 'empty'
  fullscreenApi: 'available' | 'unavailable'
  replayItem: 'ok' | 'outdated' | 'removed' | 'revoked'
  access: 'ok' | 'revoked' | 'session' | 'archived' | 'removed'
}

