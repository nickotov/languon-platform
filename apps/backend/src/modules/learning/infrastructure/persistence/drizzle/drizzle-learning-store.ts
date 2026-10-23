import type {
    FlashcardAttemptRequest,
    FlashcardItemsRequest,
    FlashcardPreferencesPutRequest,
    FlashcardPrepareRequest,
    FlashcardUndoRequest,
    LearningEntriesQuery,
} from '@languon/contracts';
import type {
    LearningAccess,
    LearningContext,
    LearningStore,
} from '../../../application/ports/learning-store';
import {
    flashcardRecordAttempt,
    flashcardUndo,
} from './flashcard-attempt-mutations';
import {
    flashcardGetPreferences,
    flashcardListEntries,
    flashcardSavePreferences,
} from './flashcard-entry-queries';
import type { Database } from './flashcard-persistence-context';
import { type FlashcardPersistenceContext } from './flashcard-persistence-context';
import {
    flashcardItems,
    flashcardPrepare,
    flashcardProgress,
} from './flashcard-practice-round';

export class DrizzleLearningStore implements LearningStore {
    private readonly persistence: FlashcardPersistenceContext;

    public constructor(database: Database) {
        this.persistence = { database };
    }

    public async listEntries(
        access: LearningAccess,
        query: LearningEntriesQuery,
        context: LearningContext,
    ) {
        return flashcardListEntries(this.persistence, access, query, context);
    }

    public async getPreferences(
        access: LearningAccess,
        context: LearningContext,
    ) {
        return flashcardGetPreferences(this.persistence, access, context);
    }

    public async savePreferences(
        access: LearningAccess,
        input: FlashcardPreferencesPutRequest,
        context: LearningContext,
    ) {
        return flashcardSavePreferences(
            this.persistence,
            access,
            input,
            context,
        );
    }

    public async prepare(
        access: LearningAccess,
        input: FlashcardPrepareRequest,
        context: LearningContext,
    ) {
        return flashcardPrepare(this.persistence, access, input, context);
    }

    public async items(
        access: LearningAccess,
        input: FlashcardItemsRequest,
        context: LearningContext,
    ) {
        return flashcardItems(this.persistence, access, input, context);
    }

    public async progress(access: LearningAccess, context: LearningContext) {
        return flashcardProgress(this.persistence, access, context);
    }

    public async recordAttempt(
        access: LearningAccess,
        input: FlashcardAttemptRequest,
        context: LearningContext,
    ) {
        return flashcardRecordAttempt(this.persistence, access, input, context);
    }

    public async undo(
        access: LearningAccess,
        attemptId: string,
        input: FlashcardUndoRequest,
        context: LearningContext,
    ) {
        return flashcardUndo(
            this.persistence,
            access,
            attemptId,
            input,
            context,
        );
    }
}
