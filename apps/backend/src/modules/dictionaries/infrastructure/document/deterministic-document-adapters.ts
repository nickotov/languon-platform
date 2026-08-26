import { createHash } from 'node:crypto';

import type { DocumentMalwareScanner } from '../../application/ports/document-malware-scanner';
import {
    DocumentOcrUnavailableError,
    type DocumentOcrProvider,
} from '../../application/ports/document-ocr-provider';
import type { DictionaryDocumentObjectVersion } from '../../application/ports/dictionary-document-upload-storage';
import type {
    DictionaryDocumentObjectReference,
    PrivateDocumentStorage,
} from '../../application/ports/private-document-storage';
import type {
    DictionaryDocumentExtraction,
    SandboxedDocumentExtractor,
} from '../../application/ports/sandboxed-document-extractor';
import {
    documentIngestionLimitsV1,
    type DictionaryDocumentBlock,
} from '../../domain/document-ingestion';

async function collect(
    content: AsyncIterable<Uint8Array>,
    signal: AbortSignal,
    maximumBytes = documentIngestionLimitsV1.upload.maximumFileBytes,
) {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of content) {
        signal.throwIfAborted();
        length += chunk.byteLength;
        if (length > maximumBytes)
            throw new Error('Deterministic document input exceeds its limit.');
        chunks.push(chunk);
    }
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return output;
}

interface DeterministicStoredObject {
    bytes: Uint8Array;
    reference: DictionaryDocumentObjectReference;
}

export class DeterministicPrivateDocumentStorage implements PrivateDocumentStorage {
    private readonly objects = new Map<string, DeterministicStoredObject>();
    private readonly versions = new Map<
        string,
        DictionaryDocumentObjectVersion[]
    >();

    public constructor(objects: readonly DeterministicStoredObject[] = []) {
        for (const object of objects) this.putForTest(object);
    }

    public readiness(signal: AbortSignal) {
        signal.throwIfAborted();
        return Promise.resolve();
    }

    public putForTest(object: DeterministicStoredObject): void {
        this.objects.set(
            `${object.reference.objectKey}:${object.reference.storageVersionId}`,
            { bytes: object.bytes.slice(), reference: { ...object.reference } },
        );
        this.versions.set(object.reference.objectKey, [
            {
                checksumSha256: object.reference.checksumSha256,
                isCurrent: true,
                kind: 'data',
                sizeBytes: object.bytes.byteLength,
                versionId: object.reference.storageVersionId,
            },
        ]);
    }

    public async openExact(reference: DictionaryDocumentObjectReference) {
        const object = this.objects.get(
            `${reference.objectKey}:${reference.storageVersionId}`,
        );
        if (!object) throw new Error('Exact deterministic object not found.');
        return {
            content: {
                async *[Symbol.asyncIterator]() {
                    yield object.bytes.slice();
                },
            },
            reference: { ...object.reference },
        };
    }

    public putTombstone(input: { objectKey: string; signal: AbortSignal }) {
        input.signal.throwIfAborted();
        const version = {
            checksumSha256: createHash('sha256').update('').digest('hex'),
            contentType: 'application/octet-stream',
            isCurrent: true,
            kind: 'tombstone' as const,
            sizeBytes: 0,
            versionId: `tombstone-${(this.versions.get(input.objectKey)?.length ?? 0) + 1}`,
        };
        const existing = (this.versions.get(input.objectKey) ?? []).map(
            (item) => ({ ...item, isCurrent: false }),
        );
        this.versions.set(input.objectKey, [...existing, version]);
        return Promise.resolve(version);
    }

    public listVersions(input: { objectKey: string; signal: AbortSignal }) {
        input.signal.throwIfAborted();
        return Promise.resolve(
            (this.versions.get(input.objectKey) ?? []).map((item) => ({
                ...item,
            })),
        );
    }

    public deleteVersion(input: {
        objectKey: string;
        signal: AbortSignal;
        versionId: string;
    }) {
        input.signal.throwIfAborted();
        this.versions.set(
            input.objectKey,
            (this.versions.get(input.objectKey) ?? []).filter(
                (item) => item.versionId !== input.versionId,
            ),
        );
        this.objects.delete(`${input.objectKey}:${input.versionId}`);
        return Promise.resolve();
    }

    public deleteTombstone(input: {
        objectKey: string;
        signal: AbortSignal;
        versionId: string;
    }) {
        return this.deleteVersion(input);
    }
}

export class DeterministicDocumentMalwareScanner implements DocumentMalwareScanner {
    public constructor(
        private readonly resolve: DocumentMalwareScanner['scan'] = async ({
            content,
            signal,
        }) => {
            await collect(
                content,
                signal,
                documentIngestionLimitsV1.scanner.maximumStreamBytes,
            );
            return {
                attestation: {
                    engineVersion: 'deterministic-1',
                    signatureUpdatedAt: new Date('2026-08-26T00:00:00.000Z'),
                    signatureVersion: 'deterministic-signatures-1',
                },
                kind: 'clean' as const,
            };
        },
    ) {}

    public scan(input: Parameters<DocumentMalwareScanner['scan']>[0]) {
        return this.resolve(input);
    }

    public readiness(signal: AbortSignal) {
        signal.throwIfAborted();
        return Promise.resolve();
    }
}

function lineBlocks(text: string) {
    return text.split(/\r\n|\n|\r/u).map((line, blockIndex) => {
        const block: DictionaryDocumentBlock =
            line.trim().length === 0
                ? {
                      kind: 'blank',
                      location: { blockIndex, pageNumber: 1 },
                  }
                : {
                      kind: 'line',
                      location: { blockIndex, pageNumber: 1 },
                      text: line,
                  };
        return { block, kind: 'block' as const };
    });
}

export class DeterministicSandboxedDocumentExtractor implements SandboxedDocumentExtractor {
    public constructor(
        private readonly resolve?: (
            input: Parameters<SandboxedDocumentExtractor['extract']>[0],
            bytes: Uint8Array,
        ) =>
            | DictionaryDocumentExtraction
            | Promise<DictionaryDocumentExtraction>,
    ) {}

    public async extract(
        input: Parameters<SandboxedDocumentExtractor['extract']>[0],
    ) {
        const bytes = await collect(input.content, input.signal);
        if (this.resolve) return this.resolve(input, bytes);
        if (
            input.mediaType === 'image/jpeg' ||
            input.mediaType === 'image/png' ||
            input.mediaType === 'image/webp'
        ) {
            return {
                entries: [
                    {
                        kind: 'ocr-page' as const,
                        page: {
                            content: bytes,
                            heightPixels: 1,
                            pageNumber: 1,
                            widthPixels: 1,
                        },
                    },
                ],
                pageCount: 1,
                totalPixels: 1,
            };
        }
        return {
            entries: lineBlocks(new TextDecoder().decode(bytes)),
            pageCount: 1,
            totalPixels: 0,
        };
    }

    public readiness(signal: AbortSignal) {
        signal.throwIfAborted();
        return Promise.resolve();
    }
}

export class DeterministicDocumentOcrProvider implements DocumentOcrProvider {
    public async recognize(
        input: Parameters<DocumentOcrProvider['recognize']>[0],
    ) {
        input.signal.throwIfAborted();
        return {
            lines: new TextDecoder()
                .decode(input.page.content)
                .split(/\r\n|\n|\r/u)
                .filter((line) => line.trim().length > 0)
                .map((text, blockIndex) => ({
                    kind: 'line' as const,
                    location: {
                        blockIndex,
                        pageNumber: input.page.pageNumber,
                    },
                    text,
                })),
        };
    }

    public readiness(signal: AbortSignal) {
        signal.throwIfAborted();
        return Promise.resolve();
    }
}

export class UnavailableDocumentOcrProvider implements DocumentOcrProvider {
    public recognize(): Promise<never> {
        return Promise.reject(new DocumentOcrUnavailableError());
    }

    public readiness(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        return Promise.reject(new Error('Document OCR is unavailable.'));
    }
}
