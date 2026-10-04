import type { PracticeSession, SessionCounters } from '../hooks/usePracticeSession'
import type { AiAttempt, JobState, PracticeConfig, PracticeExercise } from '../types/practice'
import { mockCheck } from './practiceGrading'

const noop = () => undefined

export const galleryConfig: PracticeConfig = {
  dictionaryId: 'dict-de-en',
  direction: 'forward',
  sentenceLanguage: 'de',
  answerLanguage: 'en',
  explanationLanguage: 'de',
  mode: 'saved-first',
  entryIds: [
    'card-de-gehen',
    'card-de-zufuss',
    'card-de-arbeit',
    'card-de-frueh',
    'card-de-wetter',
    'card-de-weg',
    'card-de-heute',
  ],
}

export const galleryCounters: SessionCounters = {
  checks: 3,
  reviews: 1,
  ratings: { perfect: 1, good: 1, 'not-bad': 1, again: 0 },
  exercisesShown: 4,
  generated: 1,
}

export function job(partial: Partial<JobState>): JobState {
  return { id: 'job-demo', kind: 'check', phase: 'running', failure: null, resumed: false, ...partial }
}

export function attemptFor(
  exercise: PracticeExercise,
  answer: string,
  options: { assisted?: boolean; explanationLanguage?: PracticeConfig['explanationLanguage'] } = {},
): AiAttempt {
  const result = mockCheck(exercise, answer, options.explanationLanguage ?? 'de')
  return {
    id: `demo-${answer.length}-${result.score}`,
    exerciseId: exercise.id,
    dictionaryId: exercise.dictionaryId,
    sentence: exercise.segments.map((segment) => segment.text).join(''),
    sourceLanguage: exercise.sourceLanguage,
    responseLanguage: exercise.responseLanguage,
    submittedAnswer: answer,
    result,
    assisted: options.assisted ?? false,
    createdAt: '2026-10-04T10:15:00',
    exerciseStatus: exercise.status,
  }
}

/** Static session snapshot for gallery frames. Every action is inert. */
export function mockSession(partial: Partial<PracticeSession>): PracticeSession {
  return {
    config: galleryConfig,
    exercise: null,
    emptyReason: null,
    draft: '',
    setDraft: noop,
    submitted: null,
    job: { id: null, kind: null, phase: 'idle', failure: null, resumed: false },
    busy: false,
    revealedHints: [],
    revealHint: noop,
    reference: 'hidden',
    referenceFailure: null,
    referenceUsed: false,
    revealReference: noop,
    toggleReference: noop,
    currentAttempt: null,
    exerciseAttempts: [],
    counters: galleryCounters,
    validationError: null,
    checkUnavailable: null,
    check: noop,
    retryJob: noop,
    cancelJob: noop,
    dismissJob: noop,
    next: noop,
    restartReview: noop,
    changeMode: noop,
    ...partial,
  }
}

