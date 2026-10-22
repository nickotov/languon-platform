import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { capabilityPolicyRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import {
    CapabilityPolicyConflictError,
    DrizzleCapabilityPolicyParticipant,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { AdminAccessDeniedError } from '../../../../src/modules/administration/application/administration-errors';

describe.runIf(isDatabaseIntegrationEnabled())(
    'immutable capability policies',
    () => {
        let client: PostgresClient;
        let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
        const owner = randomUUID();
        const viewer = randomUUID();
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: viewer, status: 'active' },
            ]);
            await db.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: owner,
                role: 'owner',
                grantedByUserId: owner,
                grantReason: 'Disposable capability policy test owner',
            });
        }, 120000);
        afterAll(async () => {
            await client?.end();
        });
        it('reads defaults without inserting or taking exclusive publication locks', async () => {
            const current = await db.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).current(
                    'portrait-interview',
                ),
            );
            expect(current).toMatchObject({
                version: 0,
                revisionId: null,
                funding: 'operator',
            });
            expect(
                await db.select().from(capabilityPolicyRevisionsTable),
            ).toHaveLength(0);
        });
        it('denies publication without an active owner membership', async () => {
            await expect(
                db.transaction((tx) =>
                    new DrizzleCapabilityPolicyParticipant(tx).publish(
                        {
                            capability: 'portrait-interview',
                            expectedVersion: 0,
                            funding: 'customer',
                            reason: 'Unauthorized publication attempt',
                        },
                        viewer,
                        new Date(),
                    ),
                ),
            ).rejects.toBeInstanceOf(AdminAccessDeniedError);
            expect(
                await db.select().from(capabilityPolicyRevisionsTable),
            ).toHaveLength(0);
        });
        it('serializes competing publications, preserves pinned snapshots, and appends revisions', async () => {
            const pinned = await db.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).current(
                    'portrait-interview',
                ),
            );
            const publish = () =>
                db.transaction((tx) =>
                    new DrizzleCapabilityPolicyParticipant(tx).publish(
                        {
                            capability: 'portrait-interview',
                            expectedVersion: 0,
                            funding: 'customer',
                            reason: 'Concurrent capability publication',
                        },
                        owner,
                        new Date(),
                    ),
                );
            const results = await Promise.allSettled([publish(), publish()]);
            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            const rejected = results.find(
                (result) => result.status === 'rejected',
            );
            expect(
                rejected?.status === 'rejected' && rejected.reason,
            ).toBeInstanceOf(CapabilityPolicyConflictError);
            expect(pinned).toMatchObject({ version: 0, funding: 'operator' });
            const first = await db
                .select()
                .from(capabilityPolicyRevisionsTable);
            await db.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).publish(
                    {
                        capability: 'portrait-interview',
                        expectedVersion: 1,
                        funding: 'operator',
                        reason: 'Restore free interview policy',
                    },
                    owner,
                    new Date(),
                ),
            );
            const revisions = await db
                .select()
                .from(capabilityPolicyRevisionsTable);
            expect(revisions).toHaveLength(2);
            expect(revisions).toContainEqual(first[0]);
        });
        it('publishes a calibrated default without rewriting prior settings revisions', async () => {
            expect(
                await db.transaction((tx) =>
                    new DrizzleCapabilityPolicyParticipant(tx).settings(),
                ),
            ).toEqual({ version: 0, defaultMaxCreditsPerAction: null });
            await expect(
                db.transaction((tx) =>
                    new DrizzleCapabilityPolicyParticipant(tx).publishSettings(
                        {
                            expectedVersion: 0,
                            defaultMaxCreditsPerAction: '1.001',
                            reason: 'Unauthorized default change',
                        },
                        viewer,
                        new Date(),
                    ),
                ),
            ).rejects.toBeInstanceOf(AdminAccessDeniedError);
            const saved = await db.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).publishSettings(
                    {
                        expectedVersion: 0,
                        defaultMaxCreditsPerAction: '1.001',
                        reason: 'Calibrated disposable default',
                    },
                    owner,
                    new Date(),
                ),
            );
            expect(saved).toEqual({
                version: 1,
                defaultMaxCreditsPerAction: '1.001',
            });
            await expect(
                db.transaction((tx) =>
                    new DrizzleCapabilityPolicyParticipant(tx).publishSettings(
                        {
                            expectedVersion: 0,
                            defaultMaxCreditsPerAction: null,
                            reason: 'Conflicting default revision',
                        },
                        owner,
                        new Date(),
                    ),
                ),
            ).rejects.toBeInstanceOf(CapabilityPolicyConflictError);
        });
    },
);
