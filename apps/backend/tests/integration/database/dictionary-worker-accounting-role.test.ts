import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { AiCreditInsufficientBalanceError } from '../../../src/modules/ai-credits/domain/ai-credit';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    DrizzleAiCreditTransactionParticipant,
    type AiCreditTransaction,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleActionAccountingParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import {
    aiCreditActionsTable,
    aiCreditActionAttemptsTable,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { aiProviderExpenseRecordsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { aiOperatorActionBudgetsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/operator-budget-schema';
import { conversationTurnsTable } from '../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import {
    reserveConversationActionFixture,
    recordConversationAttemptFixture,
    settleConversationActionFixture,
} from '../support/accounting-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

const budget = {
    maxInputTokensPerAttempt: 10000,
    maxOutputTokensPerAttempt: 10000,
    maxCostMicrosPerAttempt: 10000,
    inputCostMicrosPerMillionTokens: 1000,
    outputCostMicrosPerMillionTokens: 1000,
};

describe.runIf(isDatabaseIntegrationEnabled())(
    'restricted dictionary worker action accounting',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let ownerId: string;
        const role = `accounting_worker_${randomUUID().replaceAll('-', '')}`;
        let roleCreated = false;
        const restricted = <T>(
            callback: (tx: AiCreditTransaction) => Promise<T>,
        ) =>
            db.transaction(async (tx) => {
                await tx.execute(sql.raw(`SET LOCAL ROLE "${role}"`));
                const [identity] = await tx.execute<{ role_name: string }>(
                    sql`select current_user as role_name`,
                );
                expect(identity?.role_name).toBe(role);
                return callback(tx);
            });
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            await client.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
            roleCreated = true;
            const script = await readFile(
                new URL(
                    '../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                    import.meta.url,
                ),
                'utf8',
            );
            const grants = script
                .split('\n')
                .filter((line) => !line.startsWith('\\'))
                .join('\n')
                .replaceAll(':"dictionary_worker_role"', `"${role}"`);
            await client.unsafe(grants);
        }, 120000);
        afterAll(async () => {
            if (roleCreated) {
                await client.unsafe(`DROP OWNED BY "${role}"`);
                await client.unsafe(`DROP ROLE "${role}"`);
            }
            await client?.end();
        });
        beforeEach(async () => {
            await client`truncate ai_operator_attempt_costs, ai_operator_action_budgets, ai_operator_daily_budgets, ai_accounting_settings_revisions, users cascade`;
            ownerId = randomUUID();
            await db
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 1000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );
        });
        const reserve = () =>
            db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    maximumMilli: 600n,
                    operatorMaximumMicros: 10000n,
                    tariff: {
                        inputCreditsPerMillionTokens: '1000',
                        outputCreditsPerMillionTokens: '1000',
                    },
                }),
            );

        it.each(['success', 'failure'] as const)(
            'dispatches, records expense and settles %s through the exact deployment grants',
            async (outcome) => {
                // Admission and monetary policy are application authority; workers receive an existing hold.
                const action = await reserve();
                const before = await db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).accountSummary(ownerId, new Date()),
                );
                expect(before.availableCredits).toBe(400n);
                expect(before.reservedCredits).toBe(600n);
                const [claimed] = await db
                    .select()
                    .from(conversationTurnsTable)
                    .where(eq(conversationTurnsTable.id, action.id));
                const attempt = await restricted((tx) =>
                    new DrizzleActionAccountingParticipant(tx).admitAttempt({
                        actionId: action.id,
                        ownerId,
                        callId: randomUUID(),
                        purpose: 'answer',
                        inputTokens: 100,
                        maxOutputTokens: 100,
                        budget,
                        executionWitness: {
                            jobId: action.id,
                            leaseToken: claimed!.leaseToken!,
                        },
                        at: new Date(),
                    }),
                );
                await restricted((tx) =>
                    recordConversationAttemptFixture(tx, {
                        ownerId,
                        actionId: action.id,
                        callId: attempt.id,
                        successful: outcome === 'success',
                        usage: { inputTokens: 100, outputTokens: 100 },
                    }),
                );
                const settled = await restricted((tx) =>
                    settleConversationActionFixture(tx, {
                        ownerId,
                        actionId: action.id,
                        outcome,
                    }),
                );
                const expectedCharge = outcome === 'success' ? 200n : 0n;
                expect(settled.chargedMilli).toBe(expectedCharge);
                expect(settled.state).toBe('settled');
                const after = await db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).accountSummary(ownerId, new Date()),
                );
                expect(after.availableCredits).toBe(1000n - expectedCharge);
                expect(after.reservedCredits).toBe(0n);
                expect(after.consumedCredits).toBe(expectedCharge);
                const [storedAttempt] = await db
                    .select()
                    .from(aiCreditActionAttemptsTable)
                    .where(eq(aiCreditActionAttemptsTable.id, attempt.id));
                expect(storedAttempt).toMatchObject({
                    state: 'settled',
                    successful: outcome === 'success' ? 1 : 0,
                    inputTokens: 100,
                    outputTokens: 100,
                });
                const expenses = await db
                    .select()
                    .from(aiProviderExpenseRecordsTable)
                    .where(
                        eq(aiProviderExpenseRecordsTable.actionId, action.id),
                    );
                expect(expenses).toHaveLength(1);
                await restricted((tx) =>
                    tx.execute(
                        sql`select languon_record_text_provider_expense(${attempt.id}::uuid,NULL::jsonb)`,
                    ),
                );
                const canonical = {
                    attemptId: attempt.id,
                    actionId: action.id,
                    attemptReference: `conversation:${attempt.id}`,
                    providerId: 'synthetic',
                    modelId: 'synthetic',
                    measurement: 'measured',
                    costSource: 'calculated',
                    amountUsdMicros: '1',
                    occurredAt: attempt.createdAt.toISOString(),
                };
                for (const override of [
                    { providerId: 'wrong-provider' },
                    { modelId: 'wrong-model' },
                    { attemptReference: 'forged-reference' },
                    { amountUsdMicros: '0' },
                ]) {
                    await expect(
                        restricted((tx) =>
                            tx.execute(
                                sql`select languon_record_text_provider_expense(${attempt.id}::uuid,${JSON.stringify({ ...canonical, ...override })}::jsonb)`,
                            ),
                        ),
                    ).rejects.toMatchObject({ cause: { code: '23514' } });
                }

                expect(expenses[0]).toMatchObject({
                    attemptId: attempt.id,
                    amountUsdMicros: 1n,
                    costSource: 'calculated',
                });
                const [operator] = await db
                    .select()
                    .from(aiOperatorActionBudgetsTable)
                    .where(
                        eq(aiOperatorActionBudgetsTable.actionId, action.id),
                    );
                expect(operator?.state).toBe('settled');
                expect(operator?.consumedMicros).toBeGreaterThan(0n);
                const [feature] = await db
                    .select()
                    .from(conversationTurnsTable)
                    .where(eq(conversationTurnsTable.id, action.id));
                expect(feature?.status).toBe(
                    outcome === 'success' ? 'succeeded' : 'failed',
                );
                // Replay the terminal acknowledgement; it must neither charge nor append another expense.
                expect(
                    (
                        await restricted((tx) =>
                            settleConversationActionFixture(tx, {
                                ownerId,
                                actionId: action.id,
                                outcome,
                            }),
                        )
                    ).chargedMilli,
                ).toBe(expectedCharge);
                const [storedAction] = await db
                    .select()
                    .from(aiCreditActionsTable)
                    .where(eq(aiCreditActionsTable.id, action.id));
                expect(storedAction?.chargedMilli).toBe(expectedCharge);
                expect(
                    await db
                        .select()
                        .from(aiProviderExpenseRecordsTable)
                        .where(
                            eq(
                                aiProviderExpenseRecordsTable.actionId,
                                action.id,
                            ),
                        ),
                ).toHaveLength(1);
            },
        );

        it('denies direct grants, policy publication and compact counter mutations', async () => {
            await reserve();
            const forbidden: SQL[] = [
                sql`update ai_credit_grants set amount = amount + 1 where owner_id = ${ownerId}`,
                sql`update ai_credit_accounts set mode = 'unlimited' where user_id = ${ownerId}`,
                sql`insert into ai_capability_policy_revisions(id,capability,version,funding,created_at,reason) values(${randomUUID()},'conversation',999,'operator',now(),'Forbidden worker policy publication')`,
                sql`update ai_accounting_settings_revisions set default_max_credits_per_action = '1000'`,
                sql`update ai_credit_grant_balances set remaining_credits = 0 where owner_id = ${ownerId}`,
                sql`update ai_credit_wallet_totals set consumed_credits = 0 where owner_id = ${ownerId}`,
                sql`update ai_operator_daily_budgets set reserved_micros = 0`,
                sql`update text_ai_capacity_active_totals set cost = 0`,
                sql`insert into ai_credit_actions select * from ai_credit_actions limit 1`,
                sql`insert into ai_action_charging_policies select * from ai_action_charging_policies limit 1`,
                sql`insert into ai_credit_action_allocations select * from ai_credit_action_allocations limit 1`,
                sql`insert into ai_credit_action_attempts select * from ai_credit_action_attempts limit 1`,
                sql`insert into ai_operator_action_budgets select * from ai_operator_action_budgets limit 1`,
                sql`insert into ai_operator_attempt_costs select * from ai_operator_attempt_costs limit 1`,
                sql`insert into ai_provider_expense_records select * from ai_provider_expense_records limit 1`,
                sql`insert into sentence_ai_jobs select * from sentence_ai_jobs limit 1`,
                sql`insert into sentence_preparation_children select * from sentence_preparation_children limit 1`,
                sql`update ai_accounting_report_snapshots set change_version=9223372036854775807`,
                sql`select languon_mark_accounting_reports_dirty()`,
                sql`insert into ai_credit_reservations select * from ai_credit_reservations limit 1`,
                sql`insert into ai_credit_history select * from ai_credit_history limit 1`,
            ];
            for (const statement of forbidden)
                await expect(
                    restricted(async (tx) => {
                        await tx.execute(statement);
                        throw new Error(
                            'Forbidden worker mutation unexpectedly succeeded.',
                        );
                    }),
                ).rejects.toMatchObject({ cause: { code: '42501' } });
            const after = await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).accountSummary(
                    ownerId,
                    new Date(),
                ),
            );
            expect(after.availableCredits).toBe(400n);
            expect(after.reservedCredits).toBe(600n);
            expect(after.consumedCredits).toBe(0n);
        });

        it('rejects wrong-owner, missing, stale and expired typed lease witnesses without dispatch', async () => {
            const action = await reserve();
            const [claimed] = await db
                .select()
                .from(conversationTurnsTable)
                .where(eq(conversationTurnsTable.id, action.id));
            const dispatch = (
                leaseToken: string | undefined,
                actingOwner = ownerId,
                jobId = action.id,
            ) =>
                restricted((tx) =>
                    new DrizzleActionAccountingParticipant(tx).admitAttempt({
                        actionId: action.id,
                        ownerId: actingOwner,
                        callId: randomUUID(),
                        purpose: 'answer',
                        inputTokens: 100,
                        maxOutputTokens: 100,
                        budget: {
                            ...budget,
                            maxCostMicrosPerAttempt: 2147483647,
                        },
                        executionWitness: {
                            jobId,
                            ...(leaseToken ? { leaseToken } : {}),
                        },
                        at: new Date('2000-01-01T00:00:00Z'),
                    }),
                );
            await expect(
                dispatch(claimed!.leaseToken!, randomUUID()),
            ).rejects.toThrow();
            await expect(dispatch(undefined)).rejects.toMatchObject({
                cause: { code: '23514' },
            });
            await expect(dispatch(randomUUID())).rejects.toMatchObject({
                cause: { code: '23514' },
            });
            await expect(
                dispatch(claimed!.leaseToken!, ownerId, randomUUID()),
            ).rejects.toMatchObject({ cause: { code: '23514' } });
            await db
                .update(conversationTurnsTable)
                .set({ leaseUntil: new Date(Date.now() - 1000) })
                .where(eq(conversationTurnsTable.id, action.id));
            await expect(dispatch(claimed!.leaseToken!)).rejects.toMatchObject({
                cause: { code: '23514' },
            });
            expect(
                await db
                    .select()
                    .from(aiCreditActionAttemptsTable)
                    .where(eq(aiCreditActionAttemptsTable.actionId, action.id)),
            ).toHaveLength(0);
        });

        it('derives dispatch prices from pinned revisions and rejects dispatch replay', async () => {
            const action = await reserve();
            const [claimed] = await db
                .select()
                .from(conversationTurnsTable)
                .where(eq(conversationTurnsTable.id, action.id));
            const callId = randomUUID();
            const run = () =>
                restricted((tx) =>
                    new DrizzleActionAccountingParticipant(tx).admitAttempt({
                        actionId: action.id,
                        ownerId,
                        callId,
                        purpose: 'answer',
                        inputTokens: 100,
                        maxOutputTokens: 100,
                        budget: {
                            ...budget,
                            inputCostMicrosPerMillionTokens: 0,
                            outputCostMicrosPerMillionTokens: 0,
                            maxCostMicrosPerAttempt: 2147483647,
                        },
                        executionWitness: {
                            jobId: action.id,
                            leaseToken: claimed!.leaseToken!,
                        },
                        at: new Date(),
                    }),
                );
            const attempt = await run();
            expect(attempt.budget.inputCostMicrosPerMillionTokens).toBe(1000);
            expect(attempt.budget.outputCostMicrosPerMillionTokens).toBe(1000);
            expect(attempt.reservedCostMicros).toBe(2);
            await expect(
                restricted((tx) =>
                    tx.execute(
                        sql`select languon_record_text_provider_expense(${attempt.id}::uuid,NULL::jsonb)`,
                    ),
                ),
            ).rejects.toMatchObject({ cause: { code: '23514' } });
            await expect(
                restricted((tx) =>
                    tx.execute(
                        sql`select languon_record_text_provider_expense(${randomUUID()}::uuid,NULL::jsonb)`,
                    ),
                ),
            ).rejects.toMatchObject({ cause: { code: '23514' } });

            await expect(run()).rejects.toMatchObject({
                cause: { code: '23514' },
            });
        });

        it('caps a large exact budget before narrowing cheap-rate arithmetic to bigint', async () => {
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 10000000000000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );
            const action = await db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    maximumMilli: 10000000000000n,
                    operatorMaximumMicros: 10000n,
                    tariff: {
                        inputCreditsPerMillionTokens: '0.001',
                        outputCreditsPerMillionTokens: '0.001',
                    },
                }),
            );
            const [claimed] = await db
                .select()
                .from(conversationTurnsTable)
                .where(eq(conversationTurnsTable.id, action.id));
            const attempt = await restricted((tx) =>
                new DrizzleActionAccountingParticipant(tx).admitAttempt({
                    actionId: action.id,
                    ownerId,
                    callId: randomUUID(),
                    purpose: 'answer',
                    inputTokens: 1,
                    maxOutputTokens: 10000,
                    budget,
                    executionWitness: {
                        jobId: action.id,
                        leaseToken: claimed!.leaseToken!,
                    },
                    at: new Date(),
                }),
            );
            expect(attempt.outputLimit).toBe(10000);
        });

        it('enforces the pinned operational cohort cap independently of caller budget and USD headroom', async () => {
            const dispatch = async () => {
                const action = await db.transaction((tx) =>
                    reserveConversationActionFixture(tx, {
                        ownerId,
                        maximumMilli: 1n,
                        operatorMaximumMicros: 10000n,
                        tariff: {
                            inputCreditsPerMillionTokens: '0.001',
                            outputCreditsPerMillionTokens: '0.001',
                        },
                    }),
                );
                const [claimed] = await db
                    .select()
                    .from(conversationTurnsTable)
                    .where(eq(conversationTurnsTable.id, action.id));
                return restricted((tx) =>
                    new DrizzleActionAccountingParticipant(tx).admitAttempt({
                        actionId: action.id,
                        ownerId,
                        callId: randomUUID(),
                        purpose: 'answer',
                        inputTokens: 1,
                        maxOutputTokens: 10000,
                        budget: {
                            ...budget,
                            maxInputTokensPerAttempt: 2147483647,
                            maxOutputTokensPerAttempt: 2147483647,
                            maxCostMicrosPerAttempt: 2147483647,
                        },
                        executionWitness: {
                            jobId: action.id,
                            leaseToken: claimed!.leaseToken!,
                        },
                        at: new Date(),
                    }),
                );
            };
            const admitted = [];
            for (let index = 0; index < 3; index++) {
                const attempt = await dispatch();
                expect(attempt.outputLimit).toBe(10000);
                admitted.push(attempt);
            }
            const first = admitted[0]!;
            await restricted((tx) =>
                new DrizzleActionAccountingParticipant(tx).recordAttempt({
                    actionId: first.actionId,
                    ownerId,
                    callId: first.id,
                    successful: false,
                    usage: { inputTokens: 1, outputTokens: 10000 },
                    at: new Date('2000-01-01T00:00:00Z'),
                }),
            );
            const [observed] = await db
                .select()
                .from(aiCreditActionAttemptsTable)
                .where(eq(aiCreditActionAttemptsTable.id, first.id));
            expect(observed!.settledAt!.getTime()).toBeGreaterThanOrEqual(
                first.createdAt.getTime(),
            );
            expect(observed!.settledAt!.getTime()).toBeGreaterThan(
                Date.now() - 10000,
            );
            await expect(dispatch()).rejects.toThrow(
                'Provider operational capacity is unavailable',
            );
        });

        it('rolls back a dispatch denial savepoint before terminal failure releases the existing hold', async () => {
            const action = await db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    maximumMilli: 1n,
                    operatorMaximumMicros: 10000n,
                    tariff: {
                        inputCreditsPerMillionTokens: '1000',
                        outputCreditsPerMillionTokens: '1000',
                    },
                }),
            );
            const [claimed] = await db
                .select()
                .from(conversationTurnsTable)
                .where(eq(conversationTurnsTable.id, action.id));
            await restricted(async (tx) => {
                await expect(
                    new DrizzleActionAccountingParticipant(tx).admitAttempt({
                        actionId: action.id,
                        ownerId,
                        callId: randomUUID(),
                        purpose: 'answer',
                        inputTokens: 100,
                        maxOutputTokens: 1,
                        budget,
                        executionWitness: {
                            jobId: action.id,
                            leaseToken: claimed!.leaseToken!,
                        },
                        at: new Date(),
                    }),
                ).rejects.toBeInstanceOf(AiCreditInsufficientBalanceError);
                const settled = await settleConversationActionFixture(tx, {
                    ownerId,
                    actionId: action.id,
                    outcome: 'failure',
                });
                expect(settled.chargedMilli).toBe(0n);
            });
            const balance = await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).accountSummary(
                    ownerId,
                    new Date(),
                ),
            );
            expect(balance.availableCredits).toBe(1000n);
            expect(balance.reservedCredits).toBe(0n);
            expect(
                await db
                    .select()
                    .from(aiCreditActionAttemptsTable)
                    .where(eq(aiCreditActionAttemptsTable.actionId, action.id)),
            ).toHaveLength(0);
        });

        it('permits a third successful tutor answer step under the same action and rounds only once', async () => {
            const action = await db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    maximumMilli: 100n,
                    operatorMaximumMicros: 10000n,
                    tariff: {
                        inputCreditsPerMillionTokens: '1',
                        outputCreditsPerMillionTokens: '1',
                    },
                }),
            );
            const [claimed] = await db
                .select()
                .from(conversationTurnsTable)
                .where(eq(conversationTurnsTable.id, action.id));
            for (let index = 0; index < 3; index++) {
                const attempt = await restricted((tx) =>
                    new DrizzleActionAccountingParticipant(tx).admitAttempt({
                        actionId: action.id,
                        ownerId,
                        callId: randomUUID(),
                        purpose: 'answer',
                        inputTokens: 100,
                        maxOutputTokens: 100,
                        budget,
                        executionWitness: {
                            jobId: action.id,
                            leaseToken: claimed!.leaseToken!,
                        },
                        at: new Date(),
                    }),
                );
                await restricted((tx) =>
                    recordConversationAttemptFixture(tx, {
                        actionId: action.id,
                        ownerId,
                        callId: attempt.id,
                        successful: true,
                        usage: { inputTokens: 100, outputTokens: 100 },
                    }),
                );
            }
            const settled = await restricted((tx) =>
                settleConversationActionFixture(tx, {
                    ownerId,
                    actionId: action.id,
                    outcome: 'success',
                }),
            );
            expect(settled.chargedMilli).toBe(1n);
            expect(
                await db
                    .select()
                    .from(aiCreditActionAttemptsTable)
                    .where(eq(aiCreditActionAttemptsTable.actionId, action.id)),
            ).toHaveLength(3);
        });
    },
);
