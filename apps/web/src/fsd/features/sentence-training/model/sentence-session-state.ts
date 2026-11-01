import type { SentenceSessionController } from '../types';

export type SentenceSessionState = Omit<
    SentenceSessionController,
    | 'start'
    | 'changeMode'
    | 'restartReview'
    | 'next'
    | 'check'
    | 'revealReference'
    | 'retry'
    | 'cancel'
    | 'setDraft'
    | 'toggleHint'
    | 'reset'
    | 'retryProgress'
    | 'recompare'
    | 'skip'
    | 'repeatExact'
    | 'generateNew'
>;
export const initialSentenceState = (): SentenceSessionState => ({
    phase: 'idle',
    configuration: null,
    sessionId: null,
    exercise: null,
    draft: '',
    submittedAnswer: null,
    acknowledgedAnswer: null,
    revealedHintIds: [],
    job: null,
    attempt: null,
    reference: null,
    comparison: null,
    roundItems: [],
    replaying: false,
    replayPosition: null,
    replayLoading: false,
    replayError: null,
    referenceLoading: false,
    referenceUncertain: false,
    error: null,
    referenceError: null,
    progress: null,
    progressLoading: false,
    progressError: null,
    counts: {
        presented: 0,
        checked: 0,
        assisted: 0,
        manuallyReviewed: 0,
        skipped: 0,
        ratings: { perfect: 0, good: 0, notBad: 0, practiseAgainLater: 0 },
    },
    busy: false,
    uncertain: false,
    canRetry: false,
    emptyReason: null,
    visitedExerciseIds: [],
    roundEntryCount: 0,
    roundEligibleCount: null,
    roundComplete: false,
});

export function synchronizeRoundItems(
    state: SentenceSessionState,
): SentenceSessionState['roundItems'] {
    const exercise = state.exercise;
    if (!exercise) {
        return state.roundItems;
    }

    return state.roundItems.map((item) => {
        if (item.exercise.id !== exercise.id) {
            return item;
        }

        const attempt = state.attempt ?? item.attempt;
        const reference = state.reference ?? item.reference;
        let outcome = item.outcome;
        if (attempt) {
            outcome = 'ai-checked';
        } else if (reference) {
            outcome = 'manual-reviewed';
        }

        return {
            ...item,
            answer: state.draft,
            attempt,
            reference,
            comparison: state.comparison ?? item.comparison,
            revealedHintIds: [...state.revealedHintIds],
            outcome,
        };
    });
}
