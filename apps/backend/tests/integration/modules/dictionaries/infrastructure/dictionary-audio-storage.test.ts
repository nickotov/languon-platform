import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { PostgresAudioObjectStorage } from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-object-storages';
import {
    audioChecksum,
    createFixtureAudio,
} from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-integrity';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
} from '../../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'PostgreSQL audio storage contract',
    () => {
        let client: PostgresClient;
        let storage: PostgresAudioObjectStorage;
        beforeAll(async () => {
            client = createTestPostgresClient();
            await migrateTestDatabase(client);
            storage = new PostgresAudioObjectStorage(
                createDrizzleDatabase(client, databaseSchema),
            );
        });
        afterAll(async () => {
            await client?.end();
        });
        it('round trips actual fixture bytea, enforces immutable key integrity and verifies deletion', async () => {
            const key = `dictionary-audio/test/${randomUUID()}`;
            const fixture = createFixtureAudio();
            const ref = await storage.put(key, fixture);
            try {
                expect(await storage.read(ref)).toEqual(fixture);
                expect(await storage.put(key, fixture)).toEqual(ref);
                const changed = createFixtureAudio();
                changed.bytes[100] = 42;
                await expect(storage.put(key, changed)).rejects.toThrow(
                    'integrity',
                );
                changed.checksum = audioChecksum(changed.bytes);
                await expect(storage.put(key, changed)).rejects.toThrow(
                    'different bytes',
                );
                await expect(
                    storage.read({ ...ref, namespace: 'other' }),
                ).rejects.toThrow('identity');
            } finally {
                await storage.delete(ref);
            }
            expect(await storage.read(ref)).toBeNull();
            await storage.delete(ref);
        });
    },
);
