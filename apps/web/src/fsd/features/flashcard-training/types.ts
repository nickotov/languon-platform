import type {
    FlashcardAttemptRequest,
    FlashcardAttemptResponse,
    FlashcardConfiguration,
    FlashcardField,
    FlashcardItem as ContractItem,
    FlashcardItemsRequest,
    FlashcardItemsResponse,
    FlashcardPreferences,
    FlashcardPreferencesPutRequest,
    FlashcardPrepareRequest,
    FlashcardPrepareResponse,
    FlashcardProgressResponse,
    FlashcardRating,
    FlashcardUndoResponse,
    LearningCapabilitiesResponse,
    LearningEntriesQuery,
    LearningEntriesResponse,
} from '@languon/contracts';

export type Field = FlashcardField;
export type Configuration = FlashcardConfiguration;
export type FlashcardItem = ContractItem;
export type Rating = FlashcardRating;
export type Face = 'front' | 'back';
export type Preferences = FlashcardPreferences;
export type PrepareResponse = FlashcardPrepareResponse;
export type Progress = FlashcardProgressResponse;
export type EntryPreview = LearningEntriesResponse['entries'][number];
export type EntriesPage = LearningEntriesResponse;
export type Scope = FlashcardPrepareRequest['scope'];
export type Presentation = ContractItem['front'][number];
export type TrainingTarget =
    | { kind: 'owner'; dictionaryId: string }
    | { kind: 'shared'; shareId: string; shareKey: string };
export type LearningTarget = TrainingTarget;
export type { RequestWithSession } from '@/fsd/entities/dictionary';

export interface LearningApi {
    capabilities(): Promise<LearningCapabilitiesResponse>;
    getPreferences(): Promise<Preferences>;
    putPreferences(input: FlashcardPreferencesPutRequest): Promise<Preferences>;
    prepare(input: FlashcardPrepareRequest): Promise<PrepareResponse>;
    getItems(input: FlashcardItemsRequest): Promise<FlashcardItemsResponse>;
    listEntries(input: Partial<LearningEntriesQuery>): Promise<EntriesPage>;
    getProgress(): Promise<Progress>;
    rate(input: FlashcardAttemptRequest): Promise<FlashcardAttemptResponse>;
    undo(
        attemptId: string,
        operationId: string,
    ): Promise<FlashcardUndoResponse>;
}

export interface StartPayload {
    configuration: Configuration;
    shuffle: boolean;
    entryIds: string[];
    prepared: PrepareResponse;
}
