import type { DictionaryDocumentMediaType } from '../../domain/document-ingestion';

export interface DictionaryDocumentObjectVersion {
    checksumSha256: string;
    contentType?: string | undefined;
    isCurrent: boolean;
    kind: 'data' | 'tombstone';
    sizeBytes: number;
    versionId: string;
}

export class DictionaryDocumentUploadInspectionConflictError extends Error {
    public constructor() {
        super(
            'Document upload inspection conflicted with the expected object.',
        );
        this.name = 'DictionaryDocumentUploadInspectionConflictError';
    }
}

export class DictionaryDocumentUploadInspectionUnavailableError extends Error {
    public constructor() {
        super('Document upload inspection is unavailable.');
        this.name = 'DictionaryDocumentUploadInspectionUnavailableError';
    }
}

/** Least-privilege API-side boundary for issuing and verifying exact uploads. */
export interface DictionaryDocumentUploadStorage {
    authorizeCreate(input: {
        checksumSha256: string;
        contentType: DictionaryDocumentMediaType;
        expiresAt: Date;
        objectKey: string;
        sizeBytes: number;
        signal: AbortSignal;
    }): Promise<{
        method: 'PUT';
        requiredHeaders: Record<string, string>;
        url: string;
    }>;
    inspectVersions(input: {
        expectedChecksumSha256: string;
        expectedContentType: DictionaryDocumentMediaType;
        expectedSizeBytes: number;
        objectKey: string;
        requestedVersionId?: string | undefined;
        signal: AbortSignal;
    }): Promise<{
        detectedFormat: string;
        observedVersionId: string;
        versions: DictionaryDocumentObjectVersion[];
    }>;
}
