import type { ReactNode } from 'react';
import type {
    SentenceLibraryDetail,
    SentenceLibraryItem,
    SentenceLibraryFilters,
    SentenceLibraryOperation,
    SentenceLibrarySelection,
    SentenceLibraryListResponse,
    SentenceLibrarySnapshotResponse,
    SentenceLibraryMutationRequest,
    SentenceLibraryMutationResponse,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
export type LibraryTarget =
    | { kind: 'owner'; dictionaryId: string }
    | { kind: 'shared'; shareId: string; shareKey: string };
export interface LibraryDictionary {
    id: string;
    name: string;
    sourceLanguage: string;
    targetLanguage: string;
}
export interface LibraryHint {
    id: string;
    source: string;
    target: string;
    kind: 'word' | 'phrase';
    note?: string;
}
export interface SavedSentence {
    id: string;
    dictionaryId: string;
    sentenceLanguage: string;
    answerLanguage: string;
    sentence: string;
    reference: string;
    dictionaryHints: LibraryHint[];
    contextHints: LibraryHint[];
    createdAt: string;
    ownership: 'mine' | 'shared';
    outdated: boolean;
    archivedByMe: boolean;
    globallyArchived: boolean;
    enrichment: 'rich' | 'legacy';
    version: number;
}
export interface LibraryApi {
    list(
        query: SentenceLibraryFilters & { cursor?: string; limit?: number },
    ): Promise<SentenceLibraryListResponse>;
    detail(id: string): Promise<SentenceLibraryDetail>;
    snapshot(
        operation: SentenceLibraryOperation,
        query: SentenceLibraryFilters,
    ): Promise<SentenceLibrarySnapshotResponse>;
    mutate(
        input: SentenceLibraryMutationRequest,
    ): Promise<SentenceLibraryMutationResponse>;
}
export interface LibraryProps {
    target: LibraryTarget;
    dictionary: LibraryDictionary;
    requestWithSession: RequestWithSession;
    identity: string;
    dictionaryHref: string;
    exampleId?: string;
    preparationChip?: ReactNode;
    onOpenPreparation?(): void;
}
export interface Confirmation {
    operation: SentenceLibraryOperation;
    selection: SentenceLibrarySelection;
    count: number;
    operationId: string;
    filters: SentenceLibraryFilters;
}
export type {
    SentenceLibraryItem,
    SentenceLibraryFilters,
    SentenceLibraryOperation,
};
