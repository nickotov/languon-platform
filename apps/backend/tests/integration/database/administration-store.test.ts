import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { databaseSchema } from '../../../src/infrastructure/database/schema';
import {
    AdminAccessDeniedError,
    AdminAiSettingsConflictError,
    AdminCancellationJournalUnavailableError,
    AdminDeletionCancellationUnavailableError,
    AdminLastOwnerForbiddenError,
    AdminMembershipConflictError,
    AdminOperatorActorRequiredError,
    AdminUserStateConflictError,
} from '../../../src/modules/administration/application/administration-errors';
import { RecentAuthenticationRequiredError } from '../../../src/modules/authentication/application/authentication-errors';
import { DrizzleAdministrationOperator } from '../../../src/modules/administration/infrastructure/persistence/drizzle/drizzle-administration-operator';
import { DrizzleAdministrationStore } from '../../../src/modules/administration/infrastructure/persistence/drizzle/drizzle-administration-store';
import { activeOwnerMutationLock } from '../../../src/modules/administration/infrastructure/persistence/drizzle/owner-lock';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { authSessionsTable } from '../../../src/modules/authentication/infrastructure/persistence/drizzle/schema';
import { aiCreditGrantsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    userEmailsTable,
    usersTable,
} from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { publishDictionaryAiWorkerObservations } from '../../../src/modules/dictionaries/infrastructure/ai/dictionary-ai-worker-observations';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

const ownerId = '0198c300-00b7-7b02-84fc-9182f9565eaa';
const targetId = '0198c300-4603-7088-ae12-cd2346c53492';
const thirdId = '0198c300-7b38-74a3-b07d-7307aa917df2';
const now = new Date('2026-08-20T09:00:00.000Z');

let client: PostgresClient;

describe.runIf(isDatabaseIntegrationEnabled())(
    'DrizzleAdministrationStore',
    () => {
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        });
        afterAll(async () => {
            await client.end();
        });

        it('atomically disables a user, revokes sessions, and records audit', async () => {
            const { database, store } = await seed();
            const detail = await store.disableUser(
                mutation(targetId, 1, 'Confirmed abuse investigation'),
            );

            expect(detail).toMatchObject({
                id: targetId,
                status: 'disabled',
                version: 2,
                activeSessionCount: 0,
            });
            const sessions = await database
                .select()
                .from(authSessionsTable)
                .where(eq(authSessionsTable.userId, targetId));
            expect(sessions[0]).toMatchObject({
                revocationReason: 'disabled_user',
                revokedAt: expect.any(Date),
            });
            const events = await database.select().from(adminAuditEventsTable);
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                action: 'user_disabled',
                actorUserId: ownerId,
                afterStatus: 'disabled',
                beforeStatus: 'active',
                outcome: 'success',
                targetUserId: targetId,
            });
            expect(events[0]?.occurredAt).toEqual(sessions[0]?.revokedAt);
        });

        it('atomically versions dictionary AI settings and rejects stale writes', async () => {
            vi.stubEnv('DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED', 'true');
            vi.stubEnv('DICTIONARY_AI_MANAGED_ROUTING_ENABLED', 'true');
            try {
                const { database, store } = await seed();
                const response = await store.updateAiSettings({
                    activeProvider: 'deepseek',
                    actorSessionId: '0198c302-93c8-7536-a0e5-055605f614db',
                    actorUserId: ownerId,
                    audit: {
                        correlationId: '0198c304-06db-7ed2-a917-ac60af3c5ea0',
                        expiresAt: new Date('2027-09-23T09:00:00.000Z'),
                        id: '0198c304-3f0d-7279-bfc6-1de92e25a20c',
                        occurredAt: now,
                    },
                    defaultModel: 'deepseek-chat',
                    enabledModels: ['deepseek-chat'],
                    expectedVersion: 0,
                    reason: 'Enable verified dictionary AI provider',
                    revisionId: '0198c304-7b38-74a3-b07d-7307aa917df2',
                });

                expect(response.settings).toMatchObject({
                    activeProvider: 'deepseek',
                    defaultModel: 'deepseek-chat',
                    enabledModels: ['deepseek-chat'],
                    version: 1,
                });
                expect(
                    await database
                        .select()
                        .from(dictionaryAiConfigurationTable),
                ).toHaveLength(1);
                expect(
                    await database
                        .select()
                        .from(dictionaryAiConfigurationRevisionsTable),
                ).toEqual([
                    expect.objectContaining({
                        createdByUserId: ownerId,
                        version: 1,
                    }),
                ]);
                expect(
                    await database
                        .select()
                        .from(adminAuditEventsTable)
                        .where(
                            eq(
                                adminAuditEventsTable.action,
                                'ai_settings_updated',
                            ),
                        ),
                ).toEqual([
                    expect.objectContaining({
                        actorUserId: ownerId,
                        afterVersion: 1,
                        outcome: 'success',
                        targetUserId: null,
                    }),
                ]);

                await expect(
                    store.updateAiSettings({
                        activeProvider: 'deepseek',
                        actorSessionId: '0198c302-93c8-7536-a0e5-055605f614db',
                        actorUserId: ownerId,
                        audit: {
                            correlationId:
                                '0198c305-06db-7ed2-a917-ac60af3c5ea0',
                            expiresAt: new Date('2027-09-23T09:00:00.000Z'),
                            id: '0198c305-3f0d-7279-bfc6-1de92e25a20c',
                            occurredAt: now,
                        },
                        defaultModel: 'deepseek-chat',
                        enabledModels: ['deepseek-chat'],
                        expectedVersion: 0,
                        reason: 'Attempt stale dictionary AI update',
                        revisionId: '0198c305-7b38-74a3-b07d-7307aa917df2',
                    }),
                ).rejects.toBeInstanceOf(AdminAiSettingsConflictError);
                expect(
                    await database
                        .select()
                        .from(dictionaryAiConfigurationRevisionsTable),
                ).toHaveLength(1);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it('reads fresh worker observations without exposing provider credentials', async () => {
            vi.stubEnv('DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED', 'true');
            vi.stubEnv('DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED', 'true');
            vi.stubEnv('DICTIONARY_AI_MANAGED_ROUTING_ENABLED', 'true');
            try {
                const { database, store } = await seed();
                const fetchProvider = vi
                    .fn()
                    .mockResolvedValueOnce({ status: 200 } as Response)
                    .mockResolvedValueOnce({ status: 405 } as Response);
                await publishDictionaryAiWorkerObservations({
                    credentials: {
                        DEEPSEEK_API_KEY: 'deepseek-secret-never-returned',
                        KIE_API_KEY: 'kie-secret-never-returned',
                    },
                    database,
                    fetchProvider,
                    now: new Date(),
                    readinessTimeoutMs: 1_000,
                    workerId: 'integration-worker',
                });

                const response = await store.aiSettings();
                expect(response.providers).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            health: expect.objectContaining({
                                status: 'available',
                            }),
                            id: 'deepseek',
                        }),
                        expect.objectContaining({
                            health: expect.objectContaining({
                                status: 'unverified',
                            }),
                            id: 'kie',
                        }),
                    ]),
                );
                expect(JSON.stringify(response)).not.toContain(
                    'secret-never-returned',
                );
                expect(
                    await database
                        .select()
                        .from(dictionaryAiWorkerObservationsTable),
                ).toHaveLength(2);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it('allows exactly one concurrent dictionary AI settings writer', async () => {
            vi.stubEnv('DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED', 'true');
            vi.stubEnv('DICTIONARY_AI_MANAGED_ROUTING_ENABLED', 'true');
            try {
                const { database, store } = await seed();
                const mutation = (suffix: 'a' | 'b') => ({
                    activeProvider: 'deepseek' as const,
                    actorSessionId: '0198c302-93c8-7536-a0e5-055605f614db',
                    actorUserId: ownerId,
                    audit: {
                        correlationId:
                            suffix === 'a'
                                ? '0198c306-06db-7ed2-a917-ac60af3c5ea0'
                                : '0198c307-06db-7ed2-a917-ac60af3c5ea0',
                        expiresAt: new Date('2027-09-23T09:00:00.000Z'),
                        id:
                            suffix === 'a'
                                ? '0198c306-3f0d-7279-bfc6-1de92e25a20c'
                                : '0198c307-3f0d-7279-bfc6-1de92e25a20c',
                        occurredAt: now,
                    },
                    defaultModel: 'deepseek-chat',
                    enabledModels: ['deepseek-chat'],
                    expectedVersion: 0,
                    reason: `Concurrent reviewed AI update ${suffix}`,
                    revisionId:
                        suffix === 'a'
                            ? '0198c306-7b38-74a3-b07d-7307aa917df2'
                            : '0198c307-7b38-74a3-b07d-7307aa917df2',
                });
                const results = await Promise.allSettled([
                    store.updateAiSettings(mutation('a')),
                    store.updateAiSettings(mutation('b')),
                ]);
                expect(
                    results.filter((result) => result.status === 'fulfilled'),
                ).toHaveLength(1);
                const rejected = results.find(
                    (result) => result.status === 'rejected',
                );
                expect(rejected).toMatchObject({
                    reason: expect.any(AdminAiSettingsConflictError),
                    status: 'rejected',
                });
                expect(
                    await database
                        .select()
                        .from(dictionaryAiConfigurationRevisionsTable),
                ).toHaveLength(1);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it('restores verified and unverified users to the correct availability', async () => {
            const { database, store } = await seed({ targetVerified: false });
            await database
                .update(usersTable)
                .set({ status: 'disabled', version: 2 })
                .where(eq(usersTable.id, targetId));

            const detail = await store.restoreUser(
                mutation(targetId, 2, 'Support verified restoration request'),
            );

            expect(detail).toMatchObject({ status: 'pending', version: 3 });
        });

        it('cancels a pending account deletion atomically and audits the distinct action', async () => {
            const { database, journal, store } = await seed();
            await pendingDeletion(database);

            const detail = await store.cancelUserDeletion(
                mutation(targetId, 2, 'Verified administrator cancellation'),
            );

            expect(detail).toMatchObject({
                id: targetId,
                status: 'active',
                version: 3,
                activeSessionCount: 0,
            });
            expect(
                await database.select().from(accountDeletionRequestsTable),
            ).toEqual([
                expect.objectContaining({
                    state: 'cancelled',
                    leaseDeadline: null,
                    leaseWorkerId: null,
                }),
            ]);
            expect(await database.select().from(adminAuditEventsTable)).toEqual(
                [
                    expect.objectContaining({
                        action: 'user_deletion_cancelled',
                        actorUserId: ownerId,
                        beforeStatus: 'deletion_pending',
                        afterStatus: 'active',
                        outcome: 'success',
                        targetUserId: targetId,
                    }),
                ],
            );
            expect(journal.recordCancellation).toHaveBeenCalledWith({
                cancelledAt: expect.any(Date),
                userId: targetId,
                userVersion: 3,
            });
        });

        it('rolls back cancellation when the external recovery journal fails', async () => {
            const { database, journal, store } = await seed();
            await pendingDeletion(database);
            journal.recordCancellation.mockRejectedValueOnce(
                new Error('independent journal unavailable'),
            );

            await expect(
                store.cancelUserDeletion(
                    mutation(
                        targetId,
                        2,
                        'Reviewed request before journal outage',
                    ),
                ),
            ).rejects.toBeInstanceOf(AdminCancellationJournalUnavailableError);
            expect(await store.findUser(targetId)).toMatchObject({
                status: 'deletion_pending',
                version: 2,
            });
            expect(
                await database.select().from(accountDeletionRequestsTable),
            ).toEqual([expect.objectContaining({ state: 'pending' })]);
            expect(
                await database.select().from(adminAuditEventsTable),
            ).toHaveLength(0);
        });

        it('blocks generic restore and cancellation after the purge claim', async () => {
            const { database, store } = await seed();
            await pendingDeletion(database);

            await expect(
                store.restoreUser(
                    mutation(targetId, 2, 'Attempt ordinary restore instead'),
                ),
            ).rejects.toBeInstanceOf(AdminUserStateConflictError);

            await database
                .update(accountDeletionRequestsTable)
                .set({
                    leaseDeadline: new Date(Date.now() + 60_000),
                    leaseWorkerId: 'test-worker',
                    state: 'running',
                })
                .where(eq(accountDeletionRequestsTable.userId, targetId));
            await expect(
                store.cancelUserDeletion(
                    mutation(targetId, 2, 'Attempt after purge worker claim'),
                ),
            ).rejects.toBeInstanceOf(AdminDeletionCancellationUnavailableError);
            expect(await store.findUser(targetId)).toMatchObject({
                status: 'deletion_pending',
                version: 2,
            });
            expect(
                await database.select().from(adminAuditEventsTable),
            ).toHaveLength(0);
        });

        it('searches by email text without casting it to a PostgreSQL UUID', async () => {
            const { store } = await seed();

            await expect(
                store.listUsers({
                    page: 1,
                    pageSize: 25,
                    search: 'target@example.com',
                }),
            ).resolves.toMatchObject({
                data: [
                    expect.objectContaining({
                        id: targetId,
                        primaryEmail: 'target@example.com',
                    }),
                ],
                total: 1,
            });
        });

        it('keeps an opaque actor reference when a purged user has no email', async () => {
            const { database, store } = await seed();
            await database.insert(adminAuditEventsTable).values({
                action: 'user_disabled',
                actorUserId: targetId,
                correlationId: '0198c304-4053-71aa-b3fc-d9cc8a47e5f0',
                expiresAt: new Date('2027-08-20T09:00:00.000Z'),
                id: '0198c304-8569-77c4-b47c-a9d574234fe3',
                occurredAt: now,
                outcome: 'success',
                reason: 'Reviewed fixture audit reference',
                targetUserId: targetId,
            });
            await database
                .delete(userEmailsTable)
                .where(eq(userEmailsTable.userId, targetId));

            const result = await store.listAuditEvents({
                page: 1,
                pageSize: 10,
            });
            expect(result.data).toEqual([
                expect.objectContaining({
                    actorEmail: null,
                    actorUserId: targetId,
                    targetEmail: null,
                    targetUserId: targetId,
                }),
            ]);
        });

        it('rejects disabling the last active owner', async () => {
            const { store } = await seed();

            await expect(
                store.disableUser(
                    mutation(ownerId, 1, 'Requested owner account disable'),
                ),
            ).rejects.toBeInstanceOf(AdminLastOwnerForbiddenError);
        });

        it('allows only one concurrent mutation for an expected version', async () => {
            const { store } = await seed();
            const attempts = await Promise.allSettled([
                store.disableUser(
                    mutation(targetId, 1, 'First reviewed disable request'),
                ),
                store.disableUser(
                    mutation(targetId, 1, 'Second reviewed disable request'),
                ),
            ]);

            expect(
                attempts.filter((attempt) => attempt.status === 'fulfilled'),
            ).toHaveLength(1);
            const rejected = attempts.find(
                (attempt) => attempt.status === 'rejected',
            );
            expect(rejected).toMatchObject({
                reason: expect.any(AdminUserStateConflictError),
            });
        });

        it('revalidates owner membership after acquiring the mutation lock', async () => {
            const { database, store } = await seed();
            let waitingMutation: ReturnType<typeof store.disableUser> | null =
                null;
            await database.transaction(async (transaction) => {
                await transaction.execute(
                    sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
                );
                waitingMutation = store.disableUser(
                    mutation(targetId, 1, 'Reviewed concurrent restriction'),
                );
                await new Promise((resolve) => setTimeout(resolve, 10));
                await transaction
                    .update(adminMembershipsTable)
                    .set({
                        revokedAt: now,
                        revokedByUserId: ownerId,
                        revokeReason: 'Revoke owner during queued operation',
                        updatedAt: now,
                    })
                    .where(eq(adminMembershipsTable.userId, ownerId));
            });

            await expect(waitingMutation!).rejects.toBeInstanceOf(
                AdminAccessDeniedError,
            );
            await expect(store.findUser(targetId)).resolves.toMatchObject({
                status: 'active',
                version: 1,
            });
        });

        it('revalidates recent authentication with fresh database time after waiting for the mutation lock', async () => {
            const { database, store } = await seed();
            await database
                .update(authSessionsTable)
                .set({
                    authenticatedAt: sql`clock_timestamp() - interval '5 minutes' + interval '500 milliseconds'`,
                })
                .where(
                    eq(
                        authSessionsTable.id,
                        '0198c302-93c8-7536-a0e5-055605f614db',
                    ),
                );

            let waitingMutation: ReturnType<typeof store.disableUser> | null =
                null;
            await database.transaction(async (transaction) => {
                await transaction.execute(
                    sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
                );
                waitingMutation = store.disableUser(
                    mutation(targetId, 1, 'Reviewed expiry-boundary request'),
                );
                await new Promise((resolve) => setTimeout(resolve, 750));
            });

            await expect(waitingMutation!).rejects.toBeInstanceOf(
                RecentAuthenticationRequiredError,
            );
            await expect(store.findUser(targetId)).resolves.toMatchObject({
                status: 'active',
                version: 1,
            });
        });

        it('allows repeated trace correlation without turning it into idempotency', async () => {
            const { database, store } = await seed();
            const correlationId = '0198c303-06db-7ed2-a917-ac60af3c5ea0';
            await store.disableUser(
                mutation(targetId, 1, 'First traced status operation'),
            );
            await store.restoreUser({
                ...mutation(targetId, 2, 'Second traced status operation'),
                audit: {
                    ...mutation(targetId, 2, 'unused').audit,
                    correlationId,
                    id: '0198c303-a212-71c7-94bd-5efc73da995d',
                },
            });

            const events = await database
                .select()
                .from(adminAuditEventsTable)
                .where(eq(adminAuditEventsTable.correlationId, correlationId));
            expect(events).toHaveLength(2);
        });

        it('serializes bootstrap so concurrent commands cannot create owners without an actor', async () => {
            const { operator } = await seed({ ownerMembership: false });
            const attempts = await Promise.allSettled([
                operator.grant({
                    email: 'owner@example.com',
                    now,
                    reason: 'Initial verified owner bootstrap',
                }),
                operator.grant({
                    email: 'target@example.com',
                    now,
                    reason: 'Competing owner bootstrap request',
                }),
            ]);

            expect(
                attempts.filter((attempt) => attempt.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                attempts.find((attempt) => attempt.status === 'rejected'),
            ).toMatchObject({
                reason: expect.any(AdminOperatorActorRequiredError),
            });
            expect(await operator.list()).toHaveLength(1);
        });

        it('audits authorized membership conflict rejections with target context', async () => {
            const { database, operator } = await seed();

            await expect(
                operator.grant({
                    actorEmail: 'owner@example.com',
                    email: 'owner@example.com',
                    now,
                    reason: 'Review duplicate owner grant',
                }),
            ).rejects.toBeInstanceOf(AdminMembershipConflictError);
            await expect(
                operator.revoke({
                    actorEmail: 'owner@example.com',
                    email: 'target@example.com',
                    now,
                    reason: 'Review absent owner membership',
                }),
            ).rejects.toBeInstanceOf(AdminMembershipConflictError);

            const rejected = await database
                .select()
                .from(adminAuditEventsTable)
                .where(eq(adminAuditEventsTable.outcome, 'rejected'));
            expect(rejected).toHaveLength(2);
            expect(rejected).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: 'membership_granted',
                        actorUserId: ownerId,
                        metadata: expect.objectContaining({
                            rejection: 'membership_already_active',
                            targetStatus: 'active',
                            targetVersion: 1,
                        }),
                        targetUserId: ownerId,
                    }),
                    expect.objectContaining({
                        action: 'membership_revoked',
                        actorUserId: ownerId,
                        metadata: expect.objectContaining({
                            rejection: 'membership_not_active',
                            targetStatus: 'active',
                            targetVersion: 1,
                        }),
                        targetUserId: targetId,
                    }),
                ]),
            );
        });

        it('atomically manages AI credit policy and grants with optimistic versions', async () => {
            const { database, store } = await seed();
            const policy = await store.updateAiCreditPolicy({
                ...creditMutation(
                    '0198c305-06db-7ed2-a917-ac60af3c5ea0',
                    '0198c305-3f0d-7279-bfc6-1de92e25a20c',
                    0,
                ),
                mode: 'unlimited',
                unlimitedUntil: null,
            });
            expect(policy).toMatchObject({
                ok: true,
                response: {
                    account: {
                        configuredMode: 'unlimited',
                        effectiveMode: 'unlimited',
                        managementVersion: 1,
                    },
                },
            });

            const adjustment = await store.adjustAiCredits({
                ...creditMutation(
                    '0198c305-6e90-7caa-a0ce-93e7faf1405f',
                    '0198c305-9c28-7d02-81d4-1ea13de886a8',
                    1,
                ),
                amountCredits: 500,
                expiresAt: null,
            });
            expect(adjustment).toMatchObject({
                ok: true,
                response: {
                    account: {
                        availableCredits: 500,
                        managementVersion: 2,
                    },
                },
            });
            expect(
                await database.select().from(aiCreditGrantsTable),
            ).toHaveLength(1);
            expect(
                await database
                    .select()
                    .from(adminAuditEventsTable)
                    .where(
                        eq(adminAuditEventsTable.action, 'ai_credits_adjusted'),
                    ),
            ).toMatchObject([
                {
                    afterVersion: 2,
                    beforeVersion: 1,
                    outcome: 'success',
                    targetUserId: targetId,
                },
            ]);
        });

        it('commits the rejection audit while leaving a stale credit mutation unchanged', async () => {
            const { database, store } = await seed();
            await store.adjustAiCredits({
                ...creditMutation(
                    '0198c306-06db-7ed2-a917-ac60af3c5ea0',
                    '0198c306-3f0d-7279-bfc6-1de92e25a20c',
                    0,
                ),
                amountCredits: 500,
                expiresAt: null,
            });

            const rejected = await store.adjustAiCredits({
                ...creditMutation(
                    '0198c306-6e90-7caa-a0ce-93e7faf1405f',
                    '0198c306-9c28-7d02-81d4-1ea13de886a8',
                    0,
                ),
                amountCredits: 250,
                expiresAt: null,
            });

            expect(rejected).toEqual({
                ok: false,
                rejection: 'account_conflict',
            });
            expect(
                await database.select().from(aiCreditGrantsTable),
            ).toHaveLength(1);
            const events = await database
                .select()
                .from(adminAuditEventsTable)
                .where(eq(adminAuditEventsTable.action, 'ai_credits_adjusted'));
            expect(events).toHaveLength(2);
            expect(events).toContainEqual(
                expect.objectContaining({
                    outcome: 'rejected',
                    targetUserId: targetId,
                }),
            );
        });

        it('guards the last owner and records retention pruning', async () => {
            const { database, operator } = await seed();
            await operator.grant({
                actorEmail: 'owner@example.com',
                email: 'third@example.com',
                now,
                reason: 'Add a second operations owner',
            });
            await operator.revoke({
                actorEmail: 'third@example.com',
                email: 'owner@example.com',
                now,
                reason: 'Rotate primary operations owner',
            });
            await expect(
                operator.revoke({
                    actorEmail: 'third@example.com',
                    email: 'third@example.com',
                    now,
                    reason: 'Attempt to remove final owner',
                }),
            ).rejects.toBeInstanceOf(AdminLastOwnerForbiddenError);
            await expect(
                database
                    .select()
                    .from(adminAuditEventsTable)
                    .where(eq(adminAuditEventsTable.outcome, 'rejected')),
            ).resolves.toEqual([
                expect.objectContaining({
                    action: 'membership_revoked',
                    actorUserId: thirdId,
                    metadata: expect.objectContaining({
                        activeOwnerCount: 1,
                        rejection: 'last_owner_forbidden',
                        targetVersion: 1,
                    }),
                    targetUserId: thirdId,
                }),
            ]);

            await database.insert(adminAuditEventsTable).values({
                action: 'membership_granted',
                actorUserId: thirdId,
                correlationId: '0198c304-06db-7ed2-a917-ac60af3c5ea0',
                expiresAt: new Date('2026-08-19T09:00:00.000Z'),
                id: '0198c304-3f0d-7279-bfc6-1de92e25a20c',
                occurredAt: new Date('2025-08-19T09:00:00.000Z'),
                outcome: 'success',
                reason: 'Expired fixture audit event',
                targetUserId: thirdId,
            });
            const result = await operator.prune({
                actorEmail: 'third@example.com',
                now,
                reason: 'Apply the one-year audit retention policy',
            });
            expect(result.removed).toBe(1);
            expect(
                await database
                    .select()
                    .from(adminAuditEventsTable)
                    .where(eq(adminAuditEventsTable.action, 'audit_pruned')),
            ).toHaveLength(1);
        });
    },
);

async function seed(
    options: { ownerMembership?: boolean; targetVerified?: boolean } = {},
) {
    const sessionNow = new Date();
    const sessionAbsoluteExpiry = new Date(
        sessionNow.getTime() + 7 * 24 * 60 * 60_000,
    );
    const database = createDrizzleDatabase(client, databaseSchema);
    await database
        .insert(usersTable)
        .values([user(ownerId), user(targetId), user(thirdId)]);
    await database
        .insert(userEmailsTable)
        .values([
            email(
                '0198c301-05aa-7f38-b1fc-979a8dbc7fb2',
                ownerId,
                'owner@example.com',
                now,
            ),
            email(
                '0198c301-432e-7ee0-8eb5-8b08b5caab52',
                targetId,
                'target@example.com',
                options.targetVerified === false ? null : now,
            ),
            email(
                '0198c301-7ca1-76f3-bcf5-49e3a92b027e',
                thirdId,
                'third@example.com',
                now,
            ),
        ]);
    if (options.ownerMembership !== false) {
        await database.insert(adminMembershipsTable).values({
            grantReason: 'Initial administration owner bootstrap',
            grantedAt: now,
            grantedByUserId: ownerId,
            id: '0198c302-1e3e-7b03-a6a3-5a7dd9c24649',
            role: 'owner',
            updatedAt: now,
            userId: ownerId,
        });
    }
    await database.insert(authSessionsTable).values([
        {
            absoluteExpiresAt: sessionAbsoluteExpiry,
            authenticatedAt: sessionNow,
            authenticationMethod: 'password',
            createdAt: sessionNow,
            familyId: '0198c302-5de9-7cf2-9a3f-dda74e1768bf',
            id: '0198c302-93c8-7536-a0e5-055605f614db',
            refreshTokenDigest: 'B'.repeat(43),
            updatedAt: sessionNow,
            userId: ownerId,
        },
        {
            absoluteExpiresAt: sessionAbsoluteExpiry,
            authenticatedAt: sessionNow,
            authenticationMethod: 'password',
            createdAt: sessionNow,
            familyId: '0198c302-59e1-7717-9bf4-5d8964f93c8e',
            id: '0198c302-91ba-7a64-910f-1a72a67012d5',
            refreshTokenDigest: 'A'.repeat(43),
            updatedAt: sessionNow,
            userId: targetId,
        },
    ]);
    const journal = {
        recordCancellation: vi.fn().mockResolvedValue(undefined),
    };
    return {
        database,
        journal,
        operator: new DrizzleAdministrationOperator(database),
        store: new DrizzleAdministrationStore(database, journal),
    };
}

async function pendingDeletion(
    database: Awaited<ReturnType<typeof seed>>['database'],
) {
    const scheduledAt = new Date();
    const purgeAt = new Date(scheduledAt.getTime() + 30 * 24 * 60 * 60_000);
    await database
        .update(usersTable)
        .set({
            status: 'deletion_pending',
            version: 2,
        })
        .where(eq(usersTable.id, targetId));
    await database
        .update(authSessionsTable)
        .set({
            revokedAt: scheduledAt,
            revocationReason: 'account_deletion',
        })
        .where(eq(authSessionsTable.userId, targetId));
    await database.insert(accountDeletionRequestsTable).values({
        nextAttemptAt: purgeAt,
        purgeAt,
        scheduledAt,
        updatedAt: scheduledAt,
        userId: targetId,
    });
}

function user(id: string) {
    return {
        createdAt: now,
        id,
        status: 'active' as const,
        updatedAt: now,
        version: 1,
    };
}

function email(
    id: string,
    userId: string,
    value: string,
    verifiedAt: Date | null,
) {
    return {
        canonicalEmail: value,
        createdAt: now,
        email: value,
        id,
        isPrimary: true,
        updatedAt: now,
        userId,
        verifiedAt,
    };
}

function mutation(
    targetUserId: string,
    expectedVersion: number,
    reason: string,
) {
    return {
        actorSessionId: '0198c302-93c8-7536-a0e5-055605f614db',
        actorUserId: ownerId,
        audit: {
            correlationId: '0198c303-06db-7ed2-a917-ac60af3c5ea0',
            expiresAt: new Date('2027-08-20T09:00:00.000Z'),
            id: '0198c303-3f0d-7279-bfc6-1de92e25a20c',
            occurredAt: now,
        },
        expectedVersion,
        reason,
        targetUserId,
    };
}

function creditMutation(
    correlationId: string,
    auditId: string,
    expectedVersion: number,
) {
    return {
        actorSessionId: '0198c302-93c8-7536-a0e5-055605f614db',
        actorUserId: ownerId,
        audit: {
            correlationId,
            expiresAt: new Date('2027-08-20T09:00:00.000Z'),
            id: auditId,
            occurredAt: now,
        },
        expectedVersion,
        reason: 'Support approved this AI credit change',
        targetUserId: targetId,
    };
}
