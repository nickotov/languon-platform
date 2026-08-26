import { describe, expect, it, vi } from 'vitest';

import { DictionaryDocumentService } from '../../../../../src/modules/dictionaries/application/dictionary-document-service';
import {
    DictionaryDocumentUploadConflictError,
    DictionaryGenerationNotAvailableError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import {
    DictionaryDocumentUploadInspectionConflictError,
    DictionaryDocumentUploadInspectionUnavailableError,
    type DictionaryDocumentUploadStorage,
} from '../../../../../src/modules/dictionaries/application/ports/dictionary-document-upload-storage';

const now = new Date('2026-08-26T12:00:00.000Z');
const context = {
    clientAddress: '127.0.0.1',
    signal: new AbortController().signal,
};
const job = {
    cancellationRequested: false,
    completedAt: null,
    createdAt: now.toISOString(),
    dictionaryId: '2db8e37d-48e9-41ae-af84-4f6cbbc56e57',
    expectedDictionaryVersion: 1,
    expectedSettingsVersion: 1,
    expiresAt: null,
    failure: null,
    format: 'document-terms:v1' as const,
    id: '225238a3-da7f-4f73-8305-3c012296b757',
    kind: 'document-terms' as const,
    outcome: null,
    progress: { percent: 0, stage: 'awaiting_upload' as const },
    proposal: null,
    sourceLanguage: 'en',
    state: 'awaiting-upload' as const,
    targetLanguage: 'fr',
    updatedAt: now.toISOString(),
};
const request = {
    expectedDictionaryVersion: 1,
    expectedSettingsVersion: 1,
    instruction: null,
    mediaType: 'text/plain' as const,
    sha256: 'a'.repeat(64),
    sizeBytes: 12,
};

function createService(overrides: {
    authorizationEnabled?: boolean;
    authorize?: ReturnType<typeof vi.fn>;
    authorizeCreate?: DictionaryDocumentUploadStorage['authorizeCreate'];
    completeUpload?: ReturnType<typeof vi.fn>;
    inspectVersions?: DictionaryDocumentUploadStorage['inspectVersions'];
    readUploadAuthorization?: ReturnType<typeof vi.fn>;
}) {
    return new DictionaryDocumentService({
        authentication: {
            authenticate: async () => ({
                sessionId: 'session-id',
                userId: 'owner-id',
            }),
        },
        authorizationEnabled: overrides.authorizationEnabled ?? true,
        clock: { now: () => now },
        cryptography: { fingerprint: () => 'sha256:v1:test' } as never,
        rateLimiter: { consume: async () => ({ allowed: true }) },
        storage: {
            authorizeCreate:
                overrides.authorizeCreate ??
                vi.fn(async () => ({
                    method: 'PUT' as const,
                    requiredHeaders: { 'content-type': 'text/plain' },
                    url: 'https://uploads.example.test/exact',
                })),
            inspectVersions:
                overrides.inspectVersions ??
                vi.fn(async () => ({
                    detectedFormat: 'txt',
                    observedVersionId: 'version-1',
                    versions: [],
                })),
        },
        store: {
            authorize:
                overrides.authorize ??
                vi.fn(async () => ({
                    capabilityExpiresAt: new Date(now.getTime() + 10 * 60_000),
                    job,
                    objectKey: 'dictionary-documents/owner/upload',
                    uploadId: 'f4460b54-b06d-42df-a2a6-548dc6808d31',
                })),
            completeUpload: overrides.completeUpload ?? vi.fn(async () => job),
            readUploadAuthorization:
                overrides.readUploadAuthorization ??
                vi.fn(async () => ({
                    capabilityExpiresAt: new Date(now.getTime() + 10 * 60_000),
                    expectedChecksumSha256: request.sha256,
                    expectedContentType: request.mediaType,
                    expectedSizeBytes: request.sizeBytes,
                    job,
                    objectKey: 'dictionary-documents/owner/upload',
                    processingState: 'authorized',
                    verifiedStorageVersionId: null,
                })),
        } as never,
    });
}

describe('DictionaryDocumentService', () => {
    it('keeps completion available while stop-enqueue disables new authorization', async () => {
        const authorize = vi.fn();
        let putCompleted = false;
        const authorizeCreate = vi.fn(async () => ({
            method: 'PUT' as const,
            requiredHeaders: { 'content-type': 'text/plain' },
            url: 'https://uploads.example.test/exact',
        }));
        const inspectVersions = vi.fn(async () => {
            if (!putCompleted) throw new Error('PUT has not completed.');
            return {
                detectedFormat: 'txt' as const,
                observedVersionId: 'version-after-put',
                versions: [],
            };
        });
        const completeUpload = vi.fn(async () => job);
        const activatedService = createService({ authorizeCreate });
        await expect(
            activatedService.authorizeUpload(
                'token',
                'activated-idempotency-key',
                job.dictionaryId,
                request,
                context,
            ),
        ).resolves.toMatchObject({
            upload: {
                method: 'PUT',
                url: 'https://uploads.example.test/exact',
            },
        });
        putCompleted = true;

        const stopEnqueueService = createService({
            authorizationEnabled: false,
            authorize,
            completeUpload,
            inspectVersions,
        });

        await expect(
            stopEnqueueService.authorizeUpload(
                'token',
                'new-idempotency-key',
                job.dictionaryId,
                request,
                context,
            ),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
        await expect(
            stopEnqueueService.completeUpload(
                'token',
                'f4460b54-b06d-42df-a2a6-548dc6808d31',
                { versionId: 'version-after-put' },
                context,
            ),
        ).resolves.toEqual({ job });

        expect(authorize).not.toHaveBeenCalled();
        expect(inspectVersions).toHaveBeenCalledWith(
            expect.objectContaining({
                requestedVersionId: 'version-after-put',
            }),
        );
        expect(completeUpload).toHaveBeenCalledOnce();
    });

    it('authorizes an exact create-only upload and returns the awaiting job', async () => {
        const authorizeCreate = vi.fn(async () => ({
            method: 'PUT' as const,
            requiredHeaders: { 'content-type': 'text/plain' },
            url: 'https://uploads.example.test/exact',
        }));
        const service = createService({ authorizeCreate });

        await expect(
            service.authorizeUpload(
                'token',
                'document-idempotency-key',
                job.dictionaryId,
                request,
                context,
            ),
        ).resolves.toMatchObject({
            job: { id: job.id, state: 'awaiting-upload' },
            upload: {
                id: 'f4460b54-b06d-42df-a2a6-548dc6808d31',
                method: 'PUT',
            },
        });
        expect(authorizeCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                checksumSha256: request.sha256,
                contentType: 'text/plain',
                sizeBytes: 12,
            }),
        );
    });

    it('never signs an idempotent authorization after capability expiry', async () => {
        const authorizeCreate =
            vi.fn<DictionaryDocumentUploadStorage['authorizeCreate']>();
        const service = createService({
            authorize: vi.fn(async () => ({
                capabilityExpiresAt: new Date(now.getTime() - 1),
                job,
                objectKey: 'dictionary-documents/owner/upload',
                uploadId: 'f4460b54-b06d-42df-a2a6-548dc6808d31',
            })),
            authorizeCreate,
        });

        await expect(
            service.authorizeUpload(
                'token',
                'document-idempotency-key',
                job.dictionaryId,
                request,
                context,
            ),
        ).rejects.toBeInstanceOf(DictionaryDocumentUploadConflictError);
        expect(authorizeCreate).not.toHaveBeenCalled();
    });

    it('rejects image authorization while document OCR is unavailable', async () => {
        const authorizeCreate = vi.fn();
        const service = createService({ authorizeCreate });

        await expect(
            service.authorizeUpload(
                'token',
                'document-idempotency-key',
                job.dictionaryId,
                { ...request, mediaType: 'image/png' },
                context,
            ),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
        expect(authorizeCreate).not.toHaveBeenCalled();
    });

    it('inspects the requested immutable version and forwards the full version list', async () => {
        const versions = [
            {
                checksumSha256: request.sha256,
                contentType: 'text/plain',
                isCurrent: true,
                kind: 'data' as const,
                sizeBytes: 12,
                versionId: 'version-1',
            },
        ];
        const inspectVersions = vi.fn(async () => ({
            detectedFormat: 'txt',
            observedVersionId: 'version-1',
            versions,
        }));
        const completeUpload = vi.fn(async () => job);
        const service = createService({ completeUpload, inspectVersions });

        await service.completeUpload(
            'token',
            'f4460b54-b06d-42df-a2a6-548dc6808d31',
            { versionId: 'version-1' },
            context,
        );

        expect(inspectVersions).toHaveBeenCalledWith({
            expectedChecksumSha256: request.sha256,
            expectedContentType: request.mediaType,
            expectedSizeBytes: request.sizeBytes,
            objectKey: 'dictionary-documents/owner/upload',
            requestedVersionId: 'version-1',
            signal: context.signal,
        });
        expect(completeUpload).toHaveBeenCalledWith(
            expect.objectContaining({
                detectedFormat: 'txt',
                requestedVersionId: 'version-1',
                versions,
            }),
        );
    });

    it('replays exact completed upload without inspecting storage again', async () => {
        const inspectVersions = vi.fn();
        const completeUpload = vi.fn();
        const service = createService({
            completeUpload,
            inspectVersions,
            readUploadAuthorization: vi.fn(async () => ({
                capabilityExpiresAt: new Date(now.getTime() - 1),
                expectedChecksumSha256: request.sha256,
                expectedContentType: request.mediaType,
                expectedSizeBytes: request.sizeBytes,
                job: { ...job, state: 'queued' as const },
                objectKey: 'dictionary-documents/owner/upload',
                processingState: 'quarantined',
                verifiedStorageVersionId: 'version-1',
            })),
        });

        await expect(
            service.completeUpload(
                'token',
                'f4460b54-b06d-42df-a2a6-548dc6808d31',
                { versionId: 'version-1' },
                context,
            ),
        ).resolves.toMatchObject({ job: { state: 'queued' } });
        expect(inspectVersions).not.toHaveBeenCalled();
        expect(completeUpload).not.toHaveBeenCalled();
    });

    it.each([
        ['expired', new Date(now.getTime() + 60_000)],
        ['authorized', now],
    ])(
        'rejects %s authorization before inspecting storage',
        async (processingState, capabilityExpiresAt) => {
            const inspectVersions = vi.fn();
            const service = createService({
                inspectVersions,
                readUploadAuthorization: vi.fn(async () => ({
                    capabilityExpiresAt,
                    expectedChecksumSha256: request.sha256,
                    expectedContentType: request.mediaType,
                    expectedSizeBytes: request.sizeBytes,
                    job,
                    objectKey: 'dictionary-documents/owner/upload',
                    processingState,
                    verifiedStorageVersionId: null,
                })),
            });

            await expect(
                service.completeUpload(
                    'token',
                    'f4460b54-b06d-42df-a2a6-548dc6808d31',
                    { versionId: 'version-1' },
                    context,
                ),
            ).rejects.toBeInstanceOf(DictionaryDocumentUploadConflictError);
            expect(inspectVersions).not.toHaveBeenCalled();
        },
    );

    it.each([
        [
            new DictionaryDocumentUploadInspectionConflictError(),
            DictionaryDocumentUploadConflictError,
        ],
        [
            new DictionaryDocumentUploadInspectionUnavailableError(),
            DictionaryGenerationNotAvailableError,
        ],
    ])('maps typed upload inspection failures', async (failure, expected) => {
        const service = createService({
            inspectVersions: vi.fn(async () => {
                throw failure;
            }),
        });

        await expect(
            service.completeUpload(
                'token',
                'f4460b54-b06d-42df-a2a6-548dc6808d31',
                { versionId: 'version-1' },
                context,
            ),
        ).rejects.toBeInstanceOf(expected);
    });
});
