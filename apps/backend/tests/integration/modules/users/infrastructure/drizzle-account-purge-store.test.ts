import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDrizzleDatabase, type PostgresClient, type PostgresJsDatabase } from '@languon/database';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { DrizzleAccountPurgeStore } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { accountDeletionRequestsTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { userEmailsTable, usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { authSecurityEventsTable, passwordCredentialsTable } from '../../../../../src/modules/authentication/infrastructure/persistence/drizzle/schema';
import { dictionariesTable } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

let client: PostgresClient;
let database: PostgresJsDatabase<typeof databaseSchema>;
let store: DrizzleAccountPurgeStore;
const now = new Date('2026-09-15T00:00:00Z');

async function scheduledIdentity() {
    const userId = randomUUID();
    await database.insert(usersTable).values({ id: userId, status: 'deletion_pending' });
    await database.insert(accountDeletionRequestsTable).values({
        nextAttemptAt: now,
        purgeAt: now,
        scheduledAt: new Date(now.getTime() - 30 * 24 * 60 * 60_000),
        updatedAt: now,
        userId,
    });
    return userId;
}

describe.runIf(isDatabaseIntegrationEnabled())('DrizzleAccountPurgeStore', () => {
    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        store = new DrizzleAccountPurgeStore(database);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
    });
    beforeEach(async () => {
        await database.delete(accountDeletionRequestsTable);
        await database.delete(dictionariesTable);
        await database.delete(usersTable);
    });
    afterAll(async () => { await client.end(); });

    it('claims only a due pending account and fences a stale worker', async () => {
        const userId = await scheduledIdentity();
        const claim = await store.claimDue({ now, workerId: 'worker-a' });
        expect(claim).toEqual({ fencingToken: 1, userId });
        expect(await store.claimDue({ now, workerId: 'worker-b' })).toBeNull();
        await store.retry({ ...claim!, now, workerId: 'worker-a' });
        const next = await store.claimDue({ now: new Date(now.getTime() + 5 * 60_000), workerId: 'worker-b' });
        expect(next?.fencingToken).toBe(2);
        expect(await store.finish({ ...claim!, now: new Date(now.getTime() + 5 * 60_000), workerId: 'worker-a' })).toBe(false);
    });

    it('leaves an ID-only tombstone and preserves independent forks', async () => {
        const userId = await scheduledIdentity();
        await database.insert(userEmailsTable).values({
            id: randomUUID(), userId, email: 'purge@example.test', canonicalEmail: 'purge@example.test',
        });
        await database.insert(passwordCredentialsTable).values({
            userId, algorithmVersion: 19, hash: `$argon2id$${'A'.repeat(64)}`,
            memoryCostKiB: 19456, parallelism: 1, timeCost: 2,
        });
        const securityEventId = randomUUID();
        await database.insert(authSecurityEventsTable).values({
            id: securityEventId, correlationId: randomUUID(), eventType: 'auth.account_deletion_scheduled',
            metadata: { email: 'purge@example.test' }, outcome: 'success', userId,
        });
        const otherUserId = randomUUID();
        await database.insert(usersTable).values({ id: otherUserId, status: 'active' });
        const sourceId = randomUUID();
        const forkId = randomUUID();
        await database.insert(dictionariesTable).values({
            id: sourceId,
            name: 'Source',
            ownerId: userId,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'ru',
        });
        await database.insert(dictionariesTable).values({
            id: forkId,
            name: 'Independent fork',
            ownerId: otherUserId,
            sourceDictionaryId: sourceId,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'ru',
        });
        const claim = await store.claimDue({ now, workerId: 'worker-a' });
        expect(claim).not.toBeNull();
        expect(await store.finish({ ...claim!, now, workerId: 'worker-a' })).toBe(true);
        const [user] = await database.select().from(usersTable).where(eq(usersTable.id, userId));
        expect(user?.status).toBe('purged');
        expect(user?.handle).toBeNull();
        expect(await database.select().from(userEmailsTable).where(eq(userEmailsTable.userId, userId))).toHaveLength(0);
        expect(await database.select().from(passwordCredentialsTable).where(eq(passwordCredentialsTable.userId, userId))).toHaveLength(0);
        const [event] = await database.select().from(authSecurityEventsTable).where(eq(authSecurityEventsTable.id, securityEventId));
        expect(event?.metadata).toEqual({});
        const [fork] = await database.select().from(dictionariesTable).where(eq(dictionariesTable.id, forkId));
        expect(fork?.sourceDictionaryId).toBeNull();
        const [source] = await database.select().from(dictionariesTable).where(eq(dictionariesTable.id, sourceId));
        expect(source).toBeUndefined();
    });
});
