import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../../../src/infrastructure/database/schema';
import { accountDeletionRequestsTable } from '../../../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { usersTable } from '../../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleAccountDeletionRecoveryStore } from '../../../../../../src/modules/users/infrastructure/recovery/drizzle-account-deletion-recovery-store';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../support/test-database';

const userId = '01994b76-943c-7c04-aa71-883389879861';
const scheduledAt = new Date('2026-09-15T09:00:00.000Z');
let client: PostgresClient;

describe.runIf(isDatabaseIntegrationEnabled())('DrizzleAccountDeletionRecoveryStore', () => {
    beforeAll(() => { client = createTestPostgresClient(); });
    beforeEach(async () => {
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
    });
    afterAll(async () => { await client.end(); });

    it('replays a future blocking intent into an older active snapshot and is idempotent', async () => {
        const database = createDrizzleDatabase(client, databaseSchema);
        const now = new Date('2026-09-16T09:00:00.000Z');
        await database.insert(usersTable).values({ id: userId, status: 'active', version: 4, createdAt: scheduledAt, updatedAt: scheduledAt });
        const store = new DrizzleAccountDeletionRecoveryStore(database, () => now);

        await store.blockAccount({ scheduledAt, userId, userVersion: 5 });
        await store.blockAccount({ scheduledAt, userId, userVersion: 5 });

        expect(await store.findUser(userId)).toMatchObject({ status: 'deletion_pending', version: 5 });
        const requests = await database.select().from(accountDeletionRequestsTable).where(eq(accountDeletionRequestsTable.userId, userId));
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            scheduledAt,
            purgeAt: new Date('2026-10-15T09:00:00.000Z'),
            state: 'pending',
        });
    });
});
