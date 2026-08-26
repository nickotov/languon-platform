import type { DictionaryDocumentMediaType } from '../../domain/document-ingestion';
import type { DictionaryDocumentObjectVersion } from './dictionary-document-upload-storage';

export interface DictionaryDocumentObjectReference {
    checksumSha256: string;
    contentType: DictionaryDocumentMediaType;
    objectKey: string;
    sizeBytes: number;
    uploadId: string;
    storageVersionId: string;
}

export interface VerifiedDictionaryDocumentObject {
    content: AsyncIterable<Uint8Array>;
    reference: DictionaryDocumentObjectReference;
}

export interface PrivateDocumentStorage {
    readiness?(signal: AbortSignal): Promise<void>;
    openExact(
        reference: DictionaryDocumentObjectReference,
        signal: AbortSignal,
    ): Promise<VerifiedDictionaryDocumentObject>;
    putTombstone(input: {
        objectKey: string;
        signal: AbortSignal;
    }): Promise<DictionaryDocumentObjectVersion>;
    listVersions(input: {
        objectKey: string;
        signal: AbortSignal;
    }): Promise<DictionaryDocumentObjectVersion[]>;
    deleteVersion(input: {
        objectKey: string;
        signal: AbortSignal;
        versionId: string;
    }): Promise<void>;
    deleteTombstone(input: {
        objectKey: string;
        signal: AbortSignal;
        versionId: string;
    }): Promise<void>;
}
