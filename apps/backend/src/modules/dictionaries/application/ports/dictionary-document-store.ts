import type {
    DictionaryDocumentTermsGenerationJob,
    DictionaryPastedTermsGenerationProposal,
} from '@languon/contracts';

import type { DictionaryDocumentMediaType } from '../../domain/document-ingestion';
import type { DictionaryOperationContext } from './dictionary-store';
import type { DictionaryDocumentObjectVersion } from './dictionary-document-upload-storage';

export interface DictionaryDocumentUploadAuthorization {
    capabilityExpiresAt: Date;
    job: DictionaryDocumentTermsGenerationJob;
    objectKey: string;
    uploadId: string;
}

export interface DictionaryDocumentWorkerUpload {
    checksumSha256: string;
    contentType: DictionaryDocumentMediaType;
    detectedFormat: string;
    objectKey: string;
    sizeBytes: number;
    storageVersionId: string;
    uploadId: string;
}

export interface DictionaryDocumentCleanupClaim {
    capabilityExpiresAt: Date;
    designatedTombstoneVersionId: string | null;
    fencingToken: bigint;
    jobId: string;
    objectKey: string;
    phase: 'delete_data' | 'delete_tombstone';
    uploadId: string;
    versions: DictionaryDocumentObjectVersion[];
    workerId: string;
}

export interface DictionaryDocumentStore {
    expireUploadAuthorizations(input: {
        context: DictionaryOperationContext;
        limit: number;
    }): Promise<number>;
    readUploadAuthorization(input: {
        context: DictionaryOperationContext;
        ownerId: string;
        uploadId: string;
    }): Promise<{
        capabilityExpiresAt: Date;
        expectedChecksumSha256: string;
        expectedContentType: DictionaryDocumentMediaType;
        expectedSizeBytes: number;
        job: DictionaryDocumentTermsGenerationJob;
        objectKey: string;
        processingState: string;
        verifiedStorageVersionId: string | null;
    }>;
    authorize(input: {
        capabilityExpiresAt: Date;
        context: DictionaryOperationContext;
        dictionaryId: string;
        expectedDictionaryVersion: number;
        expectedSettingsVersion: number;
        expectedChecksumSha256: string;
        expectedContentType: DictionaryDocumentMediaType;
        expectedSizeBytes: number;
        fingerprint: string;
        idempotencyKey: string;
        instruction: string | null;
        ownerId: string;
    }): Promise<DictionaryDocumentUploadAuthorization>;
    completeUpload(input: {
        context: DictionaryOperationContext;
        detectedFormat: string;
        ownerId: string;
        requestedVersionId: string;
        uploadId: string;
        versions: DictionaryDocumentObjectVersion[];
    }): Promise<DictionaryDocumentTermsGenerationJob>;
    loadDocumentUploadForWorker(input: {
        context: DictionaryOperationContext;
        fencingToken: bigint;
        jobId: string;
        workerId: string;
    }): Promise<DictionaryDocumentWorkerUpload | null>;
    stageDocumentProposal(input: {
        context: DictionaryOperationContext;
        extractionFingerprint: string;
        failureUnitCount: number;
        fencingToken: bigint;
        jobId: string;
        observedUnitCount: number;
        proposal: DictionaryPastedTermsGenerationProposal;
        providerUsage: {
            inputTokens: number;
            outputTokens: number;
        };
        reviewExpiresAt: Date;
        scanAttestation: {
            completedAt: Date;
            engineVersion: string;
            signatureUpdatedAt: Date;
            signatureVersion: string;
        };
        validUnitCount: number;
        workerId: string;
    }): Promise<boolean>;
    publishDocumentProposalAfterCleanup(input: {
        context: DictionaryOperationContext;
        fencingToken: bigint;
        jobId: string;
        uploadId: string;
        workerId: string;
    }): Promise<boolean>;
    recordDocumentProcessingFailure(input: {
        category: 'extraction_failed' | 'invalid_document' | 'ocr_failed';
        context: DictionaryOperationContext;
        fencingToken: bigint;
        jobId: string;
        retryAt: Date | null;
        scanAttestation: {
            completedAt: Date;
            engineVersion: string;
            signatureUpdatedAt: Date;
            signatureVersion: string;
        };
        workerId: string;
    }): Promise<boolean>;
    terminalizeExtraction(input: {
        context: DictionaryOperationContext;
        extractionFingerprint: string;
        fencingToken: bigint;
        jobId: string;
        outcome: 'no_terms_found' | 'too_many_terms';
        scanAttestation: {
            completedAt: Date;
            engineVersion: string;
            signatureUpdatedAt: Date;
            signatureVersion: string;
        };
        workerId: string;
    }): Promise<boolean>;
    claimCleanup(input: {
        context: DictionaryOperationContext;
        leaseDurationMs: number;
        workerId: string;
    }): Promise<DictionaryDocumentCleanupClaim | null>;
    recordCleanupTombstone(input: {
        context: DictionaryOperationContext;
        fencingToken: bigint;
        storageVersionId: string;
        uploadId: string;
        workerId: string;
    }): Promise<boolean>;
    recordDataVersionsDeleted(input: {
        context: DictionaryOperationContext;
        deletedVersions: DictionaryDocumentObjectVersion[];
        fencingToken: bigint;
        uploadId: string;
        workerId: string;
    }): Promise<boolean>;
    completeCleanup(input: {
        context: DictionaryOperationContext;
        deletedTombstoneVersionId: string;
        fencingToken: bigint;
        uploadId: string;
        workerId: string;
    }): Promise<boolean>;
    failCleanup(input: {
        context: DictionaryOperationContext;
        failureCategory: string;
        fencingToken: bigint;
        retryAt: Date;
        uploadId: string;
        workerId: string;
    }): Promise<boolean>;
    heartbeatCleanup(input: {
        context: DictionaryOperationContext;
        fencingToken: bigint;
        nextLeaseDeadline: Date;
        uploadId: string;
        workerId: string;
    }): Promise<boolean>;
}
