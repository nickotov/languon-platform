import { randomUUID } from 'node:crypto';
import { KnowledgeNoteContentSchema } from '@languon/contracts';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { authSessionsTable } from '../../../../../src/modules/authentication/infrastructure/persistence/drizzle/schema';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionarySettingsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { DictionaryVersionConflictError } from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { DrizzleAccountDeletionStore } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-deletion-store';
import { DrizzleAdministrationStore } from '../../../../../src/modules/administration/infrastructure/persistence/drizzle/drizzle-administration-store';
import { DrizzleKnowledgeStore } from '../../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { KnowledgeShareCrypto } from '../../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import {
    knowledgeNotesTable,
    knowledgeOperationReceiptsTable,
    knowledgeSharesTable,
} from '../../../../../src/modules/knowledge/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import {
    usersTable,
    userEmailsTable,
} from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { AccountDeletionOwnerTransferRequiredError } from '../../../../../src/modules/users/application/account-deletion-service';
import { InMemoryAccountDeletionRecoveryJournal } from '../../../../../src/modules/users/infrastructure/recovery/in-memory-account-deletion-recovery-journal';
import { runAccountDeletionRecoveryGate } from '../../../../../src/modules/users/infrastructure/recovery/account-deletion-recovery-gate';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

let client: PostgresClient;
let database: PostgresJsDatabase<typeof databaseSchema>;
let store: DrizzleAccountDeletionStore;

async function seed() {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 30_000);
    const userId = randomUUID();
    const sessionId = randomUUID();
    const dictionaryId = randomUUID();
    await database.insert(usersTable).values({
        createdAt,
        id: userId,
        status: 'active',
        updatedAt: createdAt,
    });
    await database.insert(authSessionsTable).values({
        absoluteExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
        authenticatedAt: createdAt,
        authenticationMethod: 'password',
        createdAt,
        familyId: randomUUID(),
        id: sessionId,
        refreshTokenDigest: 'A'.repeat(43),
        updatedAt: createdAt,
        userId,
    });
    await database.insert(dictionariesTable).values({
        createdAt,
        id: dictionaryId,
        name: 'Shared before deletion',
        ownerId: userId,
        shareKeyDigest: `hmac-sha256:v1:${'A'.repeat(43)}`,
        shareKeyRotatedAt: createdAt,
        shareKeyVersion: 1,
        shareLocator: 'A'.repeat(22),
        sourceLanguageTag: 'en',
        targetLanguageTag: 'ru',
        updatedAt: createdAt,
        visibility: 'unlisted',
    });
    await database.insert(dictionarySettingsTable).values({ dictionaryId });
    return {
        dictionaryId,
        now,
        purgeAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
        sessionId,
        userId,
    };
}

describe.runIf(isDatabaseIntegrationEnabled())(
    'DrizzleAccountDeletionStore',
    () => {
        beforeAll(async () => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            store = new DrizzleAccountDeletionStore(database);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        });
        beforeEach(async () => {
            await database.delete(accountDeletionRequestsTable);
            await database.delete(adminAuditEventsTable);
            await database.delete(adminMembershipsTable);
            await database.delete(dictionariesTable);
            await database.delete(knowledgeNotesTable);
            await database.delete(knowledgeOperationReceiptsTable);
            await database.delete(authSessionsTable);
            await database.delete(usersTable);
        });
        afterAll(async () => {
            await client.end();
        });

        it('commits the journal marker, immediate session and share revocation, and 30-day request', async () => {
            const input = await seed();
            const versions: number[] = [];
            await store.schedule({
                ...input,
                beforeCommit: async (version) => {
                    versions.push(version);
                },
            });
            expect(versions).toEqual([2]);
            const [user] = await database
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, input.userId));
            expect(user).toMatchObject({
                status: 'deletion_pending',
                version: 2,
            });
            const [session] = await database
                .select()
                .from(authSessionsTable)
                .where(eq(authSessionsTable.id, input.sessionId));
            expect(session).toMatchObject({
                revocationReason: 'account_deletion',
                revokedAt: expect.any(Date),
            });
            const [dictionary] = await database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, input.dictionaryId));
            expect(dictionary).toMatchObject({
                visibility: 'private',
                shareLocator: null,
                shareKeyDigest: null,
                version: 2,
            });
            const [request] = await database
                .select()
                .from(accountDeletionRequestsTable)
                .where(eq(accountDeletionRequestsTable.userId, input.userId));
            expect(request?.state).toBe('pending');
            expect(request?.purgeAt.getTime()).toBe(
                request!.scheduledAt.getTime() + 30 * 24 * 60 * 60_000,
            );
        });
        it('keeps old Knowledge links revoked after administrator cancellation and permits a fresh link', async () => {
            const input = await seed();
            const knowledge = new DrizzleKnowledgeStore(
                database,
                { beforeNoteDeletion: async () => {} },
                new KnowledgeShareCrypto(
                    'knowledge-deletion-lifecycle-test-secret',
                ),
            );
            const content = KnowledgeNoteContentSchema.parse({
                title: 'Article usage',
                summary: '',
                categories: [],
                studiedLanguage: null,
                explanationLanguage: null,
                body: {
                    schemaVersion: 1,
                    document: {
                        type: 'doc',
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    {
                                        type: 'text',
                                        text: 'Use an before a vowel sound.',
                                    },
                                ],
                            },
                        ],
                    },
                },
            });
            const note = await knowledge.create(input.userId, {
                operationId: randomUUID(),
                content,
            });
            const old = await knowledge.issueShare(input.userId, note.id);
            expect((await knowledge.readShared(old.locator, old.key)).id).toBe(
                note.id,
            );
            await store.schedule({ ...input, beforeCommit: async () => {} });
            expect(await database.select().from(knowledgeSharesTable)).toEqual(
                [],
            );
            await expect(
                knowledge.readShared(old.locator, old.key),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });

            const adminId = randomUUID(),
                adminSessionId = randomUUID(),
                now = new Date();
            await database
                .insert(usersTable)
                .values({ id: adminId, status: 'active' });
            await database.insert(userEmailsTable).values([
                {
                    id: randomUUID(),
                    userId: input.userId,
                    email: 'learner-cancel@example.test',
                    canonicalEmail: 'learner-cancel@example.test',
                    verifiedAt: now,
                },
                {
                    id: randomUUID(),
                    userId: adminId,
                    email: 'admin-cancel@example.test',
                    canonicalEmail: 'admin-cancel@example.test',
                    verifiedAt: now,
                },
            ]);
            await database.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: adminId,
                grantedByUserId: adminId,
                grantReason: 'Verified test administrator',
            });
            await database.insert(authSessionsTable).values({
                id: adminSessionId,
                userId: adminId,
                familyId: randomUUID(),
                authenticationMethod: 'password',
                authenticatedAt: now,
                absoluteExpiresAt: new Date(now.getTime() + 3600_000),
                refreshTokenDigest: 'C'.repeat(43),
                createdAt: now,
                updatedAt: now,
            });
            const admin = new DrizzleAdministrationStore(database, {
                recordCancellation: async () => {},
            });
            await admin.cancelUserDeletion({
                actorSessionId: adminSessionId,
                actorUserId: adminId,
                targetUserId: input.userId,
                expectedVersion: 2,
                reason: 'Reviewed cancellation request',
                audit: {
                    id: randomUUID(),
                    correlationId: randomUUID(),
                    occurredAt: now,
                    expiresAt: new Date(now.getTime() + 180 * 24 * 3600_000),
                },
            });
            await expect(
                knowledge.readShared(old.locator, old.key),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            const fresh = await knowledge.issueShare(input.userId, note.id);
            expect(fresh.locator).not.toBe(old.locator);
            expect(
                (await knowledge.readShared(fresh.locator, fresh.key)).id,
            ).toBe(note.id);
        });

        it('rolls back all removal effects when the independent journal rejects', async () => {
            const input = await seed();
            await expect(
                store.schedule({
                    ...input,
                    beforeCommit: async () => {
                        throw new Error('journal unavailable');
                    },
                }),
            ).rejects.toThrow('journal unavailable');
            const [user] = await database
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, input.userId));
            expect(user).toMatchObject({ status: 'active', version: 1 });
            const [session] = await database
                .select()
                .from(authSessionsTable)
                .where(eq(authSessionsTable.id, input.sessionId));
            expect(session?.revokedAt).toBeNull();
            const [dictionary] = await database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, input.dictionaryId));
            expect(dictionary?.visibility).toBe('unlisted');
            expect(
                await database.select().from(accountDeletionRequestsTable),
            ).toHaveLength(0);
        });

        it('rejects an in-flight share rotation after removal, even with a freshly read dictionary version', async () => {
            const input = await seed();
            const dictionaries = new DrizzleDictionaryStore(database, {
                generate: randomUUID,
            });
            await store.schedule({ ...input, beforeCommit: async () => {} });
            for (const expectedDictionaryVersion of [1, 2]) {
                await expect(
                    dictionaries.rotateShare({
                        context: {
                            now: new Date(),
                            signal: new AbortController().signal,
                        },
                        digest: `hmac-sha256:v1:${'B'.repeat(43)}`,
                        dictionaryId: input.dictionaryId,
                        expectedDictionaryVersion,
                        keyVersion: 2,
                        locator: 'B'.repeat(22),
                        ownerId: input.userId,
                    }),
                ).rejects.toBeInstanceOf(DictionaryVersionConflictError);
            }
            const [dictionary] = await database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, input.dictionaryId));
            expect(dictionary).toMatchObject({
                visibility: 'private',
                shareLocator: null,
                version: 2,
            });
        });

        it('fails stop rather than purging an active user when SQL fails after the blocking intent', async () => {
            const input = await seed();
            const journal = new InMemoryAccountDeletionRecoveryJournal();
            await client.unsafe(
                "create function reject_deletion_test() returns trigger language plpgsql as $$ begin if new.status = 'deletion_pending' then raise exception 'injected SQL failure'; end if; return new; end $$",
            );
            await client.unsafe(
                'create trigger reject_deletion_test before update on users for each row execute function reject_deletion_test()',
            );
            try {
                await expect(
                    store.schedule({
                        ...input,
                        beforeCommit: async (userVersion, scheduledAt) =>
                            journal.recordBlockingIntent({
                                userId: input.userId,
                                userVersion,
                                scheduledAt,
                            }),
                    }),
                ).rejects.toThrow(/Failed query: update "users"/);
            } finally {
                await client.unsafe(
                    'drop trigger reject_deletion_test on users',
                );
                await client.unsafe('drop function reject_deletion_test()');
            }
            const [user] = await database
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, input.userId));
            expect(user?.status).toBe('active');
            await expect(
                runAccountDeletionRecoveryGate({
                    reader: journal,
                    store: {
                        findUser: async () => ({
                            id: input.userId,
                            status: 'active',
                            version: 1,
                        }),
                        blockAccount: async () => {
                            throw new Error('must not schedule purge');
                        },
                    },
                }),
            ).rejects.toThrow(/indeterminate/);
        });

        it('requires administrator membership transfer and revocation first', async () => {
            const input = await seed();
            await database.insert(adminMembershipsTable).values({
                grantReason: 'Verified local owner enrollment',
                grantedByUserId: input.userId,
                id: randomUUID(),
                userId: input.userId,
            });
            await expect(
                store.schedule({ ...input, beforeCommit: async () => {} }),
            ).rejects.toBeInstanceOf(AccountDeletionOwnerTransferRequiredError);
            const [user] = await database
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, input.userId));
            expect(user?.status).toBe('active');
        });
    },
);
