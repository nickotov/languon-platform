import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../src/infrastructure/database/schema';
import type { AiCreditJobKind } from '../../../src/modules/ai-credits/application/ai-credit-participant';
import { sentenceAiJobsTable } from '../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import { dictionaryAiConfigurationRevisionsTable } from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textAiModelCatalog } from '../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { AiCreditInsufficientBalanceError } from '../../../src/modules/ai-credits/domain/ai-credit';
import {
    DrizzleAiCreditTransactionParticipant,
    type AiCreditTransaction,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { capabilityPolicyRevisionsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiAccountingReportSnapshotsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import {
    aiCreditGrantsTable,
    aiCreditGrantBalancesTable,
    aiCreditWalletTotalsTable,
    aiCreditHistoryTable,
    aiCreditReservationAllocationsTable,
    aiCreditReservationsTable,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryGenerationJobsTable,
} from '../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleAccountPurgeStore } from '../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
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

    async function purgeOwnerForDeletion(targetOwnerId = ownerId) {
        await withCredits(async (credits, transaction) => {
            const active = await transaction
                .select({ id: aiCreditReservationsTable.id })
                .from(aiCreditReservationsTable)
                .where(
                    and(
                        eq(aiCreditReservationsTable.ownerId, targetOwnerId),
                        eq(aiCreditReservationsTable.state, 'active'),
                    ),
                );
            for (const reservation of active)
                await credits.settleFailedAttempt({
                    ownerId: targetOwnerId,
                    reservationId: reservation.id,
                    settledAt: new Date(),
                });
        });
        const now = new Date();
        const workerId = 'ai-credit-participant-purge-fixture';
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending', updatedAt: now })
            .where(eq(usersTable.id, targetOwnerId));
        await database.insert(accountDeletionRequestsTable).values({
            userId: targetOwnerId,
            scheduledAt: new Date(now.getTime() - 120_000),
            purgeAt: new Date(now.getTime() - 60_000),
            nextAttemptAt: new Date(now.getTime() - 60_000),
            updatedAt: now,
        });
        const claim = await new DrizzleAccountPurgeStore(database).claimDue({
            now,
            workerId,
        });
        if (!claim || claim.userId !== targetOwnerId)
            throw new Error('Expected an actively leased deletion claim.');
        await withCredits((credits) =>
            credits.purgeOwner(targetOwnerId, {
                workerId,
                fencingToken: claim.fencingToken,
            }),
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

    async function sentenceCreditJob(
        kind: AiCreditJobKind,
        maximum: bigint,
        id = randomUUID(),
        policyMode: 'limited' | 'unlimited' = 'limited',
    ) {
        const dictionaryId = randomUUID();
        await database.insert(dictionariesTable).values({
            id: dictionaryId,
            ownerId,
            name: 'Credit fixture',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'de',
        });
        const model = textAiModelCatalog[0]!;
        let [revision] = await database
            .select()
            .from(dictionaryAiConfigurationRevisionsTable)
            .limit(1);
        if (!revision) {
            [revision] = await database
                .insert(dictionaryAiConfigurationRevisionsTable)
                .values({
                    id: randomUUID(),
                    version: 1,
                    createdByUserId: ownerId,
                    catalogSnapshot: {
                        ...model,
                        modelId: model.id,
                        enabledModelIds: [model.id],
                        supportedFormats: [...model.supportedFormats],
                    },
                })
                .returning();
        }
        if (!revision)
            throw new Error('Failed to create credit fixture revision');
        await database.transaction(async (transaction) => {
            await transaction.execute(
                sql`select set_config('languon.learning_execution_revision', '1', true), set_config('languon.text_ai_selection_revision', '1', true), set_config('languon.text_ai_capacity_revision', '1', true), set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
            await transaction.insert(sentenceAiJobsTable).values({
                id,
                learnerId: ownerId,
                dictionaryId,
                jobKind: kind as 'sentence-generation' | 'sentence-check',
                direction: 'source-to-target',
                operationId: randomUUID(),
                sessionId: randomUUID(),
                requestFingerprint: 'hmac-sha256:v1:' + 'b'.repeat(43),
                format:
                    kind === 'sentence-generation'
                        ? 'sentence-generation:v1'
                        : 'sentence-check:v1',
                authority: { kind: 'owner' },
                providerMaxCostMicrosPerAttempt: 100,
                providerMaxInputTokensPerAttempt: 100,
                providerMaxOutputTokensPerAttempt: 100,
                aiCreditAccounted: true,
                aiCreditMaxCreditsPerAttempt: Number(maximum),
                aiCreditPricingRevision: model.creditPricing.revision,
                aiCreditInputCreditsPerMillionTokens:
                    model.creditPricing.inputCreditsPerMillionTokens,
                aiCreditOutputCreditsPerMillionTokens:
                    model.creditPricing.outputCreditsPerMillionTokens,
                aiCreditPolicyMode: policyMode,
                attemptCount: 1,
                maxAttempts: 3,
                executionRevisionId: revision.id,
                selectedExecutionSnapshot: {
                    adapterRevision: model.adapterRevision,
                    aggregateBudget: model.aggregateBudget,
                    credentialReference: model.credentialReference,
                    creditPricing: {
                        ...model.creditPricing,
                        maxCreditsPerAttempt: Number(maximum),
                    },
                    enabledModelIds: [model.id],
                    modelId: model.id,
                    perCallMaxInputTokens: model.perCallMaxInputTokens,
                    perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                    providerId: model.providerId,
                    supportedFormats: [
                        kind === 'sentence-generation'
                            ? 'sentence-generation:v1'
                            : 'sentence-check:v1',
                    ],
                },
                inputPayload: {
                    schemaVersion: 1,
                    generationPolicyVersion: 1,
                    priorityEntryId: randomUUID(),
                    dictionaryId,
                    direction: 'source-to-target',
                    sourceLanguage: 'en',
                    targetLanguage: 'de',
                    candidates: [],
                },
                createdAt: instant(0),
                updatedAt: instant(0),
            });
        });
        return id;
    }

    it.each([
        'dictionary-generation',
        'sentence-generation',
        'sentence-check',
    ] as const)(
        'settles and releases typed %s attempts atomically',
        async (jobKind) => {
            await grant({
                amount: 200n,
                sourceReference: `grant:typed:${jobKind}`,
            });
            const jobId =
                jobKind === 'dictionary-generation'
                    ? await creditJob(60n)
                    : await sentenceCreditJob(jobKind, 60n);
            const reservationId = randomUUID();
            await withCredits(async (credits) => {
                await credits.reserveAttempt({
                    at: instant(1),
                    attempt: 1,
                    jobId,
                    jobKind,
                    maximumCredits: 60n,
                    ownerId,
                    reservationId,
                });
                await credits.markProviderDispatched({
                    dispatchedAt: instant(2),
                    ownerId,
                    reservationId,
                });
                expect(
                    await credits.settleAttempt({
                        measuredCredits: 20n,
                        measurement: 'provider_reported',
                        ownerId,
                        reservationId,
                        settledAt: instant(3),
                    }),
                ).toMatchObject({ chargedCredits: 20n, releasedCredits: 40n });
            });
            await database.transaction(async (transaction) => {
                await transaction.execute(
                    sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
                );
                await transaction
                    .update(
                        jobKind === 'dictionary-generation'
                            ? dictionaryGenerationJobsTable
                            : sentenceAiJobsTable,
                    )
                    .set({ attemptCount: 2 })
                    .where(
                        eq(
                            jobKind === 'dictionary-generation'
                                ? dictionaryGenerationJobsTable.id
                                : sentenceAiJobsTable.id,
                            jobId,
                        ),
                    );
            });
            const second = randomUUID();
            await withCredits(async (credits) => {
                await credits.reserveAttempt({
                    at: instant(4),
                    attempt: 2,
                    jobId,
                    jobKind,
                    maximumCredits: 60n,
                    ownerId,
                    reservationId: second,
                });
                await credits.releaseUndispatchedAttempt({
                    ownerId,
                    reservationId: second,
                    releasedAt: instant(5),
                });
                expect(
                    await credits.accountSummary(ownerId, instant(6)),
                ).toMatchObject({
                    availableCredits: 180n,
                    reservedCredits: 0n,
                });
            });
        },
    );

    it.each([
        {
            jobKind: 'sentence-generation' as const,
            measurement: 'estimated' as const,
            missingUsage: false,
        },
        {
            jobKind: 'sentence-check' as const,
            measurement: 'estimated' as const,
            missingUsage: false,
        },
        {
            jobKind: 'sentence-generation' as const,
            measurement: 'estimated' as const,
            missingUsage: true,
        },
        {
            jobKind: 'sentence-check' as const,
            measurement: 'estimated' as const,
            missingUsage: true,
        },
    ])(
        'settles $jobKind with $measurement usage (missing=$missingUsage)',
        async ({ jobKind, measurement, missingUsage }) => {
            await grant({ amount: 100n, sourceReference: 'grant:typed:usage' });
            const jobId = await sentenceCreditJob(jobKind, 60n);
            const reservationId = randomUUID();
            await withCredits(async (credits) => {
                await credits.reserveAttempt({
                    at: instant(1),
                    attempt: 1,
                    jobId,
                    jobKind,
                    maximumCredits: 60n,
                    ownerId,
                    reservationId,
                });
                await credits.markProviderDispatched({
                    dispatchedAt: instant(2),
                    ownerId,
                    reservationId,
                });
                if (!missingUsage) {
                    await expect(
                        credits.settleAttempt({
                            measuredCredits: 30n,
                            measurement,
                            ownerId,
                            reservationId,
                            settledAt: instant(3),
                        }),
                    ).rejects.toThrow(
                        'Estimated and unmetered settlement cannot claim measured credits.',
                    );
                }
                expect(
                    await credits.settleAttempt({
                        measuredCredits: null,
                        measurement,
                        ownerId,
                        reservationId,
                        settledAt: instant(3),
                    }),
                ).toMatchObject({
                    chargedCredits: 60n,
                    releasedCredits: 0n,
                });
            });
        },
    );

    it.each(['sentence-generation', 'sentence-check'] as const)(
        'rejects wrong owner and atomically rolls back %s credit admission',
        async (jobKind) => {
            await grant({
                amount: 200n,
                sourceReference: 'grant:typed:rollback',
            });
            const jobId = await sentenceCreditJob(jobKind, 60n);
            const otherOwner = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: otherOwner, status: 'active' });
            await withCredits(async (credits) =>
                credits.issueGrant({
                    amount: 100n,
                    createdAt: instant(0),
                    expiresAt: null,
                    ownerId: otherOwner,
                    source: 'admin',
                    sourceReference: 'grant:typed:other',
                }),
            );
            await expect(
                withCredits(async (credits) =>
                    credits.reserveAttempt({
                        at: instant(1),
                        attempt: 1,
                        jobId,
                        jobKind,
                        maximumCredits: 60n,
                        ownerId: otherOwner,
                        reservationId: randomUUID(),
                    }),
                ),
            ).rejects.toThrow();
            const reservationId = randomUUID();
            await expect(
                withCredits(async (credits) => {
                    await credits.reserveAttempt({
                        at: instant(1),
                        attempt: 1,
                        jobId,
                        jobKind,
                        maximumCredits: 60n,
                        ownerId,
                        reservationId,
                    });
                    throw new Error('rollback fixture');
                }),
            ).rejects.toThrow('rollback fixture');
            expect(
                await database.select().from(aiCreditReservationsTable),
            ).toEqual([]);
            await withCredits(async (credits) => {
                expect(
                    await credits.accountSummary(ownerId, instant(2)),
                ).toMatchObject({
                    availableCredits: 200n,
                    reservedCredits: 0n,
                });
            });
        },
    );

    it.each([
        'dictionary-generation',
        'sentence-generation',
        'sentence-check',
    ] as const)(
        'prevents erasing active %s credit reservations',
        async (jobKind) => {
            await grant({
                amount: 100n,
                sourceReference: 'grant:typed:activeerase',
            });
            const jobId =
                jobKind === 'dictionary-generation'
                    ? await creditJob(60n)
                    : await sentenceCreditJob(jobKind, 60n);
            const reservationId = randomUUID();
            await expect(
                withCredits((credits) =>
                    credits.reserveAttempt({
                        at: instant(1),
                        attempt: 1,
                        jobId,
                        jobKind,
                        maximumCredits: 61n,
                        ownerId,
                        reservationId,
                    }),
                ),
            ).rejects.toThrow();
            await withCredits((credits) =>
                credits.reserveAttempt({
                    at: instant(1),
                    attempt: 1,
                    jobId,
                    jobKind,
                    maximumCredits: 60n,
                    ownerId,
                    reservationId,
                }),
            );
            await expect(
                database
                    .delete(
                        jobKind === 'dictionary-generation'
                            ? dictionaryGenerationJobsTable
                            : sentenceAiJobsTable,
                    )
                    .where(
                        eq(
                            jobKind === 'dictionary-generation'
                                ? dictionaryGenerationJobsTable.id
                                : sentenceAiJobsTable.id,
                            jobId,
                        ),
                    ),
            ).rejects.toThrow();
            const [reservation] = await database
                .select()
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.id, reservationId));
            expect(reservation).toMatchObject({
                state: 'active',
                reservedCredits: 60n,
            });
        },
    );

    it('rejects cross-kind UUID replay and immutable kind mutation', async () => {
        await grant({ amount: 200n, sourceReference: 'grant:typed:collision' });
        const jobId = await creditJob(60n);
        await expect(
            sentenceCreditJob('sentence-generation', 60n, jobId),
        ).rejects.toThrow();
        const reservationId = randomUUID();
        await withCredits(async (credits) => {
            await credits.reserveAttempt({
                at: instant(1),
                attempt: 1,
                jobId,
                maximumCredits: 60n,
                ownerId,
                reservationId,
            });
        });
        await expect(
            withCredits(async (credits) =>
                credits.reserveAttempt({
                    at: instant(2),
                    attempt: 1,
                    jobId,
                    jobKind: 'sentence-generation',
                    maximumCredits: 60n,
                    ownerId,
                    reservationId,
                }),
            ),
        ).rejects.toThrow();
        await expect(
            database
                .update(aiCreditReservationsTable)
                .set({ jobKind: 'sentence-generation' })
                .where(eq(aiCreditReservationsTable.id, reservationId)),
        ).rejects.toThrow();
        await expect(
            database
                .update(aiCreditReservationsTable)
                .set({ jobKind: 'unknown' })
                .where(eq(aiCreditReservationsTable.id, reservationId)),
        ).rejects.toThrow();
        const [row] = await database
            .select()
            .from(aiCreditReservationsTable)
            .where(eq(aiCreditReservationsTable.id, reservationId));
        expect(row).toMatchObject({
            jobKind: 'dictionary-generation',
            state: 'active',
            reservedCredits: 60n,
        });
    });

    it('rejects invalid allocations after terminal private job erasure', async () => {
        const firstGrant = await grant({
            amount: 60n,
            sourceReference: 'grant:typed:erased:first',
        });
        const secondGrant = await grant({
            amount: 60n,
            sourceReference: 'grant:typed:erased:second',
        });
        const jobId = await sentenceCreditJob('sentence-check', 60n);
        const reservationId = randomUUID();
        await withCredits(async (credits) => {
            await credits.reserveAttempt({
                at: instant(1),
                attempt: 1,
                jobId,
                jobKind: 'sentence-check',
                maximumCredits: 60n,
                ownerId,
                reservationId,
            });
            await credits.releaseUndispatchedAttempt({
                ownerId,
                reservationId,
                releasedAt: instant(2),
            });
        });
        await database
            .update(sentenceAiJobsTable)
            .set({ executionState: 'cancelled', completedAt: instant(3) })
            .where(eq(sentenceAiJobsTable.id, jobId));
        await database
            .delete(sentenceAiJobsTable)
            .where(eq(sentenceAiJobsTable.id, jobId));
        await expect(
            database.transaction(async (transaction) => {
                await transaction
                    .insert(aiCreditReservationAllocationsTable)
                    .values({
                        reservationId,
                        grantId:
                            secondGrant.grantId === firstGrant.grantId
                                ? randomUUID()
                                : secondGrant.grantId,
                        allocatedCredits: 1n,
                    });
            }),
        ).rejects.toThrow();
        const [row] = await database
            .select()
            .from(aiCreditReservationsTable)
            .where(eq(aiCreditReservationsTable.id, reservationId));
        expect(row).toMatchObject({
            state: 'released',
            reservedCredits: 60n,
            chargedCredits: 0n,
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

    it.each([
        'dictionary-generation',
        'sentence-generation',
        'sentence-check',
    ] as const)(
        'pins %s admission policy for retries in both policy-change directions',
        async (jobKind) => {
            await grant({ amount: 200n, sourceReference: 'grant:policy-pin' });
            const limitedJobId =
                jobKind === 'dictionary-generation'
                    ? await creditJob(50n)
                    : await sentenceCreditJob(jobKind, 50n);
            const limitedAttemptOne = randomUUID();
            await withCredits(async (credits, transaction) => {
                await expect(
                    credits.reserveAttempt({
                        at: instant(10),
                        attempt: 1,
                        jobId: limitedJobId,
                        jobKind,
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
                    .update(
                        jobKind === 'dictionary-generation'
                            ? dictionaryGenerationJobsTable
                            : sentenceAiJobsTable,
                    )
                    .set({ attemptCount: 2, updatedAt: instant(13) })
                    .where(
                        eq(
                            jobKind === 'dictionary-generation'
                                ? dictionaryGenerationJobsTable.id
                                : sentenceAiJobsTable.id,
                            limitedJobId,
                        ),
                    );
                await expect(
                    credits.reserveAttempt({
                        at: instant(13),
                        attempt: 2,
                        jobId: limitedJobId,
                        jobKind,
                        maximumCredits: 50n,
                        ownerId,
                        reservationId: randomUUID(),
                    }),
                ).resolves.toMatchObject({
                    policy: { mode: 'limited', unlimitedUntil: null },
                    reservedCredits: 50n,
                });
            });

            const unlimitedJobId =
                jobKind === 'dictionary-generation'
                    ? await creditJob(50n, 'unlimited')
                    : await sentenceCreditJob(
                          jobKind,
                          50n,
                          randomUUID(),
                          'unlimited',
                      );
            const unlimitedAttemptOne = randomUUID();
            await withCredits(async (credits, transaction) => {
                await expect(
                    credits.reserveAttempt({
                        at: instant(20),
                        attempt: 1,
                        jobId: unlimitedJobId,
                        jobKind,
                        maximumCredits: 50n,
                        ownerId,
                        reservationId: unlimitedAttemptOne,
                    }),
                ).resolves.toMatchObject({
                    policy: {
                        mode: 'unlimited',
                        unlimitedUntil: instant(1_000),
                    },
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
                    .update(
                        jobKind === 'dictionary-generation'
                            ? dictionaryGenerationJobsTable
                            : sentenceAiJobsTable,
                    )
                    .set({ attemptCount: 2, updatedAt: instant(23) })
                    .where(
                        eq(
                            jobKind === 'dictionary-generation'
                                ? dictionaryGenerationJobsTable.id
                                : sentenceAiJobsTable.id,
                            unlimitedJobId,
                        ),
                    );
                await expect(
                    credits.reserveAttempt({
                        at: instant(23),
                        attempt: 2,
                        jobId: unlimitedJobId,
                        jobKind,
                        maximumCredits: 50n,
                        ownerId,
                        reservationId: randomUUID(),
                    }),
                ).resolves.toMatchObject({
                    policy: {
                        mode: 'unlimited',
                        unlimitedUntil: instant(1_000),
                    },
                    reservedCredits: 0n,
                });
            });
        },
    );

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
            await client.unsafe(
                `grant select on ai_credit_grant_balances, ai_capability_policy_revisions to ${role}`,
            );
            await client.unsafe(
                `grant select, insert on ai_action_charging_policies to ${role}`,
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

    it('marks reports dirty only for terminal consumed and removal deltas, never holds or releases', async () => {
        await database.insert(aiAccountingReportSnapshotsTable).values({
            key: 'wallet-dirty-test',
            from: instant(),
            to: new Date(instant().getTime() + 86_400_000),
            requestedAt: instant(),
        });
        const version = async () =>
            (await database.select().from(aiAccountingReportSnapshotsTable))[0]!
                .changeVersion;
        await grant({ amount: 100n });
        const releaseJob = await creditJob(60n);
        const releaseId = randomUUID();
        await withCredits(async (credits) => {
            await credits.reserveAttempt({
                ownerId,
                jobId: releaseJob,
                reservationId: releaseId,
                attempt: 1,
                at: instant(1),
                maximumCredits: 60n,
            });
            await credits.releaseUndispatchedAttempt({
                ownerId,
                reservationId: releaseId,
                releasedAt: instant(2),
            });
        });
        expect(await version()).toBe(0n);
        const chargedJob = await creditJob(60n);
        const chargedId = randomUUID();
        await withCredits(async (credits) => {
            await credits.reserveAttempt({
                ownerId,
                jobId: chargedJob,
                reservationId: chargedId,
                attempt: 1,
                at: instant(3),
                maximumCredits: 60n,
            });
            await credits.markProviderDispatched({
                ownerId,
                reservationId: chargedId,
                dispatchedAt: instant(4),
            });
            await credits.settleAttempt({
                ownerId,
                reservationId: chargedId,
                settledAt: instant(5),
                measurement: 'provider_reported',
                measuredCredits: 20n,
            });
        });
        expect(await version()).toBe(1n);
        await withCredits((credits) =>
            credits.adjustByAdmin({
                ownerId,
                amount: -10n,
                at: instant(6),
                expiresAt: null,
                expectedManagementVersion: 0,
                sourceReference: 'report-dirty-removal',
                reason: 'Remove unused value',
            }),
        );
        expect(await version()).toBe(2n);
    });

    it.each([false, true])(
        'releases technical failure without fabricated provider usage (dispatched=%s)',
        async (dispatched) => {
            await grant({ amount: 100n });
            const jobId = await creditJob(60n);
            const reservationId = randomUUID();
            await withCredits(async (credits) => {
                await credits.reserveAttempt({
                    ownerId,
                    jobId,
                    reservationId,
                    at: instant(1),
                    attempt: 1,
                    maximumCredits: 60n,
                });
                if (dispatched)
                    await credits.markProviderDispatched({
                        ownerId,
                        reservationId,
                        dispatchedAt: instant(2),
                    });
                expect(
                    await credits.settleFailedAttempt({
                        ownerId,
                        reservationId,
                        settledAt: instant(3),
                    }),
                ).toEqual({
                    chargedCredits: 0n,
                    releasedCredits: 60n,
                    measuredCredits: null,
                    measurement: 'technical_failure',
                });
                expect(
                    await credits.settleFailedAttempt({
                        ownerId,
                        reservationId,
                        settledAt: instant(4),
                    }),
                ).toMatchObject({
                    chargedCredits: 0n,
                    releasedCredits: 60n,
                    measurement: 'technical_failure',
                });
                expect(
                    await credits.accountSummary(ownerId, instant(5)),
                ).toMatchObject({
                    availableCredits: 100n,
                    consumedCredits: 0n,
                    reservedCredits: 0n,
                });
            });
            const [record] = await database
                .select()
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.id, reservationId));
            expect(record).toMatchObject({
                state: 'settled',
                chargedCredits: 0n,
                measuredCredits: null,
                measurement: 'technical_failure',
            });
        },
    );

    it('pins operator funding across retries without charging a limited job or rereading new policy', async () => {
        await database.insert(capabilityPolicyRevisionsTable).values({
            id: randomUUID(),
            capability: 'dictionary-generation',
            version: 1,
            funding: 'operator',
            createdAt: instant(),
            createdBy: ownerId,
            reason: 'Operator-funded generation test',
        });
        const jobId = await creditJob(20n);
        const reservationId = randomUUID();
        await withCredits(async (credits) => {
            expect(
                await credits.reserveAttempt({
                    ownerId,
                    jobId,
                    reservationId,
                    attempt: 1,
                    at: instant(1),
                    maximumCredits: 20n,
                }),
            ).toMatchObject({
                policy: { mode: 'unlimited' },
                reservedCredits: 0n,
            });
            await credits.releaseUndispatchedAttempt({
                ownerId,
                reservationId,
                releasedAt: instant(2),
            });
        });
        await database.insert(capabilityPolicyRevisionsTable).values({
            id: randomUUID(),
            capability: 'dictionary-generation',
            version: 2,
            funding: 'customer',
            createdAt: instant(3),
            createdBy: ownerId,
            reason: 'Charge new generation actions only',
        });
        await database.transaction(async (transaction) => {
            await transaction.execute(
                sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
            await transaction
                .update(dictionaryGenerationJobsTable)
                .set({ attemptCount: 2 })
                .where(eq(dictionaryGenerationJobsTable.id, jobId));
        });
        await withCredits(async (credits) => {
            expect(
                await credits.reserveAttempt({
                    ownerId,
                    jobId,
                    reservationId: randomUUID(),
                    attempt: 2,
                    at: instant(4),
                    maximumCredits: 20n,
                }),
            ).toMatchObject({
                policy: { mode: 'unlimited' },
                reservedCredits: 0n,
            });
        });
        const newJobId = await creditJob(20n);
        await expect(
            withCredits((credits) =>
                credits.reserveAttempt({
                    ownerId,
                    jobId: newJobId,
                    reservationId: randomUUID(),
                    attempt: 1,
                    at: instant(5),
                    maximumCredits: 20n,
                }),
            ),
        ).rejects.toBeInstanceOf(AiCreditInsufficientBalanceError);
    });

    it('maintains grant projections through partial settlement, expiry, removal, replay and rollback', async () => {
        const expiring = await grant({ amount: 60n, expiresAt: instant(100) });
        const permanent = await grant({ amount: 100n });
        const jobId = await creditJob(80n);
        const reservationId = randomUUID();
        const reserve = {
            at: instant(1),
            attempt: 1,
            jobId,
            maximumCredits: 80n,
            ownerId,
            reservationId,
        };
        await withCredits(async (credits) => {
            await credits.reserveAttempt(reserve);
            await credits.reserveAttempt(reserve);
            await credits.markProviderDispatched({
                ownerId,
                reservationId,
                dispatchedAt: instant(2),
            });
            await credits.settleAttempt({
                ownerId,
                reservationId,
                measuredCredits: 30n,
                measurement: 'provider_reported',
                settledAt: instant(101),
            });
            await credits.settleAttempt({
                ownerId,
                reservationId,
                measuredCredits: 30n,
                measurement: 'provider_reported',
                settledAt: instant(102),
            });
        });
        const balances = await database
            .select()
            .from(aiCreditGrantBalancesTable);
        expect(
            balances.find((row) => row.grantId === expiring.grantId),
        ).toMatchObject({
            remainingCredits: 30n,
            reservedCredits: 0n,
            consumedCredits: 30n,
            removedCredits: 0n,
        });
        expect(
            balances.find((row) => row.grantId === permanent.grantId),
        ).toMatchObject({
            remainingCredits: 100n,
            reservedCredits: 0n,
            consumedCredits: 0n,
        });
        await withCredits(async (credits) => {
            expect(
                await credits.accountSummary(ownerId, instant(103)),
            ).toMatchObject({
                availableCredits: 100n,
                consumedCredits: 30n,
                reservedCredits: 0n,
                nextExpirationAt: null,
            });
            await credits.adjustByAdmin({
                ownerId,
                amount: -10n,
                at: instant(104),
                expectedManagementVersion: 0,
                expiresAt: null,
                reason: 'Projection removal',
                sourceReference: 'projection-removal',
            });
        });
        const rollbackJob = await creditJob(20n);
        await expect(
            withCredits(async (credits) => {
                await credits.reserveAttempt({
                    ...reserve,
                    jobId: rollbackJob,
                    reservationId: randomUUID(),
                    at: instant(105),
                    maximumCredits: 20n,
                });
                throw new Error('projection rollback');
            }),
        ).rejects.toThrow('projection rollback');
        expect(
            await database.select().from(aiCreditWalletTotalsTable),
        ).toMatchObject([
            {
                ownerId,
                reservedCredits: 0n,
                consumedCredits: 30n,
            },
        ]);
        expect(
            await withCredits((credits) =>
                credits.accountSummary(ownerId, instant(106)),
            ),
        ).toMatchObject({
            availableCredits: 90n,
            consumedCredits: 30n,
            reservedCredits: 0n,
        });
    });

    it('revokes only unused purchase-lot value and rejects conflicting refund replay', async () => {
        await grant({ amount: 500n, expiresAt: instant(1_000) });
        const purchase = await withCredits((credits) =>
            credits.issueGrant({
                amount: 100n,
                createdAt: instant(),
                expiresAt: null,
                ownerId,
                source: 'purchase',
                sourceReference: 'projection-purchase',
            }),
        );
        const revoke = {
            ownerId,
            grantId: purchase.grantId,
            amount: 60n,
            sourceReference: 'projection-refund',
            reason: 'Purchase refund',
            at: instant(1),
        };
        expect(
            await withCredits((credits) =>
                credits.revokePurchaseGrantAvailable(revoke),
            ),
        ).toEqual({ created: true, revokedCredits: 60n });
        expect(
            await withCredits((credits) =>
                credits.revokePurchaseGrantAvailable(revoke),
            ),
        ).toEqual({ created: false, revokedCredits: 60n });
        await expect(
            withCredits((credits) =>
                credits.revokePurchaseGrantAvailable({
                    ...revoke,
                    amount: 61n,
                }),
            ),
        ).rejects.toThrow();
        await expect(
            withCredits((credits) =>
                credits.revokePurchaseGrantAvailable({
                    ...revoke,
                    sourceReference: 'too-large-refund',
                    amount: 41n,
                }),
            ),
        ).rejects.toBeInstanceOf(AiCreditInsufficientBalanceError);
        const [remaining] = await database
            .select()
            .from(aiCreditGrantBalancesTable)
            .where(eq(aiCreditGrantBalancesTable.grantId, purchase.grantId));
        expect(remaining).toMatchObject({
            remainingCredits: 40n,
            removedCredits: 60n,
            consumedCredits: 0n,
            reservedCredits: 0n,
        });
        expect(
            await withCredits((credits) =>
                credits.accountSummary(ownerId, instant(2)),
            ),
        ).toMatchObject({ availableCredits: 540n });
        const jobId = await creditJob(520n);
        const reservationId = randomUUID();
        await withCredits((credits) =>
            credits.reserveAttempt({
                ownerId,
                jobId,
                reservationId,
                attempt: 1,
                at: instant(3),
                maximumCredits: 520n,
            }),
        );
        await expect(
            withCredits((credits) =>
                credits.revokePurchaseGrantAvailable({
                    ...revoke,
                    sourceReference: 'held-refund',
                    amount: 21n,
                }),
            ),
        ).rejects.toBeInstanceOf(AiCreditInsufficientBalanceError);
        await withCredits(async (credits) => {
            await credits.markProviderDispatched({
                ownerId,
                reservationId,
                dispatchedAt: instant(4),
            });
            await credits.settleAttempt({
                ownerId,
                reservationId,
                settledAt: instant(5),
                measurement: 'provider_reported',
                measuredCredits: 510n,
            });
        });
        await expect(
            withCredits((credits) =>
                credits.revokePurchaseGrantAvailable({
                    ...revoke,
                    sourceReference: 'consumed-refund',
                    amount: 31n,
                }),
            ),
        ).rejects.toBeInstanceOf(AiCreditInsufficientBalanceError);
        expect(
            await database
                .select()
                .from(aiCreditGrantBalancesTable)
                .where(
                    eq(aiCreditGrantBalancesTable.grantId, purchase.grantId),
                ),
        ).toMatchObject([
            {
                remainingCredits: 30n,
                consumedCredits: 10n,
                reservedCredits: 0n,
                removedCredits: 60n,
            },
        ]);
    });

    it('guards direct projection edits and ledger deletion, and purges projections with the ledger', async () => {
        const issued = await grant({ amount: 100n });
        const jobId = await creditJob(20n);
        const reservationId = randomUUID();
        await withCredits((credits) =>
            credits.reserveAttempt({
                ownerId,
                jobId,
                reservationId,
                attempt: 1,
                at: instant(1),
                maximumCredits: 20n,
            }),
        );
        await expect(
            database
                .update(aiCreditGrantBalancesTable)
                .set({ remainingCredits: 90n })
                .where(eq(aiCreditGrantBalancesTable.grantId, issued.grantId)),
        ).rejects.toThrow();
        await expect(
            database
                .delete(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.id, reservationId)),
        ).rejects.toThrow();
        await expect(
            database
                .delete(aiCreditReservationAllocationsTable)
                .where(
                    eq(
                        aiCreditReservationAllocationsTable.reservationId,
                        reservationId,
                    ),
                ),
        ).rejects.toThrow();
        await purgeOwnerForDeletion();
        expect(
            await database.select().from(aiCreditGrantBalancesTable),
        ).toEqual([]);
        expect(await database.select().from(aiCreditWalletTotalsTable)).toEqual(
            [],
        );
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

        await purgeOwnerForDeletion();
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
