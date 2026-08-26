import type {
    CreateDictionaryCardRequest,
    CreateDictionaryRequest,
    DictionaryCard,
    DictionaryCardLifecycleMutationRequest,
    DictionaryExportFormat,
    DictionaryDeterministicImportResponse,
    DictionaryImportRowWarning,
    DictionaryImportTarget,
    DictionaryLifecycleMutationRequest,
    DictionaryShareCapability,
    DictionarySummary,
    ForkSharedDictionaryRequest,
    ListDictionariesQuery,
    ListDictionaryCardsQuery,
    ListSharedDictionaryQuery,
    OwnedDictionary,
    PublicDictionary,
    ReorderDictionaryCardsRequest,
    UpdateDictionaryCardRequest,
    UpdateDictionaryRequest,
} from '@languon/contracts';

import type {
    DictionaryInterchangeExportMetadata,
    DictionaryInterchangePair,
} from '../../domain/interchange';

export interface DictionaryOperationContext {
    now: Date;
    signal: AbortSignal;
}

export interface SharedDictionaryCandidate {
    dictionaryId: string;
    shareDigest: string;
    shareVersion: number;
}

export interface DictionaryStore {
    authorizeDictionaryImportTarget(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        requireExpectedVersions: boolean;
        target: DictionaryImportTarget;
    }): Promise<void>;
    archiveDictionary(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        request: DictionaryLifecycleMutationRequest;
    }): Promise<OwnedDictionary>;
    archiveCard(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        cardId: string;
        request: DictionaryCardLifecycleMutationRequest;
    }): Promise<{
        card: DictionaryCard;
        dictionaryVersion: number;
        duplicateSource?: boolean;
    }>;
    createCard(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        request: CreateDictionaryCardRequest;
    }): Promise<{
        card: DictionaryCard;
        dictionaryVersion: number;
        duplicateSource?: boolean;
    }>;
    createDictionary(input: {
        context: DictionaryOperationContext;
        fingerprint: string;
        idempotencyKey: string;
        ownerId: string;
        request: CreateDictionaryRequest;
    }): Promise<OwnedDictionary>;
    findSharedCandidate(input: {
        context: DictionaryOperationContext;
        shareId: string;
    }): Promise<SharedDictionaryCandidate | null>;
    forkSharedDictionary(input: {
        context: DictionaryOperationContext;
        fingerprint: string;
        idempotencyKey: string;
        ownerId: string;
        request: ForkSharedDictionaryRequest;
        sourceDictionaryId: string;
        verifiedShareDigest: string;
    }): Promise<OwnedDictionary>;
    importDictionary(input: {
        context: DictionaryOperationContext;
        fingerprint: string;
        idempotencyKey: string;
        ownerId: string;
        rows: readonly DictionaryInterchangePair[];
        target: DictionaryImportTarget;
    }): Promise<DictionaryDeterministicImportResponse>;
    listCards(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        query: ListDictionaryCardsQuery;
    }): Promise<{
        data: DictionaryCard[];
        dictionaryVersion: number;
        nextCursor: string | null;
        settingsVersion: number;
    }>;
    listDictionaries(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        query: ListDictionariesQuery;
    }): Promise<{ data: DictionarySummary[]; nextCursor: string | null }>;
    previewDictionaryImport(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        rows: readonly DictionaryInterchangePair[];
        target: DictionaryImportTarget;
    }): Promise<{
        remainingRows: number;
        warnings: DictionaryImportRowWarning[];
    }>;
    readCard(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        cardId: string;
    }): Promise<{ card: DictionaryCard; dictionaryVersion: number }>;
    readDictionary(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
    }): Promise<OwnedDictionary>;
    readSharedDictionary(input: {
        context: DictionaryOperationContext;
        dictionaryId: string;
        query: ListSharedDictionaryQuery;
        verifiedShareDigest: string;
    }): Promise<{ dictionary: PublicDictionary; nextCursor: string | null }>;
    replayForkDictionary(input: {
        context: DictionaryOperationContext;
        fingerprint: string;
        idempotencyKey: string;
        ownerId: string;
    }): Promise<OwnedDictionary | null>;
    reorderCards(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        request: ReorderDictionaryCardsRequest;
    }): Promise<{ dictionaryVersion: number }>;
    restoreCard(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        cardId: string;
        request: DictionaryCardLifecycleMutationRequest;
    }): Promise<{ card: DictionaryCard; dictionaryVersion: number }>;
    restoreDictionary(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        request: DictionaryLifecycleMutationRequest;
    }): Promise<OwnedDictionary>;
    streamDictionaryExport(input: {
        context: DictionaryOperationContext;
        dictionaryId: string;
        format: DictionaryExportFormat;
        onCards(cards: readonly DictionaryCard[]): Promise<void>;
        onMetadata(
            metadata: DictionaryInterchangeExportMetadata,
        ): Promise<void>;
        ownerId: string;
    }): Promise<void>;
    rotateShare(input: {
        context: DictionaryOperationContext;
        digest: string;
        keyVersion: number;
        locator: string;
        ownerId: string;
        dictionaryId: string;
        expectedDictionaryVersion: number;
    }): Promise<OwnedDictionary>;
    updateCard(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        cardId: string;
        request: UpdateDictionaryCardRequest;
    }): Promise<{
        card: DictionaryCard;
        dictionaryVersion: number;
        duplicateSource?: boolean;
    }>;
    updateDictionary(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        dictionaryId: string;
        request: UpdateDictionaryRequest;
    }): Promise<OwnedDictionary>;
}

export type RotateShareResult = {
    capability: DictionaryShareCapability;
    dictionary: OwnedDictionary;
};
