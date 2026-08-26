import type { DictionaryDocumentBlock } from '../../domain/document-ingestion';
import type { DictionaryDocumentOcrPage } from './sandboxed-document-extractor';

export interface DictionaryDocumentOcrResult {
    lines: Array<Extract<DictionaryDocumentBlock, { kind: 'line' }>>;
}

export class DocumentOcrUnavailableError extends Error {
    public constructor() {
        super('Document OCR is unavailable.');
        this.name = 'DocumentOcrUnavailableError';
    }
}

export interface DocumentOcrProvider {
    recognize(input: {
        idempotencyKey: string;
        page: DictionaryDocumentOcrPage;
        signal: AbortSignal;
    }): Promise<DictionaryDocumentOcrResult>;
    readiness?(signal: AbortSignal): Promise<void>;
}
