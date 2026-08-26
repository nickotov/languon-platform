import type {
    DictionaryDocumentBlock,
    DictionaryDocumentMediaType,
} from '../../domain/document-ingestion';

export interface DictionaryDocumentOcrPage {
    content: Uint8Array;
    heightPixels: number;
    pageNumber: number;
    widthPixels: number;
}

export type DictionaryDocumentExtractionEntry =
    | { block: DictionaryDocumentBlock; kind: 'block' }
    | { kind: 'ocr-page'; page: DictionaryDocumentOcrPage };

export interface DictionaryDocumentExtraction {
    entries: DictionaryDocumentExtractionEntry[];
    pageCount: number;
    totalPixels: number;
}

export interface SandboxedDocumentExtractor {
    extract(input: {
        content: AsyncIterable<Uint8Array>;
        mediaType: DictionaryDocumentMediaType;
        signal: AbortSignal;
    }): Promise<DictionaryDocumentExtraction>;
    readiness?(signal: AbortSignal): Promise<void>;
}
