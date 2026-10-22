import {
    createConversationActionAccounting,
    type ActionConversationExecution,
} from '../../../../src/modules/conversations/infrastructure/conversation-action-accounting';
import { DrizzleConversationStore } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import {
    reserveConversationActionFixture,
    settleConversationActionFixture,
    recordConversationAttemptFixture,
} from '../../support/accounting-action-fixture';
import { DrizzleOperatorBudgetParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { sql } from 'drizzle-orm';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleActionAccountingParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const budget = {
    maxInputTokensPerAttempt: 10000,
    maxOutputTokensPerAttempt: 10000,
    maxCostMicrosPerAttempt: 10000,
    inputCostMicrosPerMillionTokens: 1000,
    outputCostMicrosPerMillionTokens: 1000,
};
const tariff = {
    inputCreditsPerMillionTokens: '1',
    outputCreditsPerMillionTokens: '1',
};

describe.runIf(isDatabaseIntegrationEnabled())(
    'atomic conversation action accounting',
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
        afterAll(async () => {
            await client?.end();
        });
        beforeEach(async () => {
            await client`truncate ai_operator_attempt_costs,ai_operator_action_budgets,ai_operator_daily_budgets,ai_accounting_settings_revisions,users cascade`;
            await client`insert into ai_accounting_settings_revisions(id,version,default_max_credits_per_action,max_provider_cost_usd_per_action,max_provider_cost_usd_per_account_day,max_provider_cost_usd_per_day,created_at,reason) values(${randomUUID()},1,'1','1','10','100',now(),'Synthetic integration fixture')`;
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
        const reserve = (
            id = randomUUID(),
            maximum = 600n,
            funding: 'customer' | 'operator' = 'customer',
        ) =>
            db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    actionId: id,
                    ownerId,
                    maximumMilli: maximum,
                    funding,
                    tariff,
                    operatorMaximumMicros: 10000n,
                }),
            );
        const summary = () =>
            db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).accountSummary(
                    ownerId,
                    new Date(),
                ),
            );
        const attempt = (actionId: string, output = 100) =>
            db.transaction((tx) =>
                new DrizzleActionAccountingParticipant(tx).admitAttempt({
                    actionId,
                    ownerId,
                    callId: randomUUID(),
                    purpose: 'answer',
                    inputTokens: 100,
                    maxOutputTokens: output,
                    budget,
                    executionWitness: { jobId: actionId, leaseToken: actionId },
                    at: new Date(),
                }),
            );
        const record = (actionId: string, callId: string, outputTokens = 100) =>
            db.transaction((tx) =>
                recordConversationAttemptFixture(tx, {
                    actionId,
                    ownerId,
                    callId,
                    successful: true,
                    usage: { inputTokens: 100, outputTokens },
                }),
            );
        const settle = (
            actionId: string,
            outcome: 'success' | 'stopped' | 'failure',
        ) =>
            db.transaction((tx) =>
                settleConversationActionFixture(tx, {
                    actionId,
                    ownerId,
                    outcome,
                }),
            );

        const publishOperatorSettings = async (settings: {
            maxProviderCostUsdPerAction: string;
            maxProviderCostUsdPerAccountDay: string;
            maxProviderCostUsdPerDay: string;
        }) => {
            await client`insert into ai_accounting_settings_revisions(id,version,default_max_credits_per_action,max_provider_cost_usd_per_action,max_provider_cost_usd_per_account_day,max_provider_cost_usd_per_day,created_at,reason) values(${randomUUID()},2,'1',${settings.maxProviderCostUsdPerAction},${settings.maxProviderCostUsdPerAccountDay},${settings.maxProviderCostUsdPerDay},now(),'Reviewed synthetic operator test limits')`;
        };

        it('serializes concurrent holds against the shared compact wallet', async () => {
            const actions = await Promise.all([reserve(), reserve()]);
            expect(
                actions.reduce((sum, action) => sum + action.heldMilli, 0n),
            ).toBe(1000n);
            expect((await summary()).availableCredits).toBe(0n);
            expect((await summary()).reservedCredits).toBe(1000n);
            for (const action of actions) await settle(action.id, 'failure');
            expect((await summary()).availableCredits).toBe(1000n);
        });
        it.each(['success', 'stopped'] as const)(
            'charges %s once after summing eligible calls and honors the first terminal outcome',
            async (outcome) => {
                const action = await reserve();
                const first = await attempt(action.id);
                await record(action.id, first.id);
                const second = await attempt(action.id);
                await record(action.id, second.id);
                expect((await summary()).consumedCredits).toBe(0n);
                expect((await settle(action.id, outcome)).chargedMilli).toBe(
                    1n,
                );
                expect((await settle(action.id, outcome)).chargedMilli).toBe(
                    1n,
                );
                await expect(
                    settle(action.id, 'failure'),
                ).rejects.toMatchObject({
                    cause: {
                        code: '23514',
                        message: 'Action settlement replay differs',
                    },
                });
                const history = await db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(tx).history({
                        ownerId,
                        page: 1,
                        pageSize: 20,
                    }),
                );
                expect(
                    history.entries
                        .filter((row) => row.kind === 'settlement')
                        .map((row) => row.amount),
                ).toEqual([-1n]);
                expect((await summary()).availableCredits).toBe(999n);
                expect((await summary()).reservedCredits).toBe(0n);
            },
        );
        it('releases the complete action after technical failure despite earlier successful calls', async () => {
            const action = await reserve();
            const first = await attempt(action.id);
            await record(action.id, first.id);
            expect((await settle(action.id, 'failure')).chargedMilli).toBe(0n);
            expect((await summary()).availableCredits).toBe(1000n);
        });
        it('absorbs unknown usage without a later debit and skips wallet holds for operator funding', async () => {
            const action = await reserve(randomUUID(), 0n, 'operator');
            const call = await attempt(action.id);
            await db.transaction((tx) =>
                recordConversationAttemptFixture(tx, {
                    actionId: action.id,
                    ownerId,
                    callId: call.id,
                    successful: false,
                }),
            );
            const result = await settle(action.id, 'success');
            expect(result.chargedMilli).toBe(0n);
            expect(result.measurement).toBe('unknown');
            expect((await summary()).availableCredits).toBe(1000n);
        });
        it('absorbs a successful paid result with unknown usage and excludes optional memory work', async () => {
            const action = await reserve();
            const unknown = await attempt(action.id);
            await db.transaction((tx) =>
                recordConversationAttemptFixture(tx, {
                    actionId: action.id,
                    ownerId,
                    callId: unknown.id,
                    successful: false,
                }),
            );
            const memory = await db.transaction((tx) =>
                new DrizzleActionAccountingParticipant(tx).admitAttempt({
                    actionId: action.id,
                    ownerId,
                    callId: randomUUID(),
                    purpose: 'observation',
                    inputTokens: 100,
                    maxOutputTokens: 100,
                    budget,
                    executionWitness: {
                        jobId: action.id,
                        leaseToken: action.id,
                    },
                    at: new Date(),
                }),
            );
            await record(action.id, memory.id);
            expect((await settle(action.id, 'success')).chargedMilli).toBe(0n);
            expect((await summary()).availableCredits).toBe(1000n);
        });
        it('bounds output across calls and rejects replayed provider dispatch', async () => {
            const action = await reserve();
            const first = await attempt(action.id, 8000);
            await expect(attempt(action.id, 8000)).rejects.toMatchObject({
                cause: {
                    code: '23514',
                    message:
                        'Ambiguous running provider answer cannot be retried',
                },
            });
            await record(action.id, first.id, 8000);
            const second = await attempt(action.id, 8000);
            expect(second.outputLimit).toBe(2000);
            await record(action.id, second.id, 2000);
            await expect(attempt(action.id)).rejects.toThrow();
            await expect(
                db.transaction((tx) =>
                    new DrizzleActionAccountingParticipant(tx).admitAttempt({
                        actionId: action.id,
                        ownerId,
                        callId: first.id,
                        purpose: 'answer',
                        inputTokens: 100,
                        maxOutputTokens: 100,
                        budget,
                        executionWitness: {
                            jobId: action.id,
                            leaseToken: action.id,
                        },
                        at: new Date(),
                    }),
                ),
            ).rejects.toMatchObject({
                cause: {
                    code: '23514',
                    message: 'Action call limit reached or dispatch replayed',
                },
            });
        });
        it('allows five settled tutor calls within the shared budget and rejects a sixth', async () => {
            const action = await reserve();
            for (let index = 0; index < 5; index++) {
                const call = await attempt(action.id);
                await record(action.id, call.id);
            }
            await expect(attempt(action.id)).rejects.toMatchObject({
                cause: {
                    code: '23514',
                    message: 'Action call limit reached or dispatch replayed',
                },
            });
            const [calls] =
                await client`select count(*)::integer count from ai_credit_action_attempts where action_id=${action.id}`;
            expect(calls!.count).toBe(5);
            expect((await settle(action.id, 'success')).chargedMilli).toBe(1n);
        });
        it.each(['queued', 'running'] as const)(
            'persists explicit Stop authority for a %s conversation',
            async (status) => {
                const action = await reserve();
                await client`update conversation_turns set status=${status} where id=${action.id}`;
                if (status === 'running') {
                    const call = await attempt(action.id);
                    await record(action.id, call.id);
                }
                const sources = new ConversationSourceResolver({
                    verifyDictionaryShare: () => false,
                    verifyTextShare: () => false,
                    readNote: async () => {
                        throw new Error('Unused fixture source');
                    },
                });
                vi.spyOn(sources, 'resolve').mockResolvedValue({
                    authority: { sourceOwnerId: ownerId },
                    snapshot: {
                        version: '1',
                        title: 'Synthetic source',
                        description: null,
                        studiedLanguage: 'en',
                        provenance: 'saved',
                        material: [],
                    },
                });
                const store = new DrizzleConversationStore({
                    database: db,
                    sources,
                    admitTurn: async () => ({}),
                    publishNote: async () => {
                        throw new Error('Unused fixture publication');
                    },
                });
                const [row] =
                    await client`select conversation_id from conversation_turns where id=${action.id}`;
                await store.stop(
                    { ownerId },
                    String(row!.conversation_id),
                    action.id,
                );
                const [stopped] =
                    await client`select cancel_requested,error_code from (select cancel_requested,failure_code as error_code from conversation_turns where id=${action.id}) s`;
                expect(stopped!.cancel_requested).toBe(true);
                expect(stopped!.error_code).toBe('explicit_stop');
                if (status === 'running') await settle(action.id, 'stopped');
                const [settled] =
                    await client`select outcome,charged_milli from ai_credit_actions where id=${action.id}`;
                expect(settled!.outcome).toBe('stopped');
                expect(BigInt(settled!.charged_milli)).toBe(
                    status === 'running' ? 1n : 0n,
                );
            },
        );
        it('locks operator settlement before projecting a queued Stop', async () => {
            const action = await reserve();
            await client`update conversation_turns set status='queued',lease_token=null,lease_until=null where id=${action.id}`;
            const sources = new ConversationSourceResolver({
                verifyDictionaryShare: () => false,
                verifyTextShare: () => false,
                readNote: async () => {
                    throw new Error('Unused fixture source');
                },
            });
            vi.spyOn(sources, 'resolve').mockResolvedValue({
                authority: { sourceOwnerId: ownerId },
                snapshot: {
                    version: '1',
                    title: 'Synthetic source',
                    description: null,
                    studiedLanguage: 'en',
                    provenance: 'saved',
                    material: [],
                },
            });
            const store = new DrizzleConversationStore({
                database: db,
                sources,
                admitTurn: async () => ({}),
                publishNote: async () => {
                    throw new Error('Unused fixture publication');
                },
            });
            const [row] = await client`
                select conversation_id from conversation_turns where id=${action.id}
            `;
            let releaseOperator!: () => void;
            let operatorLocked!: () => void;
            const operatorReady = new Promise<void>((resolve) => {
                operatorLocked = resolve;
            });
            const waitForRelease = new Promise<void>((resolve) => {
                releaseOperator = resolve;
            });
            const operatorHolder = db.transaction(async (tx) => {
                await tx.execute(sql`select pg_advisory_xact_lock(1920424395)`);
                operatorLocked();
                await waitForRelease;
            });
            await operatorReady;
            try {
                const stopping = store.stop(
                    { ownerId },
                    String(row!.conversation_id),
                    action.id,
                );
                const deadline = Date.now() + 5000;
                while (true) {
                    const [waiting] = await client`
                        select exists (
                            select 1 from pg_stat_activity
                            where datname=current_database()
                              and pid<>pg_backend_pid()
                              and wait_event_type='Lock'
                              and query like '%pg_advisory_xact_lock(1920424395)%'
                        ) as value
                    `;
                    if (waiting?.value) break;
                    if (Date.now() > deadline)
                        throw new Error('Stop did not wait on the operator lock.');
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
                await db.transaction(async (tx) => {
                    await tx.execute(sql`
                        select scope from text_ai_capacity_queue_totals
                        where scope='global' for update
                    `);
                });
                const [beforeRelease] = await client`
                    select status from conversation_turns where id=${action.id}
                `;
                expect(beforeRelease!.status).toBe('queued');
                releaseOperator();
                const result = await stopping;
                expect(result.status).toBe('cancelled');
            } finally {
                releaseOperator();
                await operatorHolder;
            }
        }, 30_000);
        it('charges measured partial Stop output while excluding earlier measured technical failures', async () => {
            const action = await reserve();
            const technical = await attempt(action.id);
            const [pinned] =
                await client`select execution from conversation_turns where id=${action.id}`;
            const accounting = createConversationActionAccounting({
                ownerId,
                turnId: action.id,
                withOperation: (work) => db.transaction(work),
                withTransaction: (work) => db.transaction(work),
                execution: pinned!.execution as ActionConversationExecution,
            });
            const call = (id: string) => ({
                callId: id,
                purpose: 'answer' as const,
                inputTokenEstimate: 100,
                maxOutputTokens: 100,
            });
            await accounting.fail(call(technical.id), 'provider-error', {
                inputTokens: 100,
                outputTokens: 100,
            });
            const partial = await attempt(action.id);
            await client`update conversation_turns set cancel_requested=true,failure_code='explicit_stop' where id=${action.id}`;
            await accounting.fail(call(partial.id), 'aborted', {
                inputTokens: 100,
                outputTokens: 50,
            });
            await settle(action.id, 'stopped');
            const [row] =
                await client`select charged_milli from ai_credit_actions where id=${action.id}`;
            expect(BigInt(row!.charged_milli)).toBe(1n);
            const rows =
                await client`select id,successful from ai_credit_action_attempts where action_id=${action.id}`;
            expect(
                rows.find((row) => row.id === technical.id)!.successful,
            ).toBe(0);
            expect(rows.find((row) => row.id === partial.id)!.successful).toBe(
                1,
            );
        });
        it('rejects invalid cache meters as unknown liability without a customer debit', async () => {
            const action = await reserve();
            const call = await attempt(action.id);
            await db.transaction((tx) =>
                recordConversationAttemptFixture(tx, {
                    actionId: action.id,
                    ownerId,
                    callId: call.id,
                    successful: true,
                    usage: {
                        inputTokens: 100,
                        outputTokens: 100,
                        cacheReadTokens: 101,
                    },
                }),
            );
            expect((await settle(action.id, 'success')).chargedMilli).toBe(0n);
            const [cost] =
                await client`select measurement,consumed_micros,reserved_micros from ai_operator_attempt_costs where attempt_id=${call.id}`;
            expect(cost!.measurement).toBe('conservative');
            expect(BigInt(cost!.consumed_micros)).toBe(
                BigInt(cost!.reserved_micros),
            );
        });
        it('admits an explicitly zero customer tariff with no deposit while retaining operator bounds', async () => {
            const emptyOwner = randomUUID();
            await client`insert into users(id,status) values(${emptyOwner},'active')`;
            const action = await db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId: emptyOwner,
                    maximumMilli: 0n,
                    tariff: {
                        inputCreditsPerMillionTokens: '0',
                        outputCreditsPerMillionTokens: '0',
                    },
                }),
            );
            expect(action.heldMilli).toBe(0n);
            const call = await db.transaction((tx) =>
                new DrizzleActionAccountingParticipant(tx).admitAttempt({
                    actionId: action.id,
                    ownerId: emptyOwner,
                    callId: randomUUID(),
                    purpose: 'answer',
                    inputTokens: 100,
                    maxOutputTokens: 100,
                    budget,
                    executionWitness: {
                        jobId: action.id,
                        leaseToken: action.id,
                    },
                    at: new Date(),
                }),
            );
            await db.transaction((tx) =>
                recordConversationAttemptFixture(tx, {
                    actionId: action.id,
                    ownerId: emptyOwner,
                    callId: call.id,
                    successful: true,
                    usage: { inputTokens: 100, outputTokens: 100 },
                }),
            );
            const result = await db.transaction((tx) =>
                settleConversationActionFixture(tx, {
                    actionId: action.id,
                    ownerId: emptyOwner,
                    outcome: 'success',
                }),
            );
            expect(result.chargedMilli).toBe(0n);
        });
        it('shares global and owner operator budgets across model-independent actions', async () => {
            const settings = {
                maxProviderCostUsdPerAction: '0.00001',
                maxProviderCostUsdPerAccountDay: '0.000015',
                maxProviderCostUsdPerDay: '0.00002',
            };
            await publishOperatorSettings(settings);
            const reserveOperator = (actor: string, amount: bigint) =>
                db.transaction((tx) =>
                    new DrizzleOperatorBudgetParticipant(tx).reserveAction({
                        actionId: randomUUID(),
                        ownerId: actor,
                        maximumMicros: amount,
                        settings,
                        at: new Date(),
                    }),
                );
            const first = await reserveOperator(ownerId, 10n);
            await expect(reserveOperator(ownerId, 10n)).rejects.toThrow();
            const second = await reserveOperator(randomUUID(), 10n);
            await expect(reserveOperator(randomUUID(), 1n)).rejects.toThrow();
            await db.transaction((tx) =>
                new DrizzleOperatorBudgetParticipant(tx).settleAction({
                    actionId: first.actionId,
                    at: new Date(),
                }),
            );
            expect((await reserveOperator(ownerId, 10n)).reservedMicros).toBe(
                10n,
            );
            expect(second.reservedMicros).toBe(10n);
        });
        it('retains unknown failed provider liability and releases only unused operator allowance', async () => {
            const settings = {
                maxProviderCostUsdPerAction: '0.00001',
                maxProviderCostUsdPerAccountDay: '0.00002',
                maxProviderCostUsdPerDay: '0.00002',
            };
            await publishOperatorSettings(settings);
            const actionId = randomUUID(),
                attemptId = randomUUID();
            await db.transaction(async (tx) => {
                const participant = new DrizzleOperatorBudgetParticipant(tx);
                await participant.reserveAction({
                    actionId,
                    ownerId,
                    maximumMicros: 10n,
                    settings,
                    at: new Date(),
                });
                await participant.reserveAttempt({
                    actionId,
                    attemptId,
                    maximumMicros: 7n,
                    at: new Date(),
                });
                await participant.recordAttempt({
                    actionId,
                    attemptId,
                    measuredMicros: null,
                    at: new Date(),
                });
                expect(
                    (
                        await participant.settleAction({
                            actionId,
                            at: new Date(),
                        })
                    ).consumedMicros,
                ).toBe(7n);
            });
            const rows =
                await client`select reserved_micros,consumed_micros from ai_operator_daily_budgets where scope='global'`;
            expect(BigInt(rows[0]!.reserved_micros)).toBe(0n);
            expect(BigInt(rows[0]!.consumed_micros)).toBe(7n);
        });
        it('rejects direct operator counter mutation and settles unfinished attempts conservatively once', async () => {
            const actionId = randomUUID(),
                attemptId = randomUUID();
            const settings = {
                maxProviderCostUsdPerAction: '0.00001',
                maxProviderCostUsdPerAccountDay: '0.00002',
                maxProviderCostUsdPerDay: '0.00002',
            };
            await publishOperatorSettings(settings);
            await db.transaction(async (tx) => {
                const participant = new DrizzleOperatorBudgetParticipant(tx);
                await participant.reserveAction({
                    actionId,
                    ownerId,
                    maximumMicros: 10n,
                    settings,
                    at: new Date(),
                });
                await participant.reserveAttempt({
                    actionId,
                    attemptId,
                    maximumMicros: 9n,
                    at: new Date(),
                });
            });
            await expect(
                client`update ai_operator_daily_budgets set consumed_micros=0,reserved_micros=0`,
            ).rejects.toThrow();
            const first = await db.transaction((tx) =>
                new DrizzleOperatorBudgetParticipant(tx).settleAction({
                    actionId,
                    at: new Date(),
                }),
            );
            const second = await db.transaction((tx) =>
                new DrizzleOperatorBudgetParticipant(tx).settleAction({
                    actionId,
                    at: new Date(),
                }),
            );
            expect(first.consumedMicros).toBe(9n);
            expect(second.consumedMicros).toBe(9n);
            await expect(
                client`delete from ai_operator_attempt_costs where attempt_id=${attemptId}`,
            ).rejects.toThrow();
        });
    },
);
