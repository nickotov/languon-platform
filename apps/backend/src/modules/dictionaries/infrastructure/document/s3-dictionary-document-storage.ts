import { createHash } from 'node:crypto';

import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectVersionsCommand,
    PutObjectCommand,
    type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fileTypeFromBuffer } from 'file-type';

import type {
    DictionaryDocumentObjectVersion,
    DictionaryDocumentUploadStorage,
} from '../../application/ports/dictionary-document-upload-storage';
import {
    DictionaryDocumentUploadInspectionConflictError,
    DictionaryDocumentUploadInspectionUnavailableError,
} from '../../application/ports/dictionary-document-upload-storage';
import type {
    DictionaryDocumentObjectReference,
    PrivateDocumentStorage,
} from '../../application/ports/private-document-storage';
import { documentIngestionLimitsV1 } from '../../domain/document-ingestion';

const tombstoneMetadataKey = 'languon-document-tombstone';
const maximumListedVersions = 2_048;
const maximumConcurrentInspections = 8;
const maximumMagicPrefixBytes = 8 * 1_024;
const emptySha256 = createHash('sha256').update('').digest('hex');

export interface S3DictionaryDocumentStorageOptions {
    bucket: string;
    client: S3Client;
}

function checksumHex(value: string | undefined): string {
    if (!value) return '';
    const bytes = Buffer.from(value, 'base64');
    return bytes.byteLength === 32 ? bytes.toString('hex') : '';
}

function checksumBase64(value: string): string {
    return Buffer.from(value, 'hex').toString('base64');
}

function bodyIterable(body: unknown): AsyncIterable<Uint8Array> {
    if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body))
        throw new Error('S3 returned a non-streaming document body.');
    return body as AsyncIterable<Uint8Array>;
}

async function detectFormat(
    client: S3Client,
    bucket: string,
    objectKey: string,
    versionId: string,
    contentType: string,
    sizeBytes: number,
    signal: AbortSignal,
): Promise<string> {
    if (
        sizeBytes < 1 ||
        sizeBytes > documentIngestionLimitsV1.upload.maximumFileBytes
    )
        throw new Error('S3 document exceeds the completion inspection bound.');
    const expectedPrefixBytes = Math.min(sizeBytes, maximumMagicPrefixBytes);
    const response = await client.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Range: `bytes=0-${expectedPrefixBytes - 1}`,
            VersionId: versionId,
        }),
        { abortSignal: signal },
    );
    if (
        response.ContentLength !== expectedPrefixBytes ||
        response.ContentRange !==
            `bytes 0-${expectedPrefixBytes - 1}/${sizeBytes}`
    )
        throw new Error('S3 returned invalid range metadata.');
    const content = bodyIterable(response.Body);
    const prefixChunks: Uint8Array[] = [];
    let prefixLength = 0;
    for await (const chunk of content) {
        signal.throwIfAborted();
        prefixLength += chunk.byteLength;
        if (prefixLength > expectedPrefixBytes)
            throw new Error('S3 document range exceeds its inspection bound.');
        prefixChunks.push(chunk);
    }
    if (prefixLength !== expectedPrefixBytes)
        throw new Error('S3 returned an incomplete document range.');
    const fileType = await fileTypeFromBuffer(
        Buffer.concat(prefixChunks, prefixLength),
    );
    if (fileType?.mime === 'application/pdf') return 'pdf';
    if (fileType?.mime === 'image/jpeg') return 'jpeg';
    if (fileType?.mime === 'image/png') return 'png';
    if (fileType?.mime === 'image/webp') return 'webp';
    if (
        fileType?.mime === 'application/zip' &&
        contentType ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
        return 'docx';
    if (fileType) return `unsupported:${fileType.mime}`;
    if (contentType === 'text/plain' || contentType === 'text/markdown') {
        return contentType === 'text/markdown' ? 'markdown' : 'txt';
    }
    return 'unsupported:unknown';
}

export function reconcileUploadedDocumentVersion(input: {
    expectedChecksumSha256: string;
    expectedContentType: string;
    expectedSizeBytes: number;
    requestedVersionId?: string | undefined;
    versions: DictionaryDocumentObjectVersion[];
}): DictionaryDocumentObjectVersion {
    const candidates = input.versions.filter(
        (version) =>
            version.kind === 'data' &&
            version.isCurrent &&
            version.checksumSha256 === input.expectedChecksumSha256 &&
            version.contentType === input.expectedContentType &&
            version.sizeBytes === input.expectedSizeBytes &&
            (!input.requestedVersionId ||
                version.versionId === input.requestedVersionId),
    );
    if (candidates.length !== 1)
        throw new DictionaryDocumentUploadInspectionConflictError();
    return candidates[0]!;
}

async function listPhysicalVersions(
    options: S3DictionaryDocumentStorageOptions,
    objectKey: string,
    signal: AbortSignal,
): Promise<DictionaryDocumentObjectVersion[]> {
    const versions: DictionaryDocumentObjectVersion[] = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
        const page = await options.client.send(
            new ListObjectVersionsCommand({
                Bucket: options.bucket,
                KeyMarker: keyMarker,
                Prefix: objectKey,
                VersionIdMarker: versionIdMarker,
            }),
            { abortSignal: signal },
        );
        const exactVersions = (page.Versions ?? []).filter(
            (version) => version.Key === objectKey,
        );
        for (const version of exactVersions) {
            if (!version.VersionId) throw new Error('S3 omitted a version ID.');
            const head = await options.client.send(
                new HeadObjectCommand({
                    Bucket: options.bucket,
                    ChecksumMode: 'ENABLED',
                    Key: objectKey,
                    VersionId: version.VersionId,
                }),
                { abortSignal: signal },
            );
            versions.push({
                checksumSha256: checksumHex(head.ChecksumSHA256),
                ...(head.ContentType ? { contentType: head.ContentType } : {}),
                isCurrent: version.IsLatest === true,
                kind:
                    head.Metadata?.[tombstoneMetadataKey] === 'v1'
                        ? 'tombstone'
                        : 'data',
                sizeBytes: head.ContentLength ?? Number(version.Size ?? 0),
                versionId: version.VersionId,
            });
        }
        for (const marker of page.DeleteMarkers ?? []) {
            if (marker.Key !== objectKey || !marker.VersionId) continue;
            versions.push({
                checksumSha256: '0'.repeat(64),
                isCurrent: marker.IsLatest === true,
                kind: 'tombstone',
                sizeBytes: 0,
                versionId: marker.VersionId,
            });
        }
        if (versions.length > maximumListedVersions)
            throw new Error('S3 document has too many physical versions.');
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        versionIdMarker = page.IsTruncated
            ? page.NextVersionIdMarker
            : undefined;
        if (page.IsTruncated && (!keyMarker || !versionIdMarker))
            throw new Error('S3 returned an invalid version cursor.');
    } while (keyMarker && versionIdMarker);
    return versions;
}

export class S3DictionaryDocumentUploadStorage implements DictionaryDocumentUploadStorage {
    private activeInspections = 0;

    public constructor(
        private readonly options: S3DictionaryDocumentStorageOptions,
    ) {}

    public async authorizeCreate(
        input: Parameters<
            DictionaryDocumentUploadStorage['authorizeCreate']
        >[0],
    ) {
        input.signal.throwIfAborted();
        const remainingLifetimeMs = input.expiresAt.getTime() - Date.now();
        const expiresIn = Math.min(
            600,
            Math.floor(remainingLifetimeMs / 1_000),
        );
        if (expiresIn < 1)
            throw new Error(
                'Document upload capability expired before signing.',
            );
        const checksum = checksumBase64(input.checksumSha256);
        const command = new PutObjectCommand({
            Bucket: this.options.bucket,
            ChecksumSHA256: checksum,
            ContentLength: input.sizeBytes,
            ContentType: input.contentType,
            IfNoneMatch: '*',
            Key: input.objectKey,
        });
        const url = await getSignedUrl(this.options.client, command, {
            expiresIn,
            signableHeaders: new Set(['content-type', 'if-none-match']),
            unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
        });
        input.signal.throwIfAborted();
        return {
            method: 'PUT' as const,
            requiredHeaders: {
                'content-type': input.contentType,
                'if-none-match': '*',
                'x-amz-checksum-sha256': checksum,
            },
            url,
        };
    }

    public async inspectVersions(
        input: Parameters<
            DictionaryDocumentUploadStorage['inspectVersions']
        >[0],
    ) {
        input.signal.throwIfAborted();
        if (this.activeInspections >= maximumConcurrentInspections)
            throw new DictionaryDocumentUploadInspectionUnavailableError();
        this.activeInspections += 1;
        try {
            const versions = await listPhysicalVersions(
                this.options,
                input.objectKey,
                input.signal,
            );
            const requested = reconcileUploadedDocumentVersion({
                expectedChecksumSha256: input.expectedChecksumSha256,
                expectedContentType: input.expectedContentType,
                expectedSizeBytes: input.expectedSizeBytes,
                ...(input.requestedVersionId
                    ? { requestedVersionId: input.requestedVersionId }
                    : {}),
                versions,
            });
            return {
                detectedFormat: await detectFormat(
                    this.options.client,
                    this.options.bucket,
                    input.objectKey,
                    requested.versionId,
                    requested.contentType!,
                    requested.sizeBytes,
                    input.signal,
                ),
                observedVersionId: requested.versionId,
                versions,
            };
        } catch (error) {
            if (
                error instanceof DictionaryDocumentUploadInspectionConflictError
            )
                throw error;
            input.signal.throwIfAborted();
            throw new DictionaryDocumentUploadInspectionUnavailableError();
        } finally {
            this.activeInspections -= 1;
        }
    }
}

export class S3PrivateDocumentStorage implements PrivateDocumentStorage {
    public constructor(
        private readonly options: S3DictionaryDocumentStorageOptions,
    ) {}

    public async readiness(signal: AbortSignal): Promise<void> {
        await this.options.client.send(
            new ListObjectVersionsCommand({
                Bucket: this.options.bucket,
                MaxKeys: 1,
                Prefix: 'dictionary-documents/readiness/',
            }),
            { abortSignal: signal },
        );
    }

    public async openExact(
        reference: DictionaryDocumentObjectReference,
        signal: AbortSignal,
    ) {
        const response = await this.options.client.send(
            new GetObjectCommand({
                Bucket: this.options.bucket,
                ChecksumMode: 'ENABLED',
                Key: reference.objectKey,
                VersionId: reference.storageVersionId,
            }),
            { abortSignal: signal },
        );
        return {
            content: bodyIterable(response.Body),
            reference: {
                ...reference,
                checksumSha256: checksumHex(response.ChecksumSHA256),
                contentType:
                    response.ContentType as typeof reference.contentType,
                sizeBytes: response.ContentLength ?? -1,
                storageVersionId: response.VersionId ?? '',
            },
        };
    }

    public async putTombstone(input: {
        objectKey: string;
        signal: AbortSignal;
    }) {
        const response = await this.options.client.send(
            new PutObjectCommand({
                Body: new Uint8Array(),
                Bucket: this.options.bucket,
                ChecksumSHA256: checksumBase64(emptySha256),
                ContentLength: 0,
                ContentType: 'application/octet-stream',
                Key: input.objectKey,
                Metadata: { [tombstoneMetadataKey]: 'v1' },
            }),
            { abortSignal: input.signal },
        );
        if (!response.VersionId)
            throw new Error('S3 omitted the tombstone version ID.');
        return {
            checksumSha256: emptySha256,
            contentType: 'application/octet-stream',
            isCurrent: true,
            kind: 'tombstone' as const,
            sizeBytes: 0,
            versionId: response.VersionId,
        };
    }

    public async listVersions(input: {
        objectKey: string;
        signal: AbortSignal;
    }) {
        return listPhysicalVersions(
            this.options,
            input.objectKey,
            input.signal,
        );
    }

    public async deleteVersion(input: {
        objectKey: string;
        signal: AbortSignal;
        versionId: string;
    }): Promise<void> {
        await this.delete(input);
    }

    public async deleteTombstone(input: {
        objectKey: string;
        signal: AbortSignal;
        versionId: string;
    }): Promise<void> {
        await this.delete(input);
    }

    private async delete(input: {
        objectKey: string;
        signal: AbortSignal;
        versionId: string;
    }): Promise<void> {
        await this.options.client.send(
            new DeleteObjectCommand({
                Bucket: this.options.bucket,
                Key: input.objectKey,
                VersionId: input.versionId,
            }),
            { abortSignal: input.signal },
        );
    }
}
