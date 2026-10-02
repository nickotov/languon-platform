import type {
    FlashcardAttemptRequest,
    FlashcardAttemptResponse,
    FlashcardItemsRequest,
    FlashcardItemsResponse,
    FlashcardPreferences,
    FlashcardPreferencesPutRequest,
    FlashcardPrepareRequest,
    FlashcardPrepareResponse,
    FlashcardProgressResponse,
    FlashcardUndoRequest,
    FlashcardUndoResponse,
    LearningEntriesQuery,
    LearningEntriesResponse,
} from '@languon/contracts';

export type LearningAccess =
    | { kind: 'owner'; dictionaryId: string; learnerId: string }
    | {
          kind: 'shared';
          shareId: string;
          keyDigest: string;
          learnerId: string | null;
      };
export interface LearningContext {
    signal: AbortSignal;
}
export interface LearningStore {
    listEntries(
        access: LearningAccess,
        query: LearningEntriesQuery,
        context: LearningContext,
    ): Promise<LearningEntriesResponse>;
    getPreferences(
        access: LearningAccess,
        context: LearningContext,
    ): Promise<FlashcardPreferences>;
    savePreferences(
        access: LearningAccess,
        input: FlashcardPreferencesPutRequest,
        context: LearningContext,
    ): Promise<FlashcardPreferences>;
    prepare(
        access: LearningAccess,
        input: FlashcardPrepareRequest,
        context: LearningContext,
    ): Promise<FlashcardPrepareResponse>;
    items(
        access: LearningAccess,
        input: FlashcardItemsRequest,
        context: LearningContext,
    ): Promise<FlashcardItemsResponse>;
    progress(
        access: LearningAccess,
        context: LearningContext,
    ): Promise<FlashcardProgressResponse>;
    recordAttempt(
        access: LearningAccess,
        input: FlashcardAttemptRequest,
        context: LearningContext,
    ): Promise<FlashcardAttemptResponse>;
    undo(
        access: LearningAccess,
        attemptId: string,
        input: FlashcardUndoRequest,
        context: LearningContext,
    ): Promise<FlashcardUndoResponse>;
}
