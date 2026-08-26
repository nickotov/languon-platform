import { createHash } from 'node:crypto';

import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import {
    DictionaryDocumentUploadInspectionConflictError,
    DictionaryDocumentUploadInspectionUnavailableError,
} from '../../../../../../src/modules/dictionaries/application/ports/dictionary-document-upload-storage';
import {
    reconcileUploadedDocumentVersion,
    S3DictionaryDocumentUploadStorage,
    S3PrivateDocumentStorage,
} from '../../../../../../src/modules/dictionaries/infrastructure/document/s3-dictionary-document-storage';

const objectKey = 'dictionary-documents/owner/upload';
const bytes = Buffer.from('bank', 'utf8');
const checksumSha256 = createHash('sha256').update(bytes).digest('hex');
const checksumBase64 = Buffer.from(checksumSha256, 'hex').toString('base64');

function inspectionClient(
    content: Uint8Array,
    reportedSize = bytes.byteLength,
    listGate?: Promise<void>,
) {
    return {
        send: vi.fn(async (command: object) => {
            switch (command.constructor.name) {
                case 'ListObjectVersionsCommand':
                    await listGate;
                    return {
                        IsTruncated: false,
                        Versions: [
                            {
                                IsLatest: true,
                                Key: objectKey,
                                Size: reportedSize,
                                VersionId: 'version-1',
                            },
                        ],
                    };
                case 'HeadObjectCommand':
                    return {
                        ChecksumSHA256: checksumBase64,
                        ContentLength: reportedSize,
                        ContentType: 'text/plain',
                    };
                case 'GetObjectCommand':
                    return {
                        Body: {
                            async *[Symbol.asyncIterator]() {
                                yield content;
                            },
                        },
                        ContentLength: Math.min(reportedSize, 8 * 1_024),
                        ContentRange: `bytes 0-${Math.min(reportedSize, 8 * 1_024) - 1}/${reportedSize}`,
                    };
                default:
                    throw new Error('Unexpected S3 command.');
            }
        }),
    } as unknown as S3Client;
}

function inspect(storage: S3DictionaryDocumentUploadStorage) {
    return storage.inspectVersions({
        expectedChecksumSha256: checksumSha256,
        expectedContentType: 'text/plain',
        expectedSizeBytes: bytes.byteLength,
        objectKey,
        signal: new AbortController().signal,
    });
}

describe('S3 dictionary document storage', () => {
    it('probes private version-list access without reading document bytes', async () => {
        const send = vi.fn<(command: object) => Promise<object>>(async () => ({
            IsTruncated: false,
        }));
        const storage = new S3PrivateDocumentStorage({
            bucket: 'document-test',
            client: { send } as unknown as S3Client,
        });

        await storage.readiness(new AbortController().signal);

        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0]?.[0].constructor.name).toBe(
            'ListObjectVersionsCommand',
        );
        expect(send.mock.calls[0]?.[0]).toMatchObject({
            input: {
                Bucket: 'document-test',
                MaxKeys: 1,
                Prefix: 'dictionary-documents/readiness/',
            },
        });
    });

    it('binds Content-Type and immutable headers into the PUT signature', async () => {
        const client = new S3Client({
            credentials: {
                accessKeyId: 'test-access-key',
                secretAccessKey: 'test-secret-key-value',
            },
            endpoint: 'https://storage.example.test',
            forcePathStyle: true,
            region: 'us-east-1',
        });
        try {
            const capability = await new S3DictionaryDocumentUploadStorage({
                bucket: 'document-test',
                client,
            }).authorizeCreate({
                checksumSha256,
                contentType: 'text/plain',
                expiresAt: new Date(Date.now() + 60_000),
                objectKey,
                signal: new AbortController().signal,
                sizeBytes: bytes.byteLength,
            });
            const signedHeaders = new URL(capability.url).searchParams.get(
                'X-Amz-SignedHeaders',
            );
            expect(signedHeaders?.split(';')).toEqual(
                expect.arrayContaining([
                    'content-type',
                    'host',
                    'if-none-match',
                    'x-amz-checksum-sha256',
                ]),
            );
        } finally {
            client.destroy();
        }
    });

    it('reconciles a lost version hint only to one current exact version', () => {
        const version = {
            checksumSha256,
            contentType: 'text/plain',
            isCurrent: true,
            kind: 'data' as const,
            sizeBytes: bytes.byteLength,
            versionId: 'version-1',
        };
        expect(
            reconcileUploadedDocumentVersion({
                expectedChecksumSha256: checksumSha256,
                expectedContentType: 'text/plain',
                expectedSizeBytes: bytes.byteLength,
                versions: [version],
            }),
        ).toBe(version);
        expect(() =>
            reconcileUploadedDocumentVersion({
                expectedChecksumSha256: checksumSha256,
                expectedContentType: 'text/markdown',
                expectedSizeBytes: bytes.byteLength,
                versions: [version],
            }),
        ).toThrow(DictionaryDocumentUploadInspectionConflictError);
    });

    it('reads only one exact bounded range and rejects short or overlong range bodies', async () => {
        const client = inspectionClient(bytes);
        await expect(
            inspect(
                new S3DictionaryDocumentUploadStorage({
                    bucket: 'document-test',
                    client,
                }),
            ),
        ).resolves.toMatchObject({ detectedFormat: 'txt' });
        expect(
            vi
                .mocked(client.send)
                .mock.calls.find(
                    ([command]) =>
                        command.constructor.name === 'GetObjectCommand',
                )?.[0],
        ).toMatchObject({ input: { Range: 'bytes=0-3' } });

        for (const content of [Buffer.from('ban'), Buffer.from('banks')])
            await expect(
                inspect(
                    new S3DictionaryDocumentUploadStorage({
                        bucket: 'document-test',
                        client: inspectionClient(content),
                    }),
                ),
            ).rejects.toBeInstanceOf(
                DictionaryDocumentUploadInspectionUnavailableError,
            );

        await expect(
            inspect(
                new S3DictionaryDocumentUploadStorage({
                    bucket: 'document-test',
                    client: inspectionClient(
                        Uint8Array.from([0xc3, 0x28, 0x20, 0x20]),
                    ),
                }),
            ),
        ).resolves.toMatchObject({ detectedFormat: 'txt' });
    });

    it('fails fast instead of queuing unbounded concurrent inspections', async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const client = inspectionClient(bytes, bytes.byteLength, gate);
        const storage = new S3DictionaryDocumentUploadStorage({
            bucket: 'document-test',
            client,
        });
        const active = Array.from({ length: 8 }, () => inspect(storage));
        await vi.waitFor(() => expect(client.send).toHaveBeenCalledTimes(8));

        await expect(inspect(storage)).rejects.toBeInstanceOf(
            DictionaryDocumentUploadInspectionUnavailableError,
        );
        release();
        await expect(Promise.all(active)).resolves.toHaveLength(8);
    });
});
