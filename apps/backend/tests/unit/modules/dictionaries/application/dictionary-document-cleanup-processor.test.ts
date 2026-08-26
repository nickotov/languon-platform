import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { DictionaryDocumentCleanupProcessor } from '../../../../../src/modules/dictionaries/application/dictionary-document-cleanup-processor';
import type { DictionaryDocumentStore } from '../../../../../src/modules/dictionaries/application/ports/dictionary-document-store';
import type { PrivateDocumentStorage } from '../../../../../src/modules/dictionaries/application/ports/private-document-storage';
import { DeterministicPrivateDocumentStorage } from '../../../../../src/modules/dictionaries/infrastructure/document/deterministic-document-adapters';

const uploadId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const objectKey = 'documents/owner/upload';
const bytes = new TextEncoder().encode('bank');
const reference = {
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    contentType: 'text/plain' as const,
    objectKey,
    sizeBytes: bytes.byteLength,
    storageVersionId: 'data-1',
    uploadId,
};

describe('DictionaryDocumentCleanupProcessor', () => {
    it('persists a tombstone before deleting data, publishes, then removes the tombstone after expiry', async () => {
        const storage = new DeterministicPrivateDocumentStorage([
            { bytes, reference },
        ]);
        const providerDeleteMarker = await storage.putTombstone({
            objectKey,
            signal: new AbortController().signal,
        });
        const recordCleanupTombstone = vi.fn(async () => true);
        const recordDataVersionsDeleted = vi.fn(async () => true);
        const completeCleanup = vi.fn(async () => true);
        let claimIndex = 0;
        const expireUploadAuthorizations = vi.fn(async () => 0);
        const store = {
            expireUploadAuthorizations,
            claimCleanup: vi.fn(async () => {
                claimIndex += 1;
                if (claimIndex === 1)
                    return {
                        capabilityExpiresAt: new Date(
                            '2026-08-26T12:10:00.000Z',
                        ),
                        designatedTombstoneVersionId: null,
                        fencingToken: 1n,
                        jobId,
                        objectKey,
                        phase: 'delete_data' as const,
                        uploadId,
                        versions: [
                            {
                                checksumSha256: reference.checksumSha256,
                                isCurrent: true,
                                kind: 'data' as const,
                                sizeBytes: bytes.byteLength,
                                versionId: reference.storageVersionId,
                            },
                        ],
                        workerId: 'cleanup-a',
                    };
                const versions = await storage.listVersions({
                    objectKey,
                    signal: new AbortController().signal,
                });
                return {
                    capabilityExpiresAt: new Date('2026-08-26T12:10:00.000Z'),
                    fencingToken: 2n,
                    designatedTombstoneVersionId:
                        versions.find(
                            (version) =>
                                version.kind === 'tombstone' &&
                                version.isCurrent,
                        )?.versionId ?? null,
                    jobId,
                    objectKey,
                    phase: 'delete_tombstone' as const,
                    uploadId,
                    versions,
                    workerId: 'cleanup-a',
                };
            }),
            completeCleanup,
            failCleanup: vi.fn(async () => true),
            heartbeatCleanup: vi.fn(async () => true),
            recordCleanupTombstone,
            recordDataVersionsDeleted,
        } as unknown as DictionaryDocumentStore;
        let now = new Date('2026-08-26T12:00:00.000Z');
        const processor = new DictionaryDocumentCleanupProcessor({
            clock: { now: () => now },
            storage,
            store,
        });

        await expect(
            processor.processNext({
                signal: new AbortController().signal,
                workerId: 'root-worker',
            }),
        ).resolves.toBe(true);
        expect(expireUploadAuthorizations).toHaveBeenCalledWith({
            context: { now, signal: expect.any(AbortSignal) },
            limit: 100,
        });
        expect(recordCleanupTombstone).toHaveBeenCalledOnce();
        expect(recordCleanupTombstone).not.toHaveBeenCalledWith(
            expect.objectContaining({
                storageVersionId: providerDeleteMarker.versionId,
            }),
        );
        expect(recordDataVersionsDeleted).toHaveBeenCalledWith(
            expect.objectContaining({
                deletedVersions: [
                    expect.objectContaining({ versionId: 'data-1' }),
                ],
            }),
        );
        expect(
            await storage.listVersions({
                objectKey,
                signal: new AbortController().signal,
            }),
        ).toEqual([expect.objectContaining({ kind: 'tombstone' })]);

        now = new Date('2026-08-26T12:10:01.000Z');
        await processor.processNext({
            signal: new AbortController().signal,
            workerId: 'root-worker',
        });
        expect(completeCleanup).toHaveBeenCalledOnce();
        expect(
            await storage.listVersions({
                objectKey,
                signal: new AbortController().signal,
            }),
        ).toEqual([]);
    });

    it('persists only a sanitized retry after storage cleanup failure', async () => {
        const failCleanup = vi.fn(async () => true);
        const store = {
            expireUploadAuthorizations: vi.fn(async () => 0),
            claimCleanup: vi.fn(async () => ({
                capabilityExpiresAt: new Date('2026-08-26T12:10:00.000Z'),
                designatedTombstoneVersionId: null,
                fencingToken: 1n,
                jobId,
                objectKey,
                phase: 'delete_data' as const,
                uploadId,
                versions: [],
                workerId: 'cleanup-a',
            })),
            failCleanup,
            heartbeatCleanup: vi.fn(async () => true),
        } as unknown as DictionaryDocumentStore;
        const storage = {
            listVersions: vi.fn(async () => {
                throw new Error('secret provider response');
            }),
        } as unknown as PrivateDocumentStorage;
        const processor = new DictionaryDocumentCleanupProcessor({
            clock: {
                now: () => new Date('2026-08-26T12:00:00.000Z'),
            },
            storage,
            store,
        });

        await processor.processNext({
            signal: new AbortController().signal,
            workerId: 'root-worker',
        });

        expect(failCleanup).toHaveBeenCalledWith(
            expect.objectContaining({
                failureCategory: 'cleanup_failed',
                retryAt: new Date('2026-08-26T12:00:05.000Z'),
            }),
        );
        expect(failCleanup).toHaveBeenCalledOnce();
        const [persistedFailure] = failCleanup.mock.calls[0]! as unknown as [
            Record<string, unknown>,
        ];
        expect(persistedFailure).not.toHaveProperty('message');
    });

    it('reports bounded authorization sweep work when cleanup is concurrently unavailable', async () => {
        const expireUploadAuthorizations = vi.fn(async () => 7);
        const claimCleanup = vi.fn(async () => null);
        const processor = new DictionaryDocumentCleanupProcessor(
            {
                clock: {
                    now: () => new Date('2026-08-26T12:00:00.000Z'),
                },
                storage: {} as PrivateDocumentStorage,
                store: {
                    claimCleanup,
                    expireUploadAuthorizations,
                } as unknown as DictionaryDocumentStore,
            },
            { authorizationSweepLimit: 7 },
        );

        await expect(
            processor.processNext({
                signal: new AbortController().signal,
                workerId: 'cleanup-a',
            }),
        ).resolves.toBe(true);
        expect(expireUploadAuthorizations).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 7 }),
        );
        expect(claimCleanup).toHaveBeenCalledOnce();
    });
});
