import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { AiCreditInsufficientBalanceError } from '../../../src/modules/ai-credits/domain/ai-credit';
import {
    DrizzleAiCreditTransactionParticipant,
    type AiCreditTransaction,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    aiCreditGrantsTable,
    aiCreditHistoryTable,
    aiCreditReservationAllocationsTable,
    aiCreditReservationsTable,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryGenerationJobsTable,
} from '../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const instant = (milliseconds = 0) =>
    new Date(Date.parse('2026-09-25T10:00:00.000Z') + milliseconds);

run('DrizzleAiCreditTransactionParticipant', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let ownerId: string;
    let creditDictionaryId: string;

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
    });

    beforeEach(async () => {
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        ownerId = randomUUID();
        await database.insert(usersTable).values({
            createdAt: instant(),
            id: ownerId,
            status: 'active',
            updatedAt: instant(),
        });
        creditDictionaryId = randomUUID();
        await database.insert(dictionariesTable).values({
            createdAt: instant(),
            id: creditDictionaryId,
            name: 'AI credit integration',
            ownerId,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
            updatedAt: instant(),
        });
    });

    afterAll(async () => client.end());

    async function withCredits<T>(
        callback: (
            credits: DrizzleAiCreditTransactionParticipant,
            transaction: AiCreditTransaction,
        ) => Promise<T>,
    ): Promise<T> {
        return database.transaction(async (transaction) =>
            callback(
                new DrizzleAiCreditTransactionParticipant(transaction),
                transaction,
            ),
        );
    }

    async function grant(input: {
        amount: bigint;
        expiresAt?: Date | null;
        sourceReference?: string;
    }) {
        return withCredits((credits) =>
            credits.issueGrant({
                amount: input.amount,
                createdAt: instant(),
                expiresAt: input.expiresAt ?? null,
                ownerId,
                source: 'admin',
                sourceReference:
                    input.sourceReference ?? `grant:${randomUUID()}`,
            }),
        );
    }

    async function creditJob(
        maximumCredits: bigint,
        policyMode: 'limited' | 'unlimited' = 'limited',
    ) {
        const id = randomUUID();
        await database.insert(dictionaryGenerationJobsTable).values({
            aiCreditAccounted: true,
            aiCreditInputCreditsPerMillionTokens: 1_000_000,
            aiCreditMaxCreditsPerAttempt: Number(maximumCredits),
            aiCreditOutputCreditsPerMillionTokens: 3_000_000,
            aiCreditPolicyMode: policyMode,
            aiCreditPricingRevision: 1,
            attemptCount: 1,
            createdAt: instant(),
            dictionaryId: creditDictionaryId,
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            format: 'card-authoring:v1',
            id,
            idempotencyKey: `credit-${randomUUID()}`,
            kind: 'card-authoring',
            nextAttemptAt: instant(),
            ownerId,
            requestFingerprint: `hmac-sha256:v1:${'b'.repeat(43)}`,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
            updatedAt: instant(),
        });
        return id;
    }

    it('treats a missing account as zero credit and does not create a reservation', async () => {
        const jobId = await creditJob(1n);
        await expect(
            withCredits((credits) =>
                credits.reserveAttempt({
                    at: instant(),
                    attempt: 1,
                    jobId,
                    maximumCredits: 1n,
                    ownerId,
                    reservationId: randomUUID(),
                }),
            ),
        ).rejects.toBeInstanceOf(AiCreditInsufficientBalanceError);

        await withCredits(async (credits) => {
            await expect(
                credits.accountSummary(ownerId, instant()),
            ).resolves.toMatchObject({
                availableCredits: 0n,
                managementVersion: 0,
                reservedCredits: 0n,
            });
        });
    });

    it('uses earliest expiry first and can settle a pre-expiry reservation after that lot expires', async () => {
        const early = await grant({
            amount: 50n,
            expiresAt: instant(100),
            sourceReference: 'grant:early',
        });
        await grant({
            amount: 50n,
            expiresAt: instant(500),
            sourceReference: 'grant:late',
        });
        const reservationId = randomUUID();
        const jobId = await creditJob(60n);

        await withCredits(async (credits, transaction) => {
            await credits.reserveAttempt({
                at: instant(10),
                attempt: 1,
                jobId,
                maximumCredits: 60n,
                ownerId,
                reservationId,
            });
            const allocations = await transaction
                .select()
                .from(aiCreditReservationAllocationsTable)
                .where(
                    eq(
                        aiCreditReservationAllocationsTable.reservationId,
                        reservationId,
                    ),
                );
            expect(
                allocations.find(
                    (allocation) => allocation.grantId === early.grantId,
                ),
            ).toMatchObject({ allocatedCredits: 50n });
            await credits.markProviderDispatched({
                dispatchedAt: instant(20),
                ownerId,
                reservationId,
            });
        });

        await withCredits(async (credits) => {
            await expect(
                credits.settleAttempt({
                    measuredCredits: 30n,
                    measurement: 'provider_reported',
                    ownerId,
                    reservationId,
                    settledAt: instant(200),
                }),
            ).resolves.toEqual({
                chargedCredits: 30n,
                measuredCredits: 30n,
                measurement: 'provider_reported',
                releasedCredits: 30n,
            });
            await expect(
                credits.accountSummary(ownerId, instant(200)),
            ).resolves.toMatchObject({
                availableCredits: 50n,
                reservedCredits: 0n,
            });
        });
    });

    it('pins admission policy for retries in both policy-change directions', async () => {
        await grant({ amount: 200n, sourceReference: 'grant:policy-pin' });
        const limitedJobId = await creditJob(50n);
        const limitedAttemptOne = randomUUID();
        await withCredits(async (credits, transaction) => {
            await expect(
                credits.reserveAttempt({
                    at: instant(10),
                    attempt: 1,
                    jobId: limitedJobId,
                    maximumCredits: 50n,
                    ownerId,
                    reservationId: limitedAttemptOne,
                }),
            ).resolves.toMatchObject({
                policy: { mode: 'limited' },
                reservedCredits: 50n,
            });
            await credits.releaseUndispatchedAttempt({
                ownerId,
                releasedAt: instant(11),
                reservationId: limitedAttemptOne,
            });
            await credits.updatePolicy({
                at: instant(12),
                expectedManagementVersion: 0,
                mode: 'unlimited',
                ownerId,
                reason: 'Enable support override',
                unlimitedUntil: instant(1_000),
            });
            await transaction.execute(
                sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
            await transaction
                .update(dictionaryGenerationJobsTable)
                .set({ attemptCount: 2, updatedAt: instant(13) })
                .where(eq(dictionaryGenerationJobsTable.id, limitedJobId));
            await expect(
                credits.reserveAttempt({
                    at: instant(13),
                    attempt: 2,
                    jobId: limitedJobId,
                    maximumCredits: 50n,
                    ownerId,
                    reservationId: randomUUID(),
                }),
            ).resolves.toMatchObject({
                policy: { mode: 'limited', unlimitedUntil: null },
                reservedCredits: 50n,
            });
        });

        const unlimitedJobId = await creditJob(50n, 'unlimited');
        const unlimitedAttemptOne = randomUUID();
        await withCredits(async (credits, transaction) => {
            await expect(
                credits.reserveAttempt({
                    at: instant(20),
                    attempt: 1,
                    jobId: unlimitedJobId,
                    maximumCredits: 50n,
                    ownerId,
                    reservationId: unlimitedAttemptOne,
                }),
            ).resolves.toMatchObject({
                policy: { mode: 'unlimited', unlimitedUntil: instant(1_000) },
                reservedCredits: 0n,
            });
            await credits.releaseUndispatchedAttempt({
                ownerId,
                releasedAt: instant(21),
                reservationId: unlimitedAttemptOne,
            });
            await credits.updatePolicy({
                at: instant(22),
                expectedManagementVersion: 1,
                mode: 'limited',
                ownerId,
                reason: 'End support override',
                unlimitedUntil: null,
            });
            await transaction.execute(
                sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
            await transaction
                .update(dictionaryGenerationJobsTable)
                .set({ attemptCount: 2, updatedAt: instant(23) })
                .where(eq(dictionaryGenerationJobsTable.id, unlimitedJobId));
            await expect(
                credits.reserveAttempt({
                    at: instant(23),
                    attempt: 2,
                    jobId: unlimitedJobId,
                    maximumCredits: 50n,
                    ownerId,
                    reservationId: randomUUID(),
                }),
            ).resolves.toMatchObject({
                policy: { mode: 'unlimited', unlimitedUntil: instant(1_000) },
                reservedCredits: 0n,
            });
        });
    });

    it('allows a restricted worker to reserve a limited retry after an admin removal', async () => {
        await grant({ amount: 200n, sourceReference: 'grant:worker-role' });
        const jobId = await creditJob(50n);
        const firstReservationId = randomUUID();
        await withCredits(async (credits) => {
            await credits.reserveAttempt({
                at: instant(10),
                attempt: 1,
                jobId,
                maximumCredits: 50n,
                ownerId,
                reservationId: firstReservationId,
            });
            await credits.releaseUndispatchedAttempt({
                ownerId,
                releasedAt: instant(11),
                reservationId: firstReservationId,
            });
            await credits.adjustByAdmin({
                amount: -25n,
                at: instant(12),
                expectedManagementVersion: 0,
                expiresAt: null,
                ownerId,
                reason: 'Exercise removal-backed worker reads',
                sourceReference: 'removal:worker-role',
            });
        });
        await database.transaction(async (transaction) => {
            await transaction.execute(
                sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
            await transaction
                .update(dictionaryGenerationJobsTable)
                .set({ attemptCount: 2, updatedAt: instant(12) })
                .where(eq(dictionaryGenerationJobsTable.id, jobId));
        });

        const role = `languon_credit_worker_${randomUUID().replaceAll('-', '')}`;
        const retryReservationId = randomUUID();
        await client.unsafe(`create role ${role}`);
        try {
            await client.unsafe(`grant usage on schema public to ${role}`);
            await client.unsafe(
                `grant select on users, dictionary_generation_jobs to ${role}`,
            );
            await client.unsafe(
                `grant select (user_id, mode, unlimited_until) on ai_credit_accounts to ${role}`,
            );
            await client.unsafe(
                `grant select (id, owner_id, amount, created_at, expires_at) on ai_credit_grants to ${role}`,
            );
            await client.unsafe(
                `grant select (id, owner_id) on ai_credit_admin_removals to ${role}`,
            );
            await client.unsafe(
                `grant select (removal_id, grant_id, allocated_credits) on ai_credit_admin_removal_allocations to ${role}`,
            );
            await client.unsafe(
                `grant select, insert on ai_credit_reservations, ai_credit_reservation_allocations to ${role}`,
            );
            await client.unsafe(
                `grant update (charged_credits, dispatched_at, measured_credits, measurement, settled_at, state) on ai_credit_reservations to ${role}`,
            );
            await client.unsafe(
                `grant update (settled_credits) on ai_credit_reservation_allocations to ${role}`,
            );
            await client.unsafe(`grant insert on ai_credit_history to ${role}`);
            await database.transaction(async (transaction) => {
                await transaction.execute(sql.raw(`set local role ${role}`));
                await expect(
                    new DrizzleAiCreditTransactionParticipant(
                        transaction,
                    ).reserveAttempt({
                        at: instant(13),
                        attempt: 2,
                        jobId,
                        maximumCredits: 50n,
                        ownerId,
                        reservationId: retryReservationId,
                    }),
                ).resolves.toMatchObject({
                    policy: { mode: 'limited' },
                    reservedCredits: 50n,
                });
            });
            await expect(
                database.transaction(async (transaction) => {
                    await transaction.execute(
                        sql.raw(`set local role ${role}`),
                    );
                    await transaction
                        .update(aiCreditReservationsTable)
                        .set({
                            chargedCredits: 50n,
                            dispatchedAt: instant(14),
                            measurement: 'estimated',
                            settledAt: instant(14),
                            state: 'settled',
                        })
                        .where(
                            eq(
                                aiCreditReservationsTable.id,
                                retryReservationId,
                            ),
                        );
                }),
            ).rejects.toThrow();
            await expect(
                database.transaction(async (transaction) => {
                    await transaction.execute(
                        sql.raw(`set local role ${role}`),
                    );
                    await transaction
                        .update(aiCreditReservationsTable)
                        .set({
                            chargedCredits: 0n,
                            dispatchedAt: instant(14),
                            measurement: 'estimated',
                            settledAt: instant(14),
                            state: 'settled',
                        })
                        .where(
                            eq(
                                aiCreditReservationsTable.id,
                                retryReservationId,
                            ),
                        );
                }),
            ).rejects.toThrow();
            await expect(
                database.transaction(async (transaction) => {
                    await transaction.execute(
                        sql.raw(`set local role ${role}`),
                    );
                    const forgedReservationId = randomUUID();
                    await transaction.insert(aiCreditReservationsTable).values({
                        attempt: 3,
                        createdAt: instant(15),
                        id: forgedReservationId,
                        jobId,
                        ownerId,
                        policyMode: 'limited',
                        reservedCredits: 50n,
                    });
                    const [lot] = await transaction
                        .select({ id: aiCreditGrantsTable.id })
                        .from(aiCreditGrantsTable)
                        .where(eq(aiCreditGrantsTable.ownerId, ownerId))
                        .limit(1);
                    if (!lot) throw new Error('Expected a credit grant.');
                    await transaction
                        .insert(aiCreditReservationAllocationsTable)
                        .values({
                            allocatedCredits: 50n,
                            grantId: lot.id,
                            reservationId: forgedReservationId,
                        });
                }),
            ).rejects.toThrow();
        } finally {
            await client.unsafe(`drop owned by ${role}`);
            await client.unsafe(`drop role ${role}`);
        }
    });

    it('is idempotent for grant and attempt identities, and records reported, estimated, and unlimited settlement', async () => {
        const sourceReference = 'grant:idempotent';
        const firstGrant = await grant({ amount: 150n, sourceReference });
        const replayedGrant = await grant({ amount: 150n, sourceReference });
        expect(firstGrant.created).toBe(true);
        expect(replayedGrant).toEqual({
            created: false,
            grantId: firstGrant.grantId,
        });

        const reportedReservationId = randomUUID();
        const reportedJobId = await creditJob(100n);
        const reportedInput = {
            at: instant(10),
            attempt: 1,
            jobId: reportedJobId,
            maximumCredits: 100n,
            ownerId,
            reservationId: reportedReservationId,
        };
        await withCredits(async (credits) => {
            await credits.reserveAttempt(reportedInput);
            await expect(
                credits.reserveAttempt(reportedInput),
            ).resolves.toMatchObject({
                reservationId: reportedReservationId,
                reservedCredits: 100n,
            });
            await credits.markProviderDispatched({
                dispatchedAt: instant(11),
                ownerId,
                reservationId: reportedReservationId,
            });
            await expect(
                credits.settleAttempt({
                    measuredCredits: 40n,
                    measurement: 'provider_reported',
                    ownerId,
                    reservationId: reportedReservationId,
                    settledAt: instant(12),
                }),
            ).resolves.toMatchObject({
                chargedCredits: 40n,
                releasedCredits: 60n,
            });
        });

        const estimatedReservationId = randomUUID();
        const estimatedJobId = await creditJob(50n);
        await withCredits(async (credits) => {
            await credits.reserveAttempt({
                at: instant(20),
                attempt: 1,
                jobId: estimatedJobId,
                maximumCredits: 50n,
                ownerId,
                reservationId: estimatedReservationId,
            });
            await credits.markProviderDispatched({
                dispatchedAt: instant(21),
                ownerId,
                reservationId: estimatedReservationId,
            });
            await expect(
                credits.settleAttempt({
                    measuredCredits: null,
                    measurement: 'estimated',
                    ownerId,
                    reservationId: estimatedReservationId,
                    settledAt: instant(22),
                }),
            ).resolves.toMatchObject({
                chargedCredits: 50n,
                measurement: 'estimated',
                releasedCredits: 0n,
            });
            await credits.updatePolicy({
                at: instant(30),
                expectedManagementVersion: 0,
                mode: 'unlimited',
                ownerId,
                reason: 'Temporary support override',
                unlimitedUntil: null,
            });
        });

        const unlimitedJobId = await creditJob(100n, 'unlimited');
        await withCredits(async (credits) => {
            const reservationId = randomUUID();
            await expect(
                credits.reserveAttempt({
                    at: instant(31),
                    attempt: 1,
                    jobId: unlimitedJobId,
                    maximumCredits: 100n,
                    ownerId,
                    reservationId,
                }),
            ).resolves.toMatchObject({
                policy: { mode: 'unlimited' },
                reservedCredits: 0n,
            });
            await credits.markProviderDispatched({
                dispatchedAt: instant(32),
                ownerId,
                reservationId,
            });
            await expect(
                credits.settleAttempt({
                    measuredCredits: 25n,
                    measurement: 'provider_reported',
                    ownerId,
                    reservationId,
                    settledAt: instant(33),
                }),
            ).resolves.toMatchObject({
                chargedCredits: 0n,
                measuredCredits: 25n,
                measurement: 'provider_reported',
                releasedCredits: 0n,
            });
            await expect(
                credits.accountSummary(ownerId, instant(33)),
            ).resolves.toMatchObject({
                availableCredits: 60n,
                consumedCredits: 90n,
                reservedCredits: 0n,
            });
        });
    });

    it('serializes concurrent reservation and admin removal so one cannot overspend the same grant', async () => {
        await grant({ amount: 100n, sourceReference: 'grant:race' });
        const reservationId = randomUUID();
        const jobId = await creditJob(100n);
        const results = await Promise.allSettled([
            withCredits((credits) =>
                credits.reserveAttempt({
                    at: instant(10),
                    attempt: 1,
                    jobId,
                    maximumCredits: 100n,
                    ownerId,
                    reservationId,
                }),
            ),
            withCredits((credits) =>
                credits.adjustByAdmin({
                    amount: -100n,
                    at: instant(10),
                    expectedManagementVersion: 0,
                    expiresAt: null,
                    ownerId,
                    reason: 'Remove an unused support grant',
                    sourceReference: 'removal:race',
                }),
            ),
        ]);
        expect(
            results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            results.filter((result) => result.status === 'rejected'),
        ).toHaveLength(1);

        await withCredits(async (credits) => {
            const summary = await credits.accountSummary(ownerId, instant(20));
            expect(
                summary.availableCredits + summary.reservedCredits,
            ).toBeLessThanOrEqual(100n);
            expect(summary.availableCredits).toBe(0n);
        });
    });

    it('database guards immutable rows, owner consistency, aggregate balance, and purge', async () => {
        const issued = await grant({
            amount: 100n,
            sourceReference: 'grant:guarded',
        });
        await expect(
            database
                .update(aiCreditGrantsTable)
                .set({ amount: 90n })
                .where(eq(aiCreditGrantsTable.id, issued.grantId)),
        ).rejects.toThrow();
        await expect(
            database
                .delete(aiCreditHistoryTable)
                .where(eq(aiCreditHistoryTable.ownerId, ownerId)),
        ).rejects.toThrow();

        const jobId = await creditJob(100n);
        const reservationId = randomUUID();
        await expect(
            database.transaction(async (transaction) => {
                await transaction.insert(aiCreditReservationsTable).values({
                    attempt: 1,
                    createdAt: instant(10),
                    id: reservationId,
                    jobId,
                    ownerId,
                    policyMode: 'limited',
                    reservedCredits: 100n,
                });
                await transaction
                    .insert(aiCreditReservationAllocationsTable)
                    .values({
                        allocatedCredits: 101n,
                        grantId: issued.grantId,
                        reservationId,
                    });
            }),
        ).rejects.toThrow();

        const otherOwnerId = randomUUID();
        await database.insert(usersTable).values({
            createdAt: instant(),
            id: otherOwnerId,
            status: 'active',
            updatedAt: instant(),
        });
        const otherDictionaryId = randomUUID();
        await database.insert(dictionariesTable).values({
            createdAt: instant(),
            id: otherDictionaryId,
            name: 'Other owner credits',
            ownerId: otherOwnerId,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
            updatedAt: instant(),
        });
        const otherJobId = randomUUID();
        await database.insert(dictionaryGenerationJobsTable).values({
            aiCreditAccounted: true,
            aiCreditInputCreditsPerMillionTokens: 1_000_000,
            aiCreditMaxCreditsPerAttempt: 100,
            aiCreditOutputCreditsPerMillionTokens: 3_000_000,
            aiCreditPricingRevision: 1,
            createdAt: instant(),
            dictionaryId: otherDictionaryId,
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            format: 'card-authoring:v1',
            id: otherJobId,
            idempotencyKey: `other-${randomUUID()}`,
            kind: 'card-authoring',
            nextAttemptAt: instant(),
            ownerId: otherOwnerId,
            requestFingerprint: `hmac-sha256:v1:${'c'.repeat(43)}`,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
            updatedAt: instant(),
        });
        const otherReservationId = randomUUID();
        await expect(
            database.transaction(async (transaction) => {
                await transaction.insert(aiCreditReservationsTable).values({
                    attempt: 1,
                    createdAt: instant(10),
                    id: otherReservationId,
                    jobId: otherJobId,
                    ownerId: otherOwnerId,
                    policyMode: 'limited',
                    reservedCredits: 100n,
                });
                await transaction
                    .insert(aiCreditReservationAllocationsTable)
                    .values({
                        allocatedCredits: 1n,
                        grantId: issued.grantId,
                        reservationId: otherReservationId,
                    });
            }),
        ).rejects.toThrow();

        await withCredits((credits) => credits.purgeOwner(ownerId));
        await expect(
            database
                .select()
                .from(aiCreditGrantsTable)
                .where(eq(aiCreditGrantsTable.ownerId, ownerId)),
        ).resolves.toHaveLength(0);
    });

    it('rejects credit-accounted worker state changes without the settlement capability', async () => {
        const dictionaryId = randomUUID();
        const jobId = randomUUID();
        await database.insert(dictionariesTable).values({
            createdAt: instant(),
            id: dictionaryId,
            name: 'Credit capability',
            ownerId,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
            updatedAt: instant(),
        });
        await database.insert(dictionaryGenerationJobsTable).values({
            aiCreditAccounted: true,
            aiCreditInputCreditsPerMillionTokens: 1_000_000,
            aiCreditMaxCreditsPerAttempt: 100,
            aiCreditOutputCreditsPerMillionTokens: 3_000_000,
            aiCreditPricingRevision: 1,
            createdAt: instant(),
            dictionaryId,
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            format: 'card-authoring:v1',
            id: jobId,
            idempotencyKey: `capability-${randomUUID()}`,
            kind: 'card-authoring',
            nextAttemptAt: instant(),
            ownerId,
            requestFingerprint: `hmac-sha256:v1:${'a'.repeat(43)}`,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
            updatedAt: instant(),
        });

        await expect(
            database
                .update(dictionaryGenerationJobsTable)
                .set({
                    completedAt: instant(1),
                    executionState: 'failed',
                    updatedAt: instant(1),
                })
                .where(eq(dictionaryGenerationJobsTable.id, jobId)),
        ).rejects.toThrow();

        const [rejectedJob] = await database
            .select({ state: dictionaryGenerationJobsTable.executionState })
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, jobId));
        expect(rejectedJob?.state).toBe('queued');

        await database.transaction(async (transaction) => {
            await transaction.execute(
                sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
            await transaction
                .update(dictionaryGenerationJobsTable)
                .set({
                    completedAt: instant(1),
                    executionState: 'failed',
                    updatedAt: instant(1),
                })
                .where(eq(dictionaryGenerationJobsTable.id, jobId));
        });
        const [job] = await database
            .select({ state: dictionaryGenerationJobsTable.executionState })
            .from(dictionaryGenerationJobsTable)
            .where(and(eq(dictionaryGenerationJobsTable.id, jobId)));
        expect(job?.state).toBe('failed');
    });
});
