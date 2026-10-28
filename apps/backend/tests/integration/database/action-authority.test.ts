import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleAccountPurgeStore } from '../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { DrizzleActionAccountingParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleAiCreditTransactionParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    aiCreditActionsTable as actions,
    aiCreditActionAttemptsTable as attempts,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { aiCreditActionAuthoritiesTable as authorities } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-authority-schema';
import { conversationTurnsTable as turns } from '../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { defaultDictionaryGenerationProviderBudgetPolicy as budget } from '../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import {
    reserveConversationActionFixture,
    seedConversationActionAuthorityFixture,
    settleConversationActionFixture,
} from '../support/accounting-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'action authority and immutable terminal proof',
    () => {
        let client: PostgresClient;
        let database: PostgresJsDatabase<typeof databaseSchema>;
        let ownerId: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        });
        beforeEach(async () => {
            ownerId = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
            await database.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 5000n,
                    source: 'admin',
                    sourceReference: randomUUID(),
                    createdAt: new Date(),
                    expiresAt: null,
                }),
            );
        });
        afterAll(async () => client.end());
        const reserve = () =>
            database.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    maximumMilli: 1000n,
                }),
            );
        const purgeOwnerForDeletion = async () => {
            const now = new Date();
            const workerId = 'action-authority-purge-fixture';
            await database
                .update(usersTable)
                .set({ status: 'deletion_pending', updatedAt: now })
                .where(eq(usersTable.id, ownerId));
            await database.insert(accountDeletionRequestsTable).values({
                userId: ownerId,
                scheduledAt: new Date(now.getTime() - 120_000),
                purgeAt: new Date(now.getTime() - 60_000),
                nextAttemptAt: new Date(now.getTime() - 60_000),
                updatedAt: now,
            });
            const claim = await new DrizzleAccountPurgeStore(database).claimDue(
                { now, workerId },
            );
            if (!claim || claim.userId !== ownerId)
                throw new Error('Expected an actively leased deletion claim.');
            await database.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).purgeOwner(
                    ownerId,
                    { workerId, fencingToken: claim.fencingToken },
                ),
            );
        };

        it('rejects an operator action without immutable policy and feature admission', async () => {
            await reserve();
            const id = randomUUID();
            await expect(
                database.transaction((tx) =>
                    new DrizzleActionAccountingParticipant(tx).reserve({
                        id,
                        ownerId,
                        capability: 'conversation',
                        funding: 'operator',
                        policyVersion: 0,
                        tariff: {
                            inputCreditsPerMillionTokens: '1',
                            outputCreditsPerMillionTokens: '1',
                        },
                        budgetMilli: 0n,
                        holdMaximumMilli: 0n,
                        operatorMaximumMicros: 10000n,
                        at: new Date(),
                        deadlineAt: new Date(Date.now() + 60000),
                    }),
                ),
            ).rejects.toThrow();
            expect(
                await database.select().from(actions).where(eq(actions.id, id)),
            ).toEqual([]);
        });

        it.each(['operator', 'unlimited', 'version', 'capability'] as const)(
            'rejects forged %s authority against a real owned feature and customer policy',
            async (forgery) => {
                await expect(
                    database.transaction(async (tx) => {
                        const seed =
                            await seedConversationActionAuthorityFixture(tx, {
                                ownerId,
                                maximumMilli: 1000n,
                            });
                        await new DrizzleActionAccountingParticipant(
                            tx,
                        ).reserve({
                            id: seed.actionId,
                            ownerId,
                            capability:
                                forgery === 'capability'
                                    ? 'dictionary-generation'
                                    : 'conversation',
                            funding:
                                forgery === 'operator'
                                    ? 'operator'
                                    : forgery === 'unlimited'
                                      ? 'unlimited'
                                      : 'customer',
                            policyVersion:
                                seed.policy.version +
                                (forgery === 'version' ? 1 : 0),
                            tariff: seed.tariff,
                            budgetMilli: 1000n,
                            holdMaximumMilli: 1000n,
                            operatorMaximumMicros: 10000n,
                            at: seed.at,
                            deadlineAt: new Date(seed.at.getTime() + 60000),
                        });
                    }),
                ).rejects.toThrow();
            },
        );

        it('rejects a successful accounting outcome when the owned feature failed', async () => {
            const action = await reserve();
            await expect(
                database.transaction(async (tx) => {
                    await tx
                        .update(turns)
                        .set({
                            status: 'failed',
                            failureCode: 'synthetic_failure',
                        })
                        .where(eq(turns.id, action.id));
                    await new DrizzleActionAccountingParticipant(tx).settle({
                        actionId: action.id,
                        ownerId,
                        outcome: 'success',
                        at: new Date(),
                    });
                }),
            ).rejects.toThrow();
            expect(
                await database
                    .select()
                    .from(actions)
                    .where(eq(actions.id, action.id)),
            ).toMatchObject([{ state: 'active' }]);
            expect(
                await database
                    .select()
                    .from(turns)
                    .where(eq(turns.id, action.id)),
            ).toMatchObject([{ status: 'running' }]);
        });

        it('rejects terminal settlement while a provider attempt is still dispatched', async () => {
            const action = await reserve();
            const callId = randomUUID();
            await database.transaction((tx) =>
                new DrizzleActionAccountingParticipant(tx).admitAttempt({
                    actionId: action.id,
                    ownerId,
                    callId,
                    purpose: 'answer',
                    inputTokens: 2,
                    maxOutputTokens: 3,
                    budget,
                    executionWitness: {
                        jobId: action.id,
                        leaseToken: action.id,
                    },
                    at: new Date(),
                }),
            );
            await expect(
                database.transaction(async (tx) => {
                    await tx
                        .update(turns)
                        .set({
                            status: 'failed',
                            failureCode: 'synthetic_failure',
                        })
                        .where(eq(turns.id, action.id));
                    await new DrizzleActionAccountingParticipant(tx).settle({
                        actionId: action.id,
                        ownerId,
                        outcome: 'failure',
                        at: new Date(),
                    });
                }),
            ).rejects.toThrow();
            expect(
                await database
                    .select()
                    .from(attempts)
                    .where(eq(attempts.id, callId)),
            ).toMatchObject([{ state: 'dispatched' }]);
            await database.transaction((tx) =>
                settleConversationActionFixture(tx, {
                    ownerId,
                    actionId: action.id,
                    outcome: 'failure',
                }),
            );
        });

        it('rejects a settled provider attempt missing its linked expense, atomically restoring its reservation', async () => {
            const action = await reserve();
            const callId = randomUUID();
            await expect(
                database.transaction(async (tx) => {
                    const participant = new DrizzleActionAccountingParticipant(
                        tx,
                    );
                    await participant.admitAttempt({
                        actionId: action.id,
                        ownerId,
                        callId,
                        purpose: 'answer',
                        inputTokens: 2,
                        maxOutputTokens: 3,
                        budget,
                        executionWitness: {
                            jobId: action.id,
                            leaseToken: action.id,
                        },
                        at: new Date(),
                    });
                    // Deliberately bypass the checked observation helper, which
                    // now creates its canonical expense atomically.
                    await tx
                        .update(attempts)
                        .set({
                            state: 'settled',
                            successful: 1,
                            inputTokens: 2,
                            outputTokens: 3,
                            actualCostMicros: 1n,
                            settledAt: new Date(),
                        })
                        .where(eq(attempts.id, callId));
                }),
            ).rejects.toThrow();
            expect(
                await database
                    .select()
                    .from(attempts)
                    .where(eq(attempts.id, callId)),
            ).toEqual([]);
            expect(
                await database
                    .select()
                    .from(actions)
                    .where(eq(actions.id, action.id)),
            ).toMatchObject([{ state: 'active' }]);
        });

        it('denies caller-authored terminal proof and protects proof from mutation and deletion', async () => {
            const action = await reserve();
            await expect(
                database.insert(authorities).values({
                    actionId: action.id,
                    featureOwnerId: ownerId,
                    jobKind: 'conversation-turn',
                    terminalState: 'succeeded',
                    explicitStop: false,
                    outcome: 'success',
                    attestedAt: new Date(),
                }),
            ).rejects.toThrow();
            await database.transaction((tx) =>
                settleConversationActionFixture(tx, {
                    ownerId,
                    actionId: action.id,
                    outcome: 'failure',
                }),
            );
            await expect(
                database
                    .update(authorities)
                    .set({ outcome: 'success' })
                    .where(eq(authorities.actionId, action.id)),
            ).rejects.toThrow();
            await expect(
                database
                    .delete(authorities)
                    .where(eq(authorities.actionId, action.id)),
            ).rejects.toThrow();
            expect(
                await database
                    .select()
                    .from(authorities)
                    .where(eq(authorities.actionId, action.id)),
            ).toMatchObject([{ outcome: 'failure' }]);
        });

        it('retains verified numeric proof when settlement and private feature erasure share one transaction', async () => {
            const action = await reserve();
            await database.transaction(async (tx) => {
                await settleConversationActionFixture(tx, {
                    ownerId,
                    actionId: action.id,
                    outcome: 'failure',
                });
                await tx.delete(turns).where(eq(turns.id, action.id));
            });
            expect(
                await database
                    .select()
                    .from(turns)
                    .where(eq(turns.id, action.id)),
            ).toEqual([]);
            expect(
                await database
                    .select()
                    .from(authorities)
                    .where(eq(authorities.actionId, action.id)),
            ).toMatchObject([
                { outcome: 'failure', jobKind: 'conversation-turn' },
            ]);
            await purgeOwnerForDeletion();
            expect(
                await database
                    .select()
                    .from(authorities)
                    .where(eq(authorities.actionId, action.id)),
            ).toEqual([]);
        });
    },
);
