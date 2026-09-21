import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectVersionsCommand,
    PutObjectCommand,
    type S3Client,
} from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type {
    AudioBytes,
    AudioObjectReference,
    AudioObjectStorage,
} from '../../application/ports/audio-object-storage';
import { assertAudioIntegrity, maximumAudioBytes } from './audio-integrity';

function assertKey(key: string) {
    if (!/^dictionary-audio\/[a-zA-Z0-9/_-]{1,400}$/u.test(key))
        throw new Error('Invalid audio object key.');
}
function assertReference(
    identity: AudioObjectStorage['identity'],
    ref: AudioObjectReference,
) {
    assertKey(ref.key);
    if (
        ref.backend !== identity.backend ||
        ref.namespace !== identity.namespace
    )
        throw new Error('Audio storage identity mismatch.');
}
function missing(error: unknown) {
    return (
        error instanceof Error &&
        ['NoSuchKey', 'NotFound', 'NoSuchVersion'].includes(error.name)
    );
}

export class PostgresAudioObjectStorage implements AudioObjectStorage {
    putForReference(
        reference: AudioObjectReference,
        audio: AudioBytes,
        signal?: AbortSignal,
    ) {
        assertReference(this.identity, reference);
        return this.put(reference.key, audio, signal);
    }
    readonly identity = {
        backend: 'postgres' as const,
        namespace: 'dictionary-audio-v1',
    };
    constructor(
        private readonly database: Pick<PostgresJsDatabase, 'execute'>,
    ) {}
    async put(
        key: string,
        audio: AudioBytes,
        signal?: AbortSignal,
    ): Promise<AudioObjectReference> {
        signal?.throwIfAborted();
        assertKey(key);
        assertAudioIntegrity(audio);
        await this.database.execute(
            sql`insert into dictionary_audio_blobs (namespace, key, bytes, mime_type, checksum) values (${this.identity.namespace}, ${key}, ${Buffer.from(audio.bytes)}, ${audio.mimeType}, ${audio.checksum}) on conflict (namespace,key) do nothing`,
        );
        const ref = { ...this.identity, key };
        const persisted = await this.read(ref, signal);
        if (!persisted || persisted.checksum !== audio.checksum)
            throw new Error(
                'Audio object key already contains different bytes.',
            );
        return ref;
    }
    async read(
        ref: AudioObjectReference,
        signal?: AbortSignal,
    ): Promise<AudioBytes | null> {
        signal?.throwIfAborted();
        assertReference(this.identity, ref);
        const rows = await this.database.execute(
            sql`select bytes, mime_type, checksum from dictionary_audio_blobs where namespace=${ref.namespace} and key=${ref.key} and octet_length(bytes)<=${maximumAudioBytes}`,
        );
        const row = rows[0];
        if (!row) return null;
        const audio = {
            bytes: row.bytes as Uint8Array,
            mimeType: row.mime_type as AudioBytes['mimeType'],
            checksum: row.checksum as string,
        };
        assertAudioIntegrity(audio);
        signal?.throwIfAborted();
        return audio;
    }
    async delete(ref: AudioObjectReference): Promise<void> {
        assertReference(this.identity, ref);
        await this.database.execute(
            sql`delete from dictionary_audio_blobs where namespace=${ref.namespace} and key=${ref.key}`,
        );
        if (await this.read(ref))
            throw new Error('Audio object removal unverified.');
    }
}

/** New writes use the primary; inventory references retain their original storage. */
export class RoutingAudioObjectStorage implements AudioObjectStorage {
    putForReference(
        reference: AudioObjectReference,
        audio: AudioBytes,
        signal?: AbortSignal,
    ) {
        return this.resolve(reference).putForReference(
            reference,
            audio,
            signal,
        );
    }
    readonly identity: AudioObjectStorage['identity'];
    private readonly stores = new Map<string, AudioObjectStorage>();
    constructor(
        private readonly primary: AudioObjectStorage,
        retained: readonly AudioObjectStorage[],
    ) {
        this.identity = primary.identity;
        for (const store of [primary, ...retained]) {
            const id = JSON.stringify(store.identity);
            if (this.stores.has(id))
                throw new Error('Duplicate audio storage identity.');
            this.stores.set(id, store);
        }
    }
    put(key: string, audio: AudioBytes, signal?: AbortSignal) {
        return this.primary.put(key, audio, signal);
    }
    private resolve(reference: AudioObjectReference): AudioObjectStorage {
        const store = this.stores.get(
            JSON.stringify({
                backend: reference.backend,
                namespace: reference.namespace,
            }),
        );
        if (!store)
            throw new Error(
                'Audio storage configuration must be retained until its inventory drains.',
            );
        return store;
    }
    read(reference: AudioObjectReference, signal?: AbortSignal) {
        return this.resolve(reference).read(reference, signal);
    }
    delete(reference: AudioObjectReference) {
        return this.resolve(reference).delete(reference);
    }
}

export class S3AudioObjectStorage implements AudioObjectStorage {
    putForReference(
        reference: AudioObjectReference,
        audio: AudioBytes,
        signal?: AbortSignal,
    ) {
        assertReference(this.identity, reference);
        return this.put(reference.key, audio, signal);
    }
    readonly identity: AudioObjectStorage['identity'];
    constructor(
        private readonly options: {
            client: Pick<S3Client, 'send'>;
            bucket: string;
            namespace?: string;
        },
    ) {
        this.identity = {
            backend: 's3',
            namespace: options.namespace ?? options.bucket,
        };
    }
    private signal(parent?: AbortSignal) {
        return AbortSignal.any([
            AbortSignal.timeout(20000),
            ...(parent ? [parent] : []),
        ]);
    }
    async put(
        key: string,
        audio: AudioBytes,
        parent?: AbortSignal,
    ): Promise<AudioObjectReference> {
        assertKey(key);
        assertAudioIntegrity(audio);
        const result = await this.options.client.send(
            new PutObjectCommand({
                Bucket: this.options.bucket,
                Key: key,
                Body: audio.bytes,
                ContentType: audio.mimeType,
                ContentLength: audio.bytes.length,
                Metadata: { sha256: audio.checksum },
                ChecksumSHA256: Buffer.from(audio.checksum, 'hex').toString(
                    'base64',
                ),
            }),
            { abortSignal: this.signal(parent) },
        );
        return {
            ...this.identity,
            key,
            ...(result.VersionId ? { versionId: result.VersionId } : {}),
        };
    }
    async read(
        ref: AudioObjectReference,
        parent?: AbortSignal,
    ): Promise<AudioBytes | null> {
        assertReference(this.identity, ref);
        const signal = this.signal(parent);
        try {
            const result = await this.options.client.send(
                new GetObjectCommand({
                    Bucket: this.options.bucket,
                    Key: ref.key,
                    ...(ref.versionId ? { VersionId: ref.versionId } : {}),
                }),
                { abortSignal: signal },
            );
            if (
                !result.Body ||
                !result.ContentLength ||
                result.ContentLength > maximumAudioBytes ||
                !['audio/wav', 'audio/mpeg'].includes(result.ContentType ?? '')
            )
                throw new Error('Invalid audio object metadata.');
            const chunks: Uint8Array[] = [];
            let size = 0;
            for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
                signal.throwIfAborted();
                size += chunk.length;
                if (size > maximumAudioBytes)
                    throw new Error('Audio object exceeds limit.');
                chunks.push(chunk);
            }
            if (size !== result.ContentLength)
                throw new Error('Incomplete audio object.');
            const audio = {
                bytes: Buffer.concat(chunks),
                mimeType: result.ContentType as AudioBytes['mimeType'],
                checksum: result.Metadata?.sha256 ?? '',
            };
            assertAudioIntegrity(audio);
            return audio;
        } catch (error) {
            if (missing(error)) return null;
            throw error;
        }
    }
    private async versions(key: string, signal: AbortSignal) {
        const versions: string[] = [];
        let keyMarker: string | undefined;
        let versionMarker: string | undefined;
        for (let pageNumber = 0; pageNumber < 32; pageNumber++) {
            const page = await this.options.client.send(
                new ListObjectVersionsCommand({
                    Bucket: this.options.bucket,
                    Prefix: key,
                    KeyMarker: keyMarker,
                    VersionIdMarker: versionMarker,
                }),
                { abortSignal: signal },
            );
            for (const entry of [
                ...(page.Versions ?? []),
                ...(page.DeleteMarkers ?? []),
            ])
                if (entry.Key === key) {
                    if (!entry.VersionId)
                        throw new Error('Missing object version.');
                    versions.push(entry.VersionId);
                }
            if (versions.length > 2048)
                throw new Error('Too many audio object versions.');
            if (!page.IsTruncated) return versions;
            if (
                !page.NextKeyMarker ||
                (page.NextKeyMarker === keyMarker &&
                    page.NextVersionIdMarker === versionMarker)
            )
                throw new Error('Invalid storage version cursor.');
            keyMarker = page.NextKeyMarker;
            versionMarker = page.NextVersionIdMarker;
        }
        throw new Error('Audio object version listing limit exceeded.');
    }
    async delete(ref: AudioObjectReference): Promise<void> {
        assertReference(this.identity, ref);
        const signal = this.signal();
        const versions = await this.versions(ref.key, signal);
        for (const version of versions)
            await this.options.client.send(
                new DeleteObjectCommand({
                    Bucket: this.options.bucket,
                    Key: ref.key,
                    VersionId: version,
                }),
                { abortSignal: signal },
            );
        // Unversioned buckets may return no listing entry for an existing key.
        if (!versions.length)
            await this.options.client.send(
                new DeleteObjectCommand({
                    Bucket: this.options.bucket,
                    Key: ref.key,
                }),
                { abortSignal: signal },
            );
        // A versioned missing-key DELETE creates a marker: remove it as well.
        const remaining = await this.versions(ref.key, signal);
        for (const version of remaining)
            await this.options.client.send(
                new DeleteObjectCommand({
                    Bucket: this.options.bucket,
                    Key: ref.key,
                    VersionId: version,
                }),
                { abortSignal: signal },
            );
        if ((await this.versions(ref.key, signal)).length)
            throw new Error('Audio versions remain after removal.');
        try {
            await this.options.client.send(
                new HeadObjectCommand({
                    Bucket: this.options.bucket,
                    Key: ref.key,
                }),
                { abortSignal: signal },
            );
        } catch (error) {
            if (missing(error)) return;
            throw error;
        }
        throw new Error('Audio object removal unverified.');
    }
}
