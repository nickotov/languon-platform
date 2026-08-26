import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { DictionaryDocumentCleanupProcessor } from '../../../../../src/modules/dictionaries/application/dictionary-document-cleanup-processor';
import type { DictionaryDocumentStore } from '../../../../../src/modules/dictionaries/application/ports/dictionary-document-store';
import { DeterministicPrivateDocumentStorage } from '../../../../../src/modules/dictionaries/infrastructure/document/deterministic-document-adapters';

const now = new Date('2026-08-26T00:00:00.000Z');

function reference() {
    const bytes = Buffer.from('bank');
    return {
        bytes,
        reference: {
            checksumSha256: createHash('sha256').update(bytes).digest('hex'),
            contentType: 'text/plain' as const,
            objectKey: 'dictionary-documents/owner/upload',
            sizeBytes: bytes.byteLength,
            storageVersionId: 'data-1',
            uploadId: 'upload-1',
        },
    };
}

function store(overrides: Partial<DictionaryDocumentStore>) {
    return {
        claimCleanup: vi.fn(),
        completeCleanup: vi.fn(),
        expireUploadAuthorizations: vi.fn().mockResolvedValue(0),
        failCleanup: vi.fn(),
        heartbeatCleanup: vi.fn().mockResolvedValue(true),
        recordCleanupTombstone: vi.fn().mockResolvedValue(true),
        recordDataVersionsDeleted: vi.fn().mockResolvedValue(true),
        ...overrides,
    } as unknown as DictionaryDocumentStore;
}

describe('DictionaryDocumentCleanupProcessor', () => {
    it('tombstones first, deletes all data versions, verifies storage and records full observations', async () => {
        const object = reference();
        const storage = new DeterministicPrivateDocumentStorage([object]);
        const documentStore = store({
            claimCleanup: vi.fn().mockResolvedValue({
                capabilityExpiresAt: new Date(now.getTime() + 600_000),
                designatedTombstoneVersionId: null,
                fencingToken: 2n,
                jobId: 'job-1',
                objectKey: object.reference.objectKey,
                phase: 'delete_data',
                uploadId: object.reference.uploadId,
                versions: [],
                workerId: 'worker-1',
            }),
        });
        const service = new DictionaryDocumentCleanupProcessor({
            clock: { now: () => now },
            storage,
            store: documentStore,
        });

        await expect(
            service.processNext({
                signal: new AbortController().signal,
                workerId: 'worker-1',
            }),
        ).resolves.toBe(true);

        expect(documentStore.recordCleanupTombstone).toHaveBeenCalledOnce();
        expect(documentStore.recordDataVersionsDeleted).toHaveBeenCalledWith(
            expect.objectContaining({
                deletedVersions: [
                    expect.objectContaining({
                        kind: 'data',
                        sizeBytes: 4,
                        versionId: 'data-1',
                    }),
                ],
            }),
        );
        await expect(
            storage.listVersions({
                objectKey: object.reference.objectKey,
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual([
            expect.objectContaining({ kind: 'tombstone', isCurrent: true }),
        ]);
    });

    it('deletes the retained tombstone only in the expiry phase', async () => {
        const object = reference();
        const storage = new DeterministicPrivateDocumentStorage([object]);
        const tombstone = await storage.putTombstone({
            objectKey: object.reference.objectKey,
            signal: new AbortController().signal,
        });
        await storage.deleteVersion({
            objectKey: object.reference.objectKey,
            signal: new AbortController().signal,
            versionId: object.reference.storageVersionId,
        });
        const documentStore = store({
            claimCleanup: vi.fn().mockResolvedValue({
                capabilityExpiresAt: now,
                designatedTombstoneVersionId: tombstone.versionId,
                fencingToken: 3n,
                jobId: 'job-1',
                objectKey: object.reference.objectKey,
                phase: 'delete_tombstone',
                uploadId: object.reference.uploadId,
                versions: [tombstone],
                workerId: 'worker-1',
            }),
            completeCleanup: vi.fn().mockResolvedValue(true),
        });
        const service = new DictionaryDocumentCleanupProcessor({
            clock: { now: () => now },
            storage,
            store: documentStore,
        });

        await service.processNext({
            signal: new AbortController().signal,
            workerId: 'worker-1',
        });

        expect(documentStore.completeCleanup).toHaveBeenCalledWith(
            expect.objectContaining({
                deletedTombstoneVersionId: tombstone.versionId,
            }),
        );
        await expect(
            storage.listVersions({
                objectKey: object.reference.objectKey,
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual([]);
    });
});
