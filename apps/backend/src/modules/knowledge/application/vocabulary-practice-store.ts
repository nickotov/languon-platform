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
    WorkbookLearningShareAccess,
} from '@languon/contracts';
export interface VocabularyPracticeActor {
    actorId: string;
    noteId: string;
    blockId: string;
    access?: WorkbookLearningShareAccess | undefined;
}
export interface VocabularyPracticeStore {
    entries(
        source: VocabularyPracticeActor,
        input: LearningEntriesQuery,
    ): Promise<LearningEntriesResponse>;
    preferences(source: VocabularyPracticeActor): Promise<FlashcardPreferences>;
    savePreferences(
        source: VocabularyPracticeActor,
        input: FlashcardPreferencesPutRequest,
    ): Promise<FlashcardPreferences>;
    prepare(
        source: VocabularyPracticeActor,
        input: FlashcardPrepareRequest,
    ): Promise<FlashcardPrepareResponse>;
    items(
        source: VocabularyPracticeActor,
        input: FlashcardItemsRequest,
    ): Promise<FlashcardItemsResponse>;
    progress(
        source: VocabularyPracticeActor,
    ): Promise<FlashcardProgressResponse>;
    rate(
        source: VocabularyPracticeActor,
        input: FlashcardAttemptRequest,
    ): Promise<FlashcardAttemptResponse>;
    undo(
        source: VocabularyPracticeActor,
        attemptId: string,
        input: FlashcardUndoRequest,
    ): Promise<FlashcardUndoResponse>;
}
