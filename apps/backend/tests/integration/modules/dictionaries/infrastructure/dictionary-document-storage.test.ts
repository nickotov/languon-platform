import { createHash, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createDictionaryDocumentS3Client } from '../../../../../src/modules/dictionaries/infrastructure/document/s3-document-client';
import {
    S3DictionaryDocumentUploadStorage,
    S3PrivateDocumentStorage,
} from '../../../../../src/modules/dictionaries/infrastructure/document/s3-dictionary-document-storage';

const enabled = process.env.ALLOW_DISPOSABLE_DOCUMENT_SERVICES === 'true';
const endpoint = process.env.DOCUMENT_TEST_S3_ENDPOINT ?? '';
const bucket = process.env.DOCUMENT_TEST_BUCKET ?? 'languon-document-test';
const apiAccessKeyId = process.env.DOCUMENT_TEST_API_ACCESS_KEY ?? '';
const apiSecretAccessKey = process.env.DOCUMENT_TEST_API_SECRET_KEY ?? '';
const workerAccessKeyId = process.env.DOCUMENT_TEST_WORKER_ACCESS_KEY ?? '';
const workerSecretAccessKey = process.env.DOCUMENT_TEST_WORKER_SECRET_KEY ?? '';

function assertDisposable(): void {
    const url = new URL(endpoint);
    if (
        !enabled ||
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        !bucket.includes('test') ||
        apiAccessKeyId.length === 0 ||
        apiSecretAccessKey.length < 16 ||
        workerAccessKeyId.length === 0 ||
        workerSecretAccessKey.length < 16 ||
        apiAccessKeyId === workerAccessKeyId
    )
        throw new Error('Disposable document storage guard is not satisfied.');
}

describe.skipIf(!enabled)('S3 document storage conformance', () => {
    it('enforces create-only exact uploads, immutable reads, privacy and tombstone cleanup', async () => {
        assertDisposable();
        const apiClient = createDictionaryDocumentS3Client({
            accessKeyId: apiAccessKeyId,
            bucket,
            endpoint,
            forcePathStyle: true,
            region: 'us-east-1',
            secretAccessKey: apiSecretAccessKey,
        });
        const workerClient = createDictionaryDocumentS3Client({
            accessKeyId: workerAccessKeyId,
            bucket,
            endpoint,
            forcePathStyle: true,
            region: 'us-east-1',
            secretAccessKey: workerSecretAccessKey,
        });
        const uploadStorage = new S3DictionaryDocumentUploadStorage({
            bucket,
            client: apiClient,
        });
        const privateStorage = new S3PrivateDocumentStorage({
            bucket,
            client: workerClient,
        });
        const content = Buffer.from('bank\ncanvas', 'utf8');
        const checksumSha256 = createHash('sha256')
            .update(content)
            .digest('hex');
        const objectKey = `dictionary-documents/test-owner/${randomUUID()}`;
        try {
            const capability = await uploadStorage.authorizeCreate({
                checksumSha256,
                contentType: 'text/plain',
                expiresAt: new Date(Date.now() + 10 * 60_000),
                objectKey,
                signal: new AbortController().signal,
                sizeBytes: content.byteLength,
            });
            const wrongContentType = await fetch(capability.url, {
                body: content,
                headers: {
                    ...capability.requiredHeaders,
                    'content-type': 'text/markdown',
                },
                method: capability.method,
            });
            expect(wrongContentType.status).toBe(403);
            const [first, replay] = await Promise.all([
                fetch(capability.url, {
                    body: content,
                    headers: capability.requiredHeaders,
                    method: capability.method,
                }),
                fetch(capability.url, {
                    body: content,
                    headers: capability.requiredHeaders,
                    method: capability.method,
                }),
            ]);
            const successful = [first, replay].filter(
                (response) => response.ok,
            );
            expect(successful).toHaveLength(1);
            expect([first.status, replay.status].sort()).toEqual([200, 412]);
            const versionId = successful[0]!.headers.get('x-amz-version-id');
            expect(versionId).toBeTruthy();

            const observation = await uploadStorage.inspectVersions({
                expectedChecksumSha256: checksumSha256,
                expectedContentType: 'text/plain',
                expectedSizeBytes: content.byteLength,
                objectKey,
                requestedVersionId: versionId!,
                signal: new AbortController().signal,
            });
            expect(observation).toMatchObject({
                detectedFormat: 'txt',
                versions: [
                    {
                        checksumSha256,
                        contentType: 'text/plain',
                        isCurrent: true,
                        kind: 'data',
                        sizeBytes: content.byteLength,
                        versionId,
                    },
                ],
            });

            const opened = await privateStorage.openExact(
                {
                    checksumSha256,
                    contentType: 'text/plain',
                    objectKey,
                    sizeBytes: content.byteLength,
                    storageVersionId: versionId!,
                    uploadId: '00000000-0000-4000-8000-000000000001',
                },
                new AbortController().signal,
            );
            const chunks: Uint8Array[] = [];
            for await (const chunk of opened.content) chunks.push(chunk);
            expect(Buffer.concat(chunks)).toEqual(content);
            expect(opened.reference).toMatchObject({
                checksumSha256,
                storageVersionId: versionId,
            });

            const publicRead = await fetch(
                `${endpoint}/${bucket}/${encodeURIComponent(objectKey)}`,
            );
            expect(publicRead.ok).toBe(false);

            const tombstone = await privateStorage.putTombstone({
                objectKey,
                signal: new AbortController().signal,
            });
            const lateReplay = await fetch(capability.url, {
                body: content,
                headers: capability.requiredHeaders,
                method: capability.method,
            });
            expect(lateReplay.status).toBe(412);
            const versions = await privateStorage.listVersions({
                objectKey,
                signal: new AbortController().signal,
            });
            for (const version of versions)
                if (version.kind === 'data')
                    await privateStorage.deleteVersion({
                        objectKey,
                        signal: new AbortController().signal,
                        versionId: version.versionId,
                    });
            expect(
                await privateStorage.listVersions({
                    objectKey,
                    signal: new AbortController().signal,
                }),
            ).toEqual([
                expect.objectContaining({
                    isCurrent: true,
                    kind: 'tombstone',
                    versionId: tombstone.versionId,
                }),
            ]);
            await privateStorage.deleteTombstone({
                objectKey,
                signal: new AbortController().signal,
                versionId: tombstone.versionId,
            });
            expect(
                await privateStorage.listVersions({
                    objectKey,
                    signal: new AbortController().signal,
                }),
            ).toEqual([]);
        } finally {
            apiClient.destroy();
            workerClient.destroy();
        }
    });
});
