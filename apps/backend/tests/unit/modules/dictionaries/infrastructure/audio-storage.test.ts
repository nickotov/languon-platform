import { Readable } from 'node:stream';
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectVersionsCommand,
    PutObjectCommand,
    type S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { createFixtureAudio } from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-integrity';
import {
    S3AudioObjectStorage,
    RoutingAudioObjectStorage,
} from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-object-storages';

function fakeVersionedS3() {
    const versions = new Map<
        string,
        { key: string; body: Uint8Array; checksum: string; mime: string }
    >();
    let id = 0;
    const send = async (command: unknown) => {
        if (command instanceof PutObjectCommand) {
            const version = String(++id);
            versions.set(version, {
                key: command.input.Key!,
                body: command.input.Body as Uint8Array,
                checksum: command.input.Metadata!.sha256!,
                mime: command.input.ContentType!,
            });
            return { VersionId: version };
        }
        if (command instanceof ListObjectVersionsCommand)
            return {
                Versions: [...versions].map(([VersionId, row]) => ({
                    Key: row.key,
                    VersionId,
                })),
            };
        if (command instanceof DeleteObjectCommand) {
            if (command.input.VersionId)
                versions.delete(command.input.VersionId);
            return {};
        }
        if (
            command instanceof GetObjectCommand ||
            command instanceof HeadObjectCommand
        ) {
            const row = command.input.VersionId
                ? versions.get(command.input.VersionId)
                : [...versions.values()].find(
                      (r) => r.key === command.input.Key,
                  );
            if (!row) {
                const error = new Error('Missing');
                error.name = 'NoSuchKey';
                throw error;
            }
            return {
                Body: Readable.from([row.body]),
                ContentLength: row.body.length,
                ContentType: row.mime,
                Metadata: { sha256: row.checksum },
            };
        }
        throw new Error('Unexpected command');
    };
    return { client: { send } as unknown as Pick<S3Client, 'send'>, versions };
}

describe('S3 audio storage contract', () => {
    it('routes retained namespace reads and deletes while writing only to the new primary', async () => {
        const oldFake = fakeVersionedS3();
        const newFake = fakeVersionedS3();
        const oldStore = new S3AudioObjectStorage({
            client: oldFake.client,
            bucket: 'old-bucket',
        });
        const newStore = new S3AudioObjectStorage({
            client: newFake.client,
            bucket: 'new-bucket',
        });
        const oldRef = await oldStore.put(
            'dictionary-audio/old',
            createFixtureAudio(),
        );
        const storage = new RoutingAudioObjectStorage(newStore, [oldStore]);
        expect(await storage.read(oldRef)).toEqual(createFixtureAudio());
        const newRef = await storage.put(
            'dictionary-audio/new',
            createFixtureAudio(),
        );
        expect(newRef.namespace).toBe('new-bucket');
        const pendingOld = await storage.putForReference(
            { ...oldRef, key: 'dictionary-audio/pending-old' },
            createFixtureAudio(),
        );
        expect(pendingOld.namespace).toBe('old-bucket');
        expect(await storage.read(pendingOld)).toEqual(createFixtureAudio());
        await storage.delete(pendingOld);
        expect(oldFake.versions.size).toBe(1);
        await storage.delete(oldRef);
        expect(oldFake.versions.size).toBe(0);
        expect(await storage.read(newRef)).toEqual(createFixtureAudio());
        expect(() =>
            storage.delete({ ...oldRef, namespace: 'unconfigured' }),
        ).toThrow('retained');
    });
    it('round trips exact version with checksum and removes all versions without prefix-neighbor deletion', async () => {
        const fake = fakeVersionedS3();
        const storage = new S3AudioObjectStorage({
            client: fake.client,
            bucket: 'audio',
        });
        const key = 'dictionary-audio/owner/asset';
        const audio = createFixtureAudio();
        const first = await storage.put(key, audio);
        await storage.put(key, audio);
        const neighbor = await storage.put(`${key}-other`, audio);
        expect(await storage.read(first)).toEqual(audio);
        await storage.delete(first);
        expect(await storage.read(first)).toBeNull();
        expect(await storage.read(neighbor)).toEqual(audio);
        expect(fake.versions.size).toBe(1);
    });
    it('rejects corrupt returned bytes and cross-storage references', async () => {
        const fake = fakeVersionedS3();
        const storage = new S3AudioObjectStorage({
            client: fake.client,
            bucket: 'audio',
        });
        const ref = await storage.put(
            'dictionary-audio/asset',
            createFixtureAudio(),
        );
        fake.versions.get(ref.versionId!)!.body = Buffer.from('corrupt');
        await expect(storage.read(ref)).rejects.toThrow('integrity');
        await expect(
            storage.delete({ ...ref, namespace: 'other' }),
        ).rejects.toThrow('identity');
    });
    it('does not report purge success when deletion leaves a physical version', async () => {
        const fake = fakeVersionedS3();
        const send = fake.client.send.bind(fake.client);
        const client = {
            send: (command: unknown) =>
                command instanceof DeleteObjectCommand
                    ? Promise.resolve({})
                    : send(command as never),
        } as unknown as Pick<S3Client, 'send'>;
        const storage = new S3AudioObjectStorage({ client, bucket: 'audio' });
        const ref = await storage.put(
            'dictionary-audio/asset',
            createFixtureAudio(),
        );
        await expect(storage.delete(ref)).rejects.toThrow('versions remain');
    });
});
