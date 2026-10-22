import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    aiCreditActionsTable,
    aiCreditActionAttemptsTable,
    aiCreditActionQuotesTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import {
    ActionAllowanceConfirmationRequired,
    authorizeActionAllowance,
    withActionAllowanceConsent,
    withActionQuotePersistence,
} from '../../../../src/modules/ai-credits/infrastructure/action-allowance-consent';
import { AiCreditInsufficientBalanceError } from '../../../../src/modules/ai-credits/domain/ai-credit';
import { removeExpiredActionQuotes } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-maintenance';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'shared reduced action consent',
    () => {
        let client: PostgresClient;
        let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
        let ownerId: string;
        const at = new Date();
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 60000);
        afterAll(async () => client?.end());
        beforeEach(async () => {
            await client`truncate users cascade`;
            ownerId = randomUUID();
            await db
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 120n,
                    createdAt: at,
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );
        });
        const request = (scope = 'dictionary-generation') => ({
            ownerId,
            scope,
            requestKey: randomUUID(),
            fingerprint: 'synthetic-original-request',
            authorization: {
                model: 'synthetic-model',
                tariffVersion: 1,
                budget: '1',
            },
            funding: 'customer' as const,
            tariff: {
                inputCreditsPerMillionTokens: '1000',
                outputCreditsPerMillionTokens: '1000',
            },
            budgetMilli: 1000n,
            maximumMilli: 1100n,
            inputTokens: 100,
            outputLimit: 1000,
            providerBudget: {
                maxInputTokensPerAttempt: 10000,
                maxOutputTokensPerAttempt: 10000,
                maxCostMicrosPerAttempt: 100000,
                inputCostMicrosPerMillionTokens: 1,
                outputCostMicrosPerMillionTokens: 1,
            },
            at,
        });
        const offer = async (input: ReturnType<typeof request>) => {
            try {
                await withActionQuotePersistence(db, () =>
                    db.transaction((tx) => authorizeActionAllowance(tx, input)),
                );
                throw new Error('Expected offer.');
            } catch (error) {
                expect(error).toBeInstanceOf(
                    ActionAllowanceConfirmationRequired,
                );
                return error as ActionAllowanceConfirmationRequired;
            }
        };
        it.each([
            'dictionary-generation',
            'sentence-generation',
            'text-translation',
            'portrait-interview',
        ])(
            'retains only a nonspending %s quote then pins exact consent',
            async (scope) => {
                const input = request(scope);
                const rolledBackMarker = randomUUID();
                let quoted: ActionAllowanceConfirmationRequired | undefined;
                try {
                    await withActionQuotePersistence(db, () =>
                        db.transaction(async (tx) => {
                            await tx.insert(usersTable).values({
                                id: rolledBackMarker,
                                status: 'active',
                            });
                            return authorizeActionAllowance(tx, input);
                        }),
                    );
                } catch (error) {
                    quoted = error as ActionAllowanceConfirmationRequired;
                }
                expect(quoted).toBeInstanceOf(
                    ActionAllowanceConfirmationRequired,
                );
                expect(quoted!.quote).toMatchObject({
                    maximumCredits: '0.12',
                    approximateOutputTokens: 20,
                });
                expect(
                    await db
                        .select()
                        .from(usersTable)
                        .where(eq(usersTable.id, rolledBackMarker)),
                ).toHaveLength(0);
                expect(
                    await db.select().from(aiCreditActionsTable),
                ).toHaveLength(0);
                expect(
                    await db.select().from(aiCreditActionAttemptsTable),
                ).toHaveLength(0);
                expect(
                    await db.select().from(aiCreditActionQuotesTable),
                ).toHaveLength(1);
                const accepted = await withActionAllowanceConsent(
                    quoted!.quote.id,
                    () =>
                        db.transaction((tx) =>
                            authorizeActionAllowance(tx, input),
                        ),
                );
                expect(accepted).toEqual({
                    holdMaximumMilli: 120n,
                    outputLimit: 20,
                });
            },
        );
        it('removes only expired offers in bounded maintenance batches', async () => {
            const first = await offer(request());
            const second = await offer(request());
            const current = await offer(request());
            for (const expired of [first, second])
                await db
                    .update(aiCreditActionQuotesTable)
                    .set({ expiresAt: new Date(at.getTime() - 1000) })
                    .where(eq(aiCreditActionQuotesTable.id, expired.quote.id));
            expect(
                await db.transaction((tx) =>
                    removeExpiredActionQuotes(tx, at, 1),
                ),
            ).toBe(1);
            expect(
                await db.transaction((tx) =>
                    removeExpiredActionQuotes(tx, at, 1),
                ),
            ).toBe(1);
            expect(
                await db.transaction((tx) =>
                    removeExpiredActionQuotes(tx, at, 1),
                ),
            ).toBe(0);
            expect(
                await db.select().from(aiCreditActionQuotesTable),
            ).toMatchObject([{ id: current.quote.id }]);
        });

        it('concurrent identical offers converge on one server nonce', async () => {
            const input = request();
            const offered = await Promise.all([offer(input), offer(input)]);
            expect(offered[0]!.quote.id).toBe(offered[1]!.quote.id);
            expect(
                await db.select().from(aiCreditActionQuotesTable),
            ).toHaveLength(1);
            expect(await db.select().from(aiCreditActionsTable)).toHaveLength(
                0,
            );
        });
        it('requires a refreshed offer after concurrent available-credit removal', async () => {
            const input = request();
            const first = await offer(input);
            await db.transaction(async (tx) => {
                const wallet = new DrizzleAiCreditTransactionParticipant(tx);
                const summary = await wallet.accountSummary(ownerId, at);
                await wallet.adjustByAdmin({
                    ownerId,
                    amount: -10n,
                    at,
                    expectedManagementVersion: summary.managementVersion,
                    expiresAt: null,
                    reason: 'Synthetic concurrent learner spending',
                    sourceReference: randomUUID(),
                });
            });
            const refreshed = await withActionAllowanceConsent(
                first.quote.id,
                () => offer(input),
            );
            expect(refreshed.quote.id).not.toBe(first.quote.id);
            expect(refreshed.quote).toMatchObject({
                maximumCredits: '0.11',
                approximateOutputTokens: 10,
            });
            expect(await db.select().from(aiCreditActionsTable)).toHaveLength(
                0,
            );
        });
        it('never increases accepted terms after top-up and retains a pending offer on retry', async () => {
            const input = request();
            const first = await offer(input);
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 10000n,
                    createdAt: at,
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );
            expect((await offer(input)).quote.id).toBe(first.quote.id);
            expect(
                await withActionAllowanceConsent(first.quote.id, () =>
                    db.transaction((tx) => authorizeActionAllowance(tx, input)),
                ),
            ).toEqual({ holdMaximumMilli: 120n, outputLimit: 20 });
        });
        it('refreshes changed pricing authorization and rejects input without any affordable output', async () => {
            const input = request();
            const first = await offer(input);
            const changed = {
                ...input,
                authorization: { ...input.authorization, tariffVersion: 2 },
            };
            expect(
                (
                    await withActionAllowanceConsent(first.quote.id, () =>
                        offer(changed),
                    )
                ).quote.id,
            ).not.toBe(first.quote.id);
            await expect(
                db.transaction((tx) =>
                    authorizeActionAllowance(tx, {
                        ...request(),
                        inputTokens: 120,
                    }),
                ),
            ).rejects.toBeInstanceOf(AiCreditInsufficientBalanceError);
            expect(await db.select().from(aiCreditActionsTable)).toHaveLength(
                0,
            );
        });
    },
);
