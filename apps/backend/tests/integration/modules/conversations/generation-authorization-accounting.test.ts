import { listeningAllowances } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/listening-allowance-schema';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleActionAccountingParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import {
    generationRunsTable as runs,
    generationRunActionsTable as actions,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-generation-schema';
import { conversationTurnsTable as turns } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import {
    createGenerationAuthorization,
    remainingGenerationAuthorization,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/generation-run-authorization';
import type { GenerationRunRow } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/generation-run-context';
import {
    reserveConversationActionFixture,
    recordConversationAttemptFixture,
    settleConversationActionFixture,
} from '../../support/accounting-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const tariff = {
    inputCreditsPerMillionTokens: '1',
    outputCreditsPerMillionTokens: '1',
};
const budget = {
    maxInputTokensPerAttempt: 10000,
    maxOutputTokensPerAttempt: 10000,
    maxCostMicrosPerAttempt: 10000,
    inputCostMicrosPerMillionTokens: 1000,
    outputCostMicrosPerMillionTokens: 1000,
};

describe.runIf(isDatabaseIntegrationEnabled())(
    'generation authorization accounting',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let ownerId: string;

        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 60000);

        afterAll(async () => client?.end());
        beforeEach(async () => {
            await client`truncate ai_operator_attempt_costs,ai_operator_action_budgets,ai_operator_daily_budgets,ai_accounting_settings_revisions,users cascade`;
            await client`insert into ai_accounting_settings_revisions(id,version,default_max_credits_per_action,max_provider_cost_usd_per_action,max_provider_cost_usd_per_account_day,max_provider_cost_usd_per_day,created_at,reason) values(${randomUUID()},1,'1','1','10','100',now(),'Synthetic generation authority accounting')`;
            ownerId = randomUUID();
            await client`insert into users(id,status) values(${ownerId},'active')`;
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

        async function preparedRun(
            funding: 'customer' | 'operator' | 'unlimited' = 'customer',
            zeroTariff = false,
        ) {
            if (funding === 'unlimited') {
                const account = await db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).accountSummary(ownerId, new Date()),
                );

                await db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(tx).updatePolicy({
                        ownerId,
                        mode: 'unlimited',
                        unlimitedUntil: null,
                        expectedManagementVersion: account.managementVersion,
                        reason: 'Synthetic unlimited funding proof',
                        at: new Date(),
                    }),
                );
            }

            const first = await db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    maximumMilli:
                        funding === 'customer' && !zeroTariff ? 100n : 0n,
                    funding,
                    tariff: zeroTariff
                        ? {
                              inputCreditsPerMillionTokens: '0',
                              outputCreditsPerMillionTokens: '0',
                          }
                        : tariff,
                    operatorMaximumMicros: 10000n,
                }),
            );
            const [turn] = await db
                .select()
                .from(turns)
                .where(eq(turns.id, first.id));
            const noteId = randomUUID();
            await client`insert into knowledge_notes(id,owner_id,title,summary,body,categories,plain_text,created_at,updated_at) values(${noteId},${ownerId},'Synthetic financial proof','','{"schemaVersion":2,"document":{"type":"doc","content":[]}}'::jsonb,'{}','',now(),now())`;
            const [run] = await db
                .insert(runs)
                .values({
                    id: randomUUID(),
                    ownerId,
                    conversationId: turn!.conversationId,
                    noteId,
                    revision: 1,
                    state: 'paused',
                    pauseReason: 'budget',
                    sourceSnapshot: turn!.sourceSnapshot,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    automation: {
                        authorizationId: randomUUID(),
                        revision: 1,
                        rootActionId: first.id,
                        actionIds: [first.id],
                        maximumCreditsMilli:
                            funding === 'customer' && !zeroTariff ? '5' : '0',
                        maximumProviderCostMicros: 10000,
                        authorizationFingerprint: 'synthetic',
                        expiresAt: new Date(Date.now() + 60000).toISOString(),
                        stageCount: 1,
                        ready: true,
                    },
                })
                .returning();

            return { run: run!, first };
        }

        async function settleStage(
            run: GenerationRunRow,
            actionId: string,
            known = true,
        ) {
            await db.insert(actions).values({
                turnId: actionId,
                runId: run.id,
                revision: 1,
                kind: 'generation',
                createdAt: new Date(),
            });

            const call = await db.transaction(async (tx) => {
                const participant = new DrizzleActionAccountingParticipant(tx);
                await participant.attachSettlementSeries({
                    actionId,
                    ownerId,
                    seriesId: run.id,
                });

                return participant.admitAttempt({
                    actionId,
                    ownerId,
                    callId: randomUUID(),
                    purpose: 'answer',
                    inputTokens: 300,
                    maxOutputTokens: 300,
                    budget,
                    executionWitness: { jobId: actionId, leaseToken: actionId },
                    at: new Date(),
                });
            });

            await db.transaction((tx) =>
                recordConversationAttemptFixture(tx, {
                    actionId,
                    ownerId,
                    callId: call.id,
                    successful: known,
                    ...(known
                        ? { usage: { inputTokens: 300, outputTokens: 300 } }
                        : {}),
                }),
            );

            return db.transaction((tx) =>
                settleConversationActionFixture(tx, {
                    actionId,
                    ownerId,
                    outcome: known ? 'success' : 'failure',
                }),
            );
        }

        it('carries the original listening grant across automatic stages only for the same owner and branch', async () => {
            const { run, first } = await preparedRun();
            const branchId = randomUUID();
            run.taskManifest = [{ id: 'recording', kind: 'audio' }];
            run.sourceSnapshot.blockTarget = { branchId, version: 1 };
            await settleStage(run, first.id);
            const remaining = () =>
                db.transaction((tx) =>
                    remainingGenerationAuthorization(tx, run),
                );

            expect(
                (await remaining())?.permitsListeningRecording,
            ).toBeUndefined();

            await db.insert(listeningAllowances).values({
                rootTurnId: first.id,
                ownerId: run.ownerId,
                conversationId: run.conversationId,
                noteId: run.noteId,
                branchId,
                remainingCredits: 500n,
                remainingProviderMicros: 2000n,
            });

            expect((await remaining())?.permitsListeningRecording).toBe(true);
            expect(await db.select().from(listeningAllowances)).toHaveLength(1);
            run.sourceSnapshot.blockTarget = {
                branchId: randomUUID(),
                version: 1,
            };

            expect(
                (await remaining())?.permitsListeningRecording,
            ).toBeUndefined();
        });

        it('keeps lesson authority within the admitted root action deadline even after planning', async () => {
            const { first, run } = await preparedRun();
            const [row] = await db
                .select()
                .from(turns)
                .where(eq(turns.id, first.id));
            const [action] =
                await client`select deadline_at from ai_credit_actions where id=${first.id}`;
            const deadline = new Date(action!.deadline_at).getTime();
            const now = new Date(deadline - 1000);
            const authority = await db.transaction((tx) =>
                createGenerationAuthorization(
                    tx,
                    {
                        id: first.id,
                        execution: {
                            ...row!.execution,
                            generationAuthorizationFingerprint: 'fixture',
                            budget,
                            generationMaximumCreditsMilli: '100',
                            generationMaximumProviderCostMicros: 10000,
                        },
                    },
                    1,
                    now,
                    {
                        runId: run.id,
                        revision: 1,
                        purpose: 'generation',
                        sources: [],
                        artifacts: [],
                        plan: {
                            schemaVersion: 1,
                            replyLanguage: 'en',
                            sources: [],
                            outputOrder: ['reading'],
                            tasks: [
                                {
                                    id: 'reading',
                                    kind: 'prose',
                                    instruction: 'Write a short reading.',
                                    language: 'fr',
                                    inputs: [],
                                },
                            ],
                        },
                    },
                ),
            );

            expect(authority?.expiresAt).toBe(new Date(deadline).toISOString());
        });

        it('deducts real cumulative customer charges and all provider expenses from the one authorization ceiling', async () => {
            const { run, first } = await preparedRun();
            expect((await settleStage(run, first.id)).chargedMilli).toBe(1n);
            for (const expectedCharge of [1n, 0n]) {
                const action = await db.transaction((tx) =>
                    reserveConversationActionFixture(tx, {
                        ownerId,
                        conversationId: run.conversationId,
                        maximumMilli: 100n,
                        tariff,
                        operatorMaximumMicros: 10000n,
                    }),
                );

                run.automation!.actionIds.push(action.id);
                run.automation!.stageCount += 1;
                expect((await settleStage(run, action.id)).chargedMilli).toBe(
                    expectedCharge,
                );
            }

            const [totals] =
                await client`select numerator::text,charged_milli::text from ai_credit_series_totals where series_id=${run.id}`;

            expect(totals).toEqual({
                numerator: '1800000',
                charged_milli: '2',
            });

            const [expense] =
                await client`select sum(actual_cost_micros)::text as spent from ai_credit_action_attempts where action_id in (select turn_id from conversation_generation_run_actions where run_id=${run.id})`;
            const remaining = await db.transaction((tx) =>
                remainingGenerationAuthorization(tx, run),
            );

            expect(remaining).toMatchObject({
                maximumCreditsMilli: '3',
                maximumProviderCostMicros: 10000 - Number(expense?.spent),
            });

            run.automation!.maximumCreditsMilli = '1';
            run.automation!.maximumProviderCostMicros = Number(expense?.spent);
            expect(
                await db.transaction((tx) =>
                    remainingGenerationAuthorization(tx, run),
                ),
            ).toMatchObject({
                maximumCreditsMilli: '0',
                maximumProviderCostMicros: 0,
            });
        });

        it.each([
            { funding: 'operator' as const, zeroTariff: false },
            { funding: 'unlimited' as const, zeroTariff: false },
            { funding: 'customer' as const, zeroTariff: true },
        ])(
            'bounds provider expense without learner debit for $funding / zero tariff $zeroTariff',
            async ({ funding, zeroTariff }) => {
                const { run, first } = await preparedRun(funding, zeroTariff);
                expect((await settleStage(run, first.id)).chargedMilli).toBe(
                    0n,
                );

                const remaining = await db.transaction((tx) =>
                    remainingGenerationAuthorization(tx, run),
                );

                expect(remaining?.maximumCreditsMilli).toBe('0');
                expect(remaining?.maximumProviderCostMicros).toBeGreaterThan(0);
                expect(remaining?.maximumProviderCostMicros).toBeLessThan(
                    run.automation!.maximumProviderCostMicros,
                );
            },
        );

        it('refuses a new automatic allowance when a settled stage has unknown provider liability', async () => {
            const { run, first } = await preparedRun();
            await settleStage(run, first.id, false);
            expect(
                await db.transaction((tx) =>
                    remainingGenerationAuthorization(tx, run),
                ),
            ).toBeNull();

            const [action] =
                await client`select measurement,charged_milli::text from ai_credit_actions where id=${first.id}`;

            expect(action).toEqual({
                measurement: 'unknown',
                charged_milli: '0',
            });

            const [call] =
                await client`select actual_cost_micros from ai_credit_action_attempts where action_id=${first.id}`;

            expect(call?.actual_cost_micros).toBeNull();
        });
    },
);
