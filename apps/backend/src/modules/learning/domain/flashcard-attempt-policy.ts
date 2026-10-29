import type {
    FlashcardAttemptRequest,
    FlashcardConfiguration,
    FlashcardRating,
} from '@languon/contracts';
export interface FlashcardAttemptIdentity {
    entryId: string;
    sessionId: string;
    round: number;
    learningVersion: number;
    rating: FlashcardRating;
    configuration: FlashcardConfiguration;
}
/** Shared across dictionary and Knowledge sources; transport identity is checked separately. */
export function sameFlashcardAttempt(
    row: FlashcardAttemptIdentity,
    input: FlashcardAttemptRequest,
) {
    return (
        row.entryId === input.entryId &&
        row.sessionId === input.sessionId &&
        row.round === input.round &&
        row.learningVersion === input.expectedLearningVersion &&
        row.rating === input.rating &&
        JSON.stringify(row.configuration.front) ===
            JSON.stringify(input.configuration.front) &&
        JSON.stringify(row.configuration.back) ===
            JSON.stringify(input.configuration.back)
    );
}
export function canUndoFlashcardAttempt(input: {
    targetId: string;
    voided: boolean;
    latestSessionId: string | undefined;
    latestEntryId: string | undefined;
}) {
    return (
        !input.voided &&
        input.latestSessionId === input.targetId &&
        input.latestEntryId === input.targetId
    );
}
