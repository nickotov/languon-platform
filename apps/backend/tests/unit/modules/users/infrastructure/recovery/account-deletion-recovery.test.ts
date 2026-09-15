import { Buffer } from 'node:buffer';

import { ListObjectVersionsCommand, PutObjectCommand, type GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { runAccountDeletionRecoveryGate, type RecoveryStore } from '../../../../../../src/modules/users/infrastructure/recovery/account-deletion-recovery-gate';
import { decryptJournalEvent, encryptJournalEvent } from '../../../../../../src/modules/users/infrastructure/recovery/account-deletion-journal-codec';
import { InMemoryAccountDeletionRecoveryJournal } from '../../../../../../src/modules/users/infrastructure/recovery/in-memory-account-deletion-recovery-journal';
import { S3AccountDeletionRecoveryReader } from '../../../../../../src/modules/users/infrastructure/recovery/s3-account-deletion-recovery-reader';
import { S3AccountDeletionRecoveryJournal } from '../../../../../../src/modules/users/infrastructure/recovery/s3-account-deletion-recovery-journal';

const key = Buffer.alloc(32, 7);
const userId = '01994b76-943c-7c04-aa71-883389879861';
const scheduledAt = new Date('2026-09-15T09:00:00.000Z');

class FakeObjectStore {
    public readonly objects = new Map<string, Uint8Array>();
    public readonly calls: string[] = [];
    public readonly deleteMarkers: string[] = [];

    public async send(command: PutObjectCommand | GetObjectCommand | ListObjectVersionsCommand): Promise<unknown> {
        if (command instanceof PutObjectCommand) {
            const objectKey = command.input.Key!;
            this.calls.push('put');
            if (this.objects.has(objectKey)) throw { $metadata: { httpStatusCode: 412 } };
            this.objects.set(objectKey, command.input.Body as Uint8Array);
            return {};
        }
        if (command instanceof ListObjectVersionsCommand) {
            this.calls.push('list');
            return {
                Versions: [...this.objects.keys()].filter((objectKey) => objectKey.startsWith(command.input.Prefix!)).map((Key) => ({ Key, VersionId: 'v1' })),
                DeleteMarkers: this.deleteMarkers.filter((Key) => Key.startsWith(command.input.Prefix!)).map((Key) => ({ Key, VersionId: 'v2' })),
            };
        }
        this.calls.push('get');
        const body = this.objects.get(command.input.Key!);
        if (!body) throw new Error('object missing');
        return { Body: { transformToByteArray: async () => body } };
    }
}

function adapters(store: FakeObjectStore) {
    const common = { bucket: 'test-journal', client: store as unknown as S3Client, encryptionKey: key, namespace: 'test', prefix: 'deletion/test' };
    return { writer: new S3AccountDeletionRecoveryJournal(common), reader: new S3AccountDeletionRecoveryReader(common) };
}

function fakeRecoveryStore(version: number, status: 'active' | 'disabled' | 'deletion_pending' | 'purged' = 'active', deletionState: 'pending' | 'running' | 'cancelled' | null = null) {
    const blocked: Array<{ userId: string; userVersion: number }> = [];
    const store: RecoveryStore = {
        findUser: async (id) => ({ id, status, version, deletionState }),
        blockAccount: async (input) => { blocked.push(input); },
    };
    return { blocked, store };
}

describe('external deletion recovery journal', () => {
    it('offers a deterministic development-only adapter without object-store calls', async () => {
        const journal = new InMemoryAccountDeletionRecoveryJournal();
        await journal.recordBlockingIntent({ userId, userVersion: 5, scheduledAt });
        await journal.recordCommittedDeletion({ userId, userVersion: 5, scheduledAt });
        expect((await journal.readAll())[0]).toMatchObject({ kind: 'blocking', userVersion: 5 });
        expect((await runAccountDeletionRecoveryGate({ reader: journal, store: fakeRecoveryStore(4).store })).blocked).toBe(1);
    });

    it('requires an encrypted sentinel and fails closed on missing or corrupt journal objects', async () => {
        const storage = new FakeObjectStore();
        const { reader, writer } = adapters(storage);
        await expect(reader.readAll()).rejects.toThrow();
        await writer.initialize();
        await writer.initialize();
        await writer.recordBlockingIntent({ userId, userVersion: 5, scheduledAt });
        await writer.recordCommittedDeletion({ userId, userVersion: 5, scheduledAt });
        expect((await reader.readAll()).length).toBe(2);
        const eventKey = [...storage.objects.keys()].find((objectKey) => objectKey.includes('/events/'))!;
        storage.objects.set(eventKey, Buffer.from('corrupt'));
        await expect(reader.readAll()).rejects.toThrow();
    });

    it('binds ciphertext to its object key and validates the event envelope', () => {
        const objectKey = 'deletion/test/events/01994b76-943c-7c04-aa71-883389879861';
        const body = encryptJournalEvent({ kind: 'blocking', occurredAt: scheduledAt.toISOString(), userId, userVersion: 5 }, key, objectKey);
        expect(decryptJournalEvent(body, key, objectKey).kind).toBe('blocking');
        expect(() => decryptJournalEvent(body, key, 'deletion/test/events/other')).toThrow();
    });

    it('blocks old restores but honors a committed cancellation even after later disablement', async () => {
        const storage = new FakeObjectStore();
        const { reader, writer } = adapters(storage);
        await writer.initialize();
        await writer.recordBlockingIntent({ userId, userVersion: 5, scheduledAt });
        await writer.recordCommittedDeletion({ userId, userVersion: 5, scheduledAt });
        await writer.recordCancellation({ userId, userVersion: 6, cancelledAt: new Date('2026-09-16T09:00:00.000Z') });

        const oldSnapshot = fakeRecoveryStore(4);
        expect(await runAccountDeletionRecoveryGate({ reader, store: oldSnapshot.store })).toEqual({ blocked: 1, inspected: 1 });
        expect(oldSnapshot.blocked[0]?.userVersion).toBe(5);
        const committedSnapshot = fakeRecoveryStore(7, 'disabled', 'cancelled');
        expect(await runAccountDeletionRecoveryGate({ reader, store: committedSnapshot.store })).toEqual({ blocked: 0, inspected: 1 });
        const restoredPending = fakeRecoveryStore(5, 'deletion_pending', 'pending');
        expect((await runAccountDeletionRecoveryGate({ reader, store: restoredPending.store })).blocked).toBe(0);
    });

    it('blocks again when a later deletion intent supersedes cancellation, and ignores purged tombstones', async () => {
        const storage = new FakeObjectStore();
        const { reader, writer } = adapters(storage);
        await writer.initialize();
        await writer.recordBlockingIntent({ userId, userVersion: 5, scheduledAt });
        await writer.recordCommittedDeletion({ userId, userVersion: 5, scheduledAt });
        await writer.recordCancellation({ userId, userVersion: 6, cancelledAt: new Date('2026-09-16T09:00:00.000Z') });
        const later = new Date('2026-09-17T09:00:00.000Z');
        await writer.recordBlockingIntent({ userId, userVersion: 10, scheduledAt: later });
        await writer.recordCommittedDeletion({ userId, userVersion: 10, scheduledAt: later });
        expect((await runAccountDeletionRecoveryGate({ reader, store: fakeRecoveryStore(11).store })).blocked).toBe(1);
        expect((await runAccountDeletionRecoveryGate({ reader, store: fakeRecoveryStore(11, 'purged').store })).blocked).toBe(0);
    });
    it('fails closed on an intent from a rolled-back SQL transaction or a retained delete marker', async () => {
        const storage = new FakeObjectStore();
        const { reader, writer } = adapters(storage);
        await writer.initialize();
        await writer.recordBlockingIntent({ userId, userVersion: 5, scheduledAt });
        await expect(runAccountDeletionRecoveryGate({ reader, store: fakeRecoveryStore(4).store })).rejects.toThrow(/indeterminate/);
        const eventKey = [...storage.objects.keys()].find((objectKey) => objectKey.includes('/events/'))!;
        storage.deleteMarkers.push(eventKey);
        await expect(reader.readAll()).rejects.toThrow(/delete marker/);
    });
});
