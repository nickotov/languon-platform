import { TransactionRollbackError } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { lockOwner } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/ai-credit-wallet-access';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { createLearnerAiCreditBalanceModule } from '../../../../src/modules/ai-credits/infrastructure/learner-ai-credit-balance-composition';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    aiCreditAccountsTable,
    aiCreditHistoryTable,
    aiCreditReservationsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryGenerationJobsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import type { AuthenticationService } from '../../../../src/modules/authentication/application/authentication-service';
import type { AccessTokenSigner } from '../../../../src/modules/authentication/application/ports/access-token';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

// Disposable local database only; no model/provider calls.
describe.runIf(isDatabaseIntegrationEnabled())(
    'learner credit balance real persistence',
    () => {
        let client: PostgresClient;
        let database: PostgresJsDatabase<typeof databaseSchema>;
        const ownerId = randomUUID();
        const otherId = randomUUID();
        const at = new Date('2026-10-25T10:00:00Z');
        beforeAll(async () => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            await database.insert(usersTable).values([
                { id: ownerId, status: 'active' },
                { id: otherId, status: 'active' },
            ]);
        });
        afterAll(async () => {
            await client?.end();
        });
        const credits = <T>(
            run: (
                participant: DrizzleAiCreditTransactionParticipant,
            ) => Promise<T>,
        ) =>
            database.transaction((tx) =>
                run(new DrizzleAiCreditTransactionParticipant(tx)),
            );
        function module() {
            return createLearnerAiCreditBalanceModule({
                database,
                accessTokens: {
                    verify: async () => ({
                        userId: ownerId,
                        sessionId: 'active-session',
                    }),
                } as unknown as AccessTokenSigner,
                authentication: {
                    requireActiveSession: async () => ({}),
                } as unknown as AuthenticationService,
                policy: new AuthHttpPolicy({
                    allowedOrigins: ['https://app.example'],
                    appEnvironment: 'test',
                    refreshTokenTtlSeconds: 100,
                }),
            });
        }
        it('defaults missing wallets to zero and does not create accounts, history or holds', async () => {
            const balances = module().balances;
            expect(await balances.get(ownerId, at)).toEqual({
                mode: 'limited',
                availableCredits: '0',
            });
            expect(await database.select().from(aiCreditAccountsTable)).toEqual(
                [],
            );
            expect(await database.select().from(aiCreditHistoryTable)).toEqual(
                [],
            );
            expect(
                await database.select().from(aiCreditReservationsTable),
            ).toEqual([]);
        });
        it('excludes expired lots and held credits, isolates owners and makes no ledger writes', async () => {
            await credits(async (participant) => {
                for (const input of [
                    { ownerId, amount: 20125n, expiresAt: null },
                    { ownerId, amount: 100000n, expiresAt: at },
                    { ownerId: otherId, amount: 999000n, expiresAt: null },
                ])
                    await participant.issueGrant({
                        ...input,
                        source: 'admin',
                        sourceReference: randomUUID(),
                        createdAt: new Date(at.getTime() - 1000),
                    });
            });
            const dictionaryId = randomUUID();
            const jobId = randomUUID();
            await database.insert(dictionariesTable).values({
                id: dictionaryId,
                ownerId,
                name: 'Balance test',
                sourceLanguageTag: 'en',
                targetLanguageTag: 'fr',
            });
            await database.insert(dictionaryGenerationJobsTable).values({
                aiCreditAccounted: true,
                aiCreditInputCreditsPerMillionTokens: 1000000,
                aiCreditMaxCreditsPerAttempt: 5000,
                aiCreditOutputCreditsPerMillionTokens: 3000000,
                aiCreditPolicyMode: 'limited',
                aiCreditPricingRevision: 1,
                attemptCount: 1,
                createdAt: at,
                dictionaryId,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                format: 'card-authoring:v1',
                id: jobId,
                idempotencyKey: randomUUID(),
                kind: 'card-authoring',
                nextAttemptAt: at,
                ownerId,
                requestFingerprint: `hmac-sha256:v1:${'b'.repeat(43)}`,
                sourceLanguageTag: 'en',
                targetLanguageTag: 'fr',
                updatedAt: at,
            });
            await credits((participant) =>
                participant.reserveAttempt({
                    at,
                    attempt: 1,
                    jobId,
                    maximumCredits: 5000n,
                    ownerId,
                    reservationId: randomUUID(),
                }),
            );
            const historyBefore = await database
                .select()
                .from(aiCreditHistoryTable);
            const reservationsBefore = await database
                .select()
                .from(aiCreditReservationsTable);
            const m = module();
            expect(await m.balances.get(ownerId, at)).toEqual({
                mode: 'limited',
                availableCredits: '15.125',
            });
            expect(await m.balances.get(otherId, at)).toEqual({
                mode: 'limited',
                availableCredits: '999',
            });
            const response = await m.routes.request('/users/me/ai-credits', {
                headers: { Authorization: 'Bearer header.payload.signature' },
            });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                mode: 'limited',
                availableCredits: '15.125',
            });
            expect(await database.select().from(aiCreditHistoryTable)).toEqual(
                historyBefore,
            );
            expect(
                await database.select().from(aiCreditReservationsTable),
            ).toEqual(reservationsBefore);
        });
        it('reads promptly from a consistent committed snapshot while a wallet writer holds its lock', async () => {
            let releaseWriter!: () => void;
            let writerReady!: () => void;
            const released = new Promise<void>((resolve) => {
                releaseWriter = resolve;
            });
            const ready = new Promise<void>((resolve) => {
                writerReady = resolve;
            });
            const writer = database
                .transaction(async (transaction) => {
                    await lockOwner({ transaction }, ownerId);
                    // Uncommitted changes must never enter the learner projection.
                    await new DrizzleAiCreditTransactionParticipant(
                        transaction,
                    ).issueGrant({
                        ownerId,
                        amount: 1000000n,
                        source: 'admin',
                        sourceReference: randomUUID(),
                        createdAt: at,
                        expiresAt: null,
                    });
                    writerReady();
                    await released;
                    // Roll back the synthetic writer once the concurrent read finishes.
                    transaction.rollback();
                })
                .catch((error: Error) => {
                    if (!(error instanceof TransactionRollbackError))
                        throw error;
                });
            await ready;
            let deadline: ReturnType<typeof setTimeout> | undefined;
            try {
                const response = await Promise.race([
                    module().routes.request('/users/me/ai-credits', {
                        headers: {
                            Authorization: 'Bearer header.payload.signature',
                        },
                    }),
                    new Promise<never>((_, reject) => {
                        deadline = setTimeout(
                            () =>
                                reject(
                                    new Error(
                                        'Balance read waited for the wallet writer lock.',
                                    ),
                                ),
                            1000,
                        );
                    }),
                ]);
                expect(response.status).toBe(200);
                expect(await response.json()).toEqual({
                    mode: 'limited',
                    availableCredits: '15.125',
                });
            } finally {
                clearTimeout(deadline);
                releaseWriter();
                await writer;
            }
            expect(await module().balances.get(ownerId, at)).toEqual({
                mode: 'limited',
                availableCredits: '15.125',
            });
        });
        it('honors effective unlimited access and its expiry without changing the wallet', async () => {
            await credits((participant) =>
                participant.updatePolicy({
                    ownerId,
                    at,
                    mode: 'unlimited',
                    unlimitedUntil: new Date(at.getTime() + 1000),
                    expectedManagementVersion: 0,
                    reason: 'Synthetic policy',
                }),
            );
            const balances = module().balances;
            expect(await balances.get(ownerId, at)).toEqual({
                mode: 'unlimited',
                availableCredits: null,
            });
            expect(
                await balances.get(ownerId, new Date(at.getTime() + 1000)),
            ).toEqual({ mode: 'limited', availableCredits: '15.125' });
        });
    },
);
