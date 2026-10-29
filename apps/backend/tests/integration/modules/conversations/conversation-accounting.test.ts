import {
    fixtureRouteFingerprint,
    seedTextAiRoutingFixture,
} from '../../../support/text-ai-routing-fixture';
import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { lockTextAiCapacity } from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import {
    createConversationAccounting,
    conversationAdmission,
    settleInterruptedConversationCalls,
} from '../../../../src/modules/conversations/infrastructure/conversation-accounting';
import { conversationProviderCallsTable as calls } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-provider-call-schema';
import { conversationTurnsTable as turns } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiCreditReservationsTable as reservations } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import type { TextAiAdmissionExecution } from '../../../../src/modules/text-ai/application/text-ai-admission-participant';
import { dictionaryAiWorkerObservationsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    conversationExecutionObservationId,
    textAiSelectionObservationId,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { textAiPreferencesTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/schema';
import type { TutorCallAdmission } from '../../../../src/modules/conversations/application/ports/tutor-runner';
import { ConversationWorkerService } from '../../../../src/modules/conversations/application/conversation-worker-service';
import { DrizzleConversationStore } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import { dictionaryGenerationProviderUsageArchiveTable } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { textAiProviderUsageCostMicros } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const model = textAiModelCatalog.find(
    (value) => value.id === 'deepseek-flash',
)!;
const snapshot: TextAiExecutionSnapshot = {
    ...model,
    // The accounting tests pin a deliberately affordable, historical tariff
    // fixture. Live admission tests seed the same rates in model_price_revisions.
    creditPricing: {
        ...model.creditPricing,
        inputCreditsPerMillionTokens: 1000,
        outputCreditsPerMillionTokens: 3000,
        revision: 1,
    },
    modelId: model.id,
    enabledModelIds: textAiModelCatalog.map((value) => value.id),
    supportedFormats: ['conversation:v1'],
};
const execution: TextAiAdmissionExecution = {
    budget: snapshot.aggregateBudget,
    snapshot,
    revisionId: null,
    selectionVersion: 1,
};
const policy = {
    routingEnabled: true,
    credentialConfigured: () => true,
    routeFingerprint: fixtureRouteFingerprint,
};
const call = (
    purpose: TutorCallAdmission['purpose'] = 'answer',
): TutorCallAdmission => ({
    callId: randomUUID(),
    purpose,
    inputTokenEstimate: 200,
    maxOutputTokens: purpose === 'answer' ? 4096 : 2048,
});

describe.runIf(isDatabaseIntegrationEnabled())(
    'conversation provider accounting and admission',
    () => {
        let client: PostgresClient,
            db: PostgresJsDatabase<typeof databaseSchema>;
        let ownerId: string, turnId: string, chatId: string;
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
            await client`truncate conversation_provider_calls, dictionary_generation_provider_usage_archive, dictionary_ai_worker_observations, text_ai_capacity_jobs, text_ai_capacity_queue_totals, text_ai_capacity_provider_usage, text_ai_capacity_active_totals, text_ai_capacity_settled_buckets, users cascade`;
            ownerId = randomUUID();
            turnId = randomUUID();
            chatId = randomUUID();
            await client`insert into users(id,status) values (${ownerId},'active')`;
            await seedLegacyActionFixture(db, '1000');
            await client`insert into conversation_chats(id,owner_id,source_kind,source_id,source,preferences,created_at,updated_at) values (${chatId},${ownerId},'dictionary',${randomUUID()},'{}','{}',now(),now())`;
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx.insert(turns).values({
                    id: turnId,
                    conversationId: chatId,
                    ownerId,
                    requestId: randomUUID(),
                    requestFingerprint: 'test',
                    status: 'running',
                    preferences: {
                        mode: 'auto',
                        replyLanguage: 'auto',
                        tone: 'neutral',
                        explanationLevel: 'auto',
                    },
                    authority: { sourceOwnerId: ownerId },
                    sourceSnapshot: {
                        version: '1',
                        title: 'Synthetic source',
                        description: null,
                        studiedLanguage: 'es',
                        provenance: 'saved',
                        material: [],
                    },
                    execution: execution as unknown as Record<string, unknown>,
                    usage: {
                        inputTokens: 0,
                        outputTokens: 0,
                        chargedCredits: '0',
                        estimated: false,
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                await new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 1_000_000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'purchase',
                    sourceReference: randomUUID(),
                });
            });
        });
        const accounting = (selected = execution, fence = true) =>
            createConversationAccounting({
                database: db,
                ownerId,
                turnId,
                execution: selected,
                withOperation: (work) => {
                    if (!fence) throw new Error('operation fence rejected');
                    return db.transaction(work);
                },
            });
        async function rows() {
            return db.select().from(calls).where(eq(calls.turnId, turnId));
        }
        async function wallet() {
            return db
                .select()
                .from(reservations)
                .where(eq(reservations.jobId, turnId));
        }
        async function unlimited() {
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).updatePolicy({
                    ownerId,
                    at: new Date(),
                    expectedManagementVersion: 0,
                    mode: 'unlimited',
                    unlimitedUntil: null,
                    reason: 'Synthetic test policy',
                }),
            );
        }
        async function configured(ready = true, selectedModel = model) {
            await seedTextAiRoutingFixture(db);
            const workerId = 'accounting-worker',
                now = new Date();
            await db.insert(dictionaryAiWorkerObservationsTable).values({
                id: (ready
                    ? conversationExecutionObservationId
                    : textAiSelectionObservationId)(
                    workerId,
                    selectedModel.providerId,
                    selectedModel.id,
                ),
                workerId,
                providerId: selectedModel.providerId,
                modelId: selectedModel.id,
                adapterRevision: selectedModel.adapterRevision,
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 120000),
                status: 'available',
                message: 'Synthetic worker',
                textAiSelectionRevision: 1,
                textAiSupportedFormats: ['conversation:v1'],
                textAiCapacityRevision: 1,
                textsCapacityRevision: 1,
                conversationCapacityRevision: ready ? 1 : null,
                conversationExecutionRevision: ready ? 1 : null,
                creditSettlementRevision: 1,
            });
        }
        it('reserves and marks every actor, observer and reflector dispatch before settlement, with pinned rates and idempotent charges', async () => {
            const port = accounting();
            for (const purpose of [
                'answer',
                'observation',
                'reflection',
            ] as const) {
                const input = call(purpose);
                await port.admit(input);
                const reserved = (await rows()).find(
                    (row) => row.id === input.callId,
                )!;
                expect(reserved).toMatchObject({
                    state: 'dispatched',
                    reservedInputTokens: 64000,
                    reservedOutputTokens: input.maxOutputTokens,
                });
                expect(
                    (await wallet()).find(
                        (row) => row.id === reserved.reservationId,
                    ),
                ).toMatchObject({
                    state: 'active',
                    reservedCredits: BigInt(64000 + input.maxOutputTokens * 3),
                    dispatchedAt: expect.any(Date),
                });
                await port.settle(input, {
                    inputTokens: 100,
                    outputTokens: 20,
                });
                await port.settle(input, {
                    inputTokens: 999,
                    outputTokens: 999,
                });
            }
            expect((await rows()).map((row) => row.purpose).sort()).toEqual([
                'actor',
                'observer',
                'reflector',
            ]);
            expect((await wallet()).map((row) => row.chargedCredits)).toEqual([
                160n,
                160n,
                160n,
            ]);
            const [turn] = await db
                .select()
                .from(turns)
                .where(eq(turns.id, turnId));
            expect(turn?.usage).toEqual({
                inputTokens: 300,
                outputTokens: 60,
                chargedCredits: '480',
                estimated: false,
            });
            await expect(
                port.admit({ ...call(), callId: (await rows())[0]!.id }),
            ).rejects.toThrow('cannot be replayed');
            // Bypass the adapter to prove SQL independently rejects a discounted
            // reservation even when a correctly bounded owned call exists.
            const actor = (await rows()).find(
                (row) => row.purpose === 'actor',
            )!;
            const invalidReservation = randomUUID();
            await expect(
                db.transaction(async (tx) => {
                    await lockTextAiCapacity(tx);
                    await tx.insert(calls).values({
                        ...actor,
                        id: randomUUID(),
                        ordinal: 4,
                        reservationId: invalidReservation,
                        state: 'dispatched',
                        settledAt: null,
                        actualCostMicros: 0,
                        actualInputTokens: 0,
                        actualOutputTokens: 0,
                    });
                    await new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).reserveAttempt({
                        ownerId,
                        jobId: turnId,
                        jobKind: 'conversation-turn',
                        attempt: 4,
                        reservationId: invalidReservation,
                        at: new Date(),
                        maximumCredits: 1n,
                    });
                }),
            ).rejects.toMatchObject({
                cause: expect.objectContaining({ code: '23514' }),
            });
            expect(await rows()).toHaveLength(3);
            expect(await wallet()).toHaveLength(3);
        });
        it('settles cancellation and lost access without using the operation fence, conservatively for missing or invalid usage', async () => {
            const first = call(),
                second = call();
            await accounting().admit(first);
            await accounting().admit(second);
            await client`update conversation_turns set cancel_requested=true,status='cancelled' where id=${turnId}`;
            await accounting(execution, false).fail(first, 'aborted');
            await accounting(execution, false).settle(second, {
                inputTokens: 64001,
                outputTokens: 0,
            });
            expect(
                (await wallet()).map((row) => ({
                    charged: row.chargedCredits,
                    measurement: row.measurement,
                })),
            ).toEqual([
                { charged: 76288n, measurement: 'estimated' },
                { charged: 76288n, measurement: 'estimated' },
            ]);
            await expect(
                accounting(execution, false).admit(call()),
            ).rejects.toThrow('fence rejected');
        });
        it('crash recovery settles unknown dispatched liability once using immutable admitted rates', async () => {
            const input = call();
            await accounting().admit(input);
            const [turn] = await db
                .select()
                .from(turns)
                .where(eq(turns.id, turnId));
            for (let repeat = 0; repeat < 2; repeat++)
                await db.transaction(async (tx) => {
                    await lockTextAiCapacity(tx);
                    await settleInterruptedConversationCalls(tx, turn!);
                });
            expect((await wallet())[0]).toMatchObject({
                chargedCredits: 76288n,
                measurement: 'estimated',
            });
            expect((await rows())[0]).toMatchObject({
                actualInputTokens: 64000,
                actualOutputTokens: 4096,
                actualCostMicros: 76288,
            });
            await expect(
                client`update conversation_turns set execution='{}' where id=${turnId}`,
            ).rejects.toMatchObject({ code: '23514' });
            await expect(
                client`update conversation_provider_calls set input_cost_micros_per_million_tokens=0 where turn_id=${turnId}`,
            ).rejects.toMatchObject({ code: '23514' });
            expect(
                (
                    await client`select count(*)::int as count from ai_credit_history where owner_id=${ownerId} and kind='settlement'`
                )[0]?.count,
            ).toBe(1);
        });
        it('preserves reported and missing-usage measurements for unlimited accounts without debiting credits', async () => {
            await unlimited();
            const port = accounting(),
                first = call(),
                second = call('observation');
            await port.admit(first);
            await port.settle(first, { inputTokens: 100, outputTokens: 20 });
            await port.admit(second);
            await port.fail(second, 'missing-usage');
            expect(
                (await wallet()).map((row) => ({
                    reserved: row.reservedCredits,
                    charged: row.chargedCredits,
                    measured: row.measuredCredits,
                    measurement: row.measurement,
                })),
            ).toEqual([
                {
                    reserved: 0n,
                    charged: 0n,
                    measured: 160n,
                    measurement: 'provider_reported',
                },
                {
                    reserved: 0n,
                    charged: 0n,
                    measured: null,
                    measurement: 'unmetered',
                },
            ]);
        });
        it('settles provider-reported usage at zero when only the unused token direction is priced', async () => {
            const zeroInputExecution = {
                ...execution,
                snapshot: {
                    ...snapshot,
                    creditPricing: {
                        ...snapshot.creditPricing!,
                        inputCreditsPerMillionTokens: 0,
                    },
                },
            };
            const [previous] = await db
                .select()
                .from(turns)
                .where(eq(turns.id, turnId));
            await client`update conversation_turns set status='succeeded' where id=${turnId}`;
            turnId = randomUUID();
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx.insert(turns).values({
                    ...previous!,
                    id: turnId,
                    requestId: randomUUID(),
                    status: 'running',
                    execution: zeroInputExecution,
                });
            });
            const port = accounting(zeroInputExecution),
                input = call();
            await port.admit(input);
            await port.settle(input, { inputTokens: 100, outputTokens: 0 });
            expect((await wallet())[0]).toMatchObject({
                chargedCredits: 0n,
                measuredCredits: 0n,
                measurement: 'provider_reported',
            });
        });
        it('limits five provider calls and two memory calls while retaining the last slot for an actor', async () => {
            const port = accounting();
            for (const purpose of [
                'answer',
                'observation',
                'reflection',
                'answer',
                'answer',
            ] as const) {
                const input = call(purpose);
                await port.admit(input);
                await port.settle(input, { inputTokens: 10, outputTokens: 1 });
            }
            await expect(port.admit(call())).rejects.toThrow('call limit');
            expect(await rows()).toHaveLength(5);
        });
        it('rejects a third memory call and preserves actor slot even if the memory quota remains', async () => {
            const port = accounting();
            for (const purpose of [
                'answer',
                'answer',
                'observation',
                'answer',
            ] as const) {
                const input = call(purpose);
                await port.admit(input);
                await port.settle(input, { inputTokens: 10, outputTokens: 1 });
            }
            await expect(port.admit(call('reflection'))).rejects.toThrow(
                'call limit',
            );
            const final = call();
            await port.admit(final);
            await port.settle(final, { inputTokens: 0, outputTokens: 0 });
        });
        it('rejects the third memory call before exhausting the total call count', async () => {
            const port = accounting();
            for (const purpose of ['observation', 'reflection'] as const) {
                const input = call(purpose);
                await port.admit(input);
                await port.settle(input, { inputTokens: 10, outputTokens: 1 });
            }
            await expect(port.admit(call('observation'))).rejects.toThrow(
                'call limit',
            );
            expect(await rows()).toHaveLength(2);
        });
        it('serializes competing dispatch reservations so a shared wallet cannot overspend', async () => {
            await client`truncate ai_credit_grants cascade`;
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 80000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'purchase',
                    sourceReference: randomUUID(),
                }),
            );
            const results = await Promise.allSettled([
                accounting().admit(call()),
                accounting().admit(call()),
            ]);
            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                results.filter((result) => result.status === 'rejected'),
            ).toMatchObject([{ reason: { code: 'credits_exhausted' } }]);
            expect(await rows()).toHaveLength(1);
            expect(await wallet()).toHaveLength(1);
        });
        it('rejects calls beyond aggregate or per-call bounds before any credit reservation is written', async () => {
            const budget = {
                ...execution.budget,
                maxInputTokensPerAttempt: 64000,
            };
            const port = accounting({ ...execution, budget });
            await expect(
                port.admit({ ...call(), maxOutputTokens: 8193 }),
            ).rejects.toThrow('model limits');
            await expect(
                port.admit({ ...call('reflection'), maxOutputTokens: 2049 }),
            ).rejects.toThrow('model limits');
            await expect(
                port.admit({ ...call(), inputTokenEstimate: 64001 }),
            ).rejects.toThrow('model limits');
            const first = call();
            await port.admit(first);
            await expect(port.admit(call())).rejects.toThrow('turn budget');
            expect(await rows()).toHaveLength(1);
            expect(await wallet()).toHaveLength(1);
        });
        it('maps credit exhaustion before dispatch and does not create a paid call', async () => {
            await client`truncate ai_credit_grants cascade`;
            await expect(accounting().admit(call())).rejects.toMatchObject({
                code: 'credits_exhausted',
            });
            expect(await rows()).toHaveLength(0);
            expect(await wallet()).toHaveLength(0);
        });
        it('server routing ignores a retired learner model preference and requires current chat execution readiness', async () => {
            const selectedModel = textAiModelCatalog.find(
                (candidate) =>
                    candidate.providerId === 'openrouter' &&
                    candidate.id === 'openai/gpt-6-luna',
            )!;
            await seedTextAiRoutingFixture(db, {
                replace: true,
                routeId: 'openrouter/openai/gpt-6-luna',
            });
            await configured(true, selectedModel);
            await db.insert(textAiPreferencesTable).values({
                userId: ownerId,
                mode: 'explicit',
                modelId: 'gemini-2.5-pro',
                version: 1,
            });
            const admitted = await db.transaction((tx) =>
                conversationAdmission(policy)(tx, {
                    ownerId,
                    turnId,
                    conversationId: chatId,
                    inputTokenBound: 200,
                }),
            );
            expect(admitted.snapshot as TextAiExecutionSnapshot).toMatchObject({
                providerId: 'openrouter',
                modelId: 'openai/gpt-6-luna',
                routingAuthority: { flowId: 'conversation' },
            });
            // Ordinary chat admission still uses its bounded initial context;
            // only server-authorized block tools reserve continuation capacity.
            expect(admitted.admittedMaxInputTokens).toBe(200);
            await client`update dictionary_ai_worker_observations set checked_at=now()-interval '2 minutes',expires_at=now()-interval '1 second'`;
            await expect(
                db.transaction((tx) =>
                    conversationAdmission(policy)(tx, {
                        ownerId,
                        turnId,
                        conversationId: chatId,
                        inputTokenBound: 200,
                    }),
                ),
            ).rejects.toMatchObject({
                code: 'model_unavailable',
                message: expect.stringContaining('Try again later'),
            });
        });
        it('preserves reduced quotes and minimum output admission when reserving block continuation', async () => {
            await configured();
            for (const [budget, outputTokens] of [
                ['10', 3000],
                ['1.003', 1],
                ['1', 0],
            ] as const) {
                await db
                    .insert(textAiPreferencesTable)
                    .values({
                        userId: ownerId,
                        mode: 'auto',
                        version: 1,
                        maxCreditsPerAction: budget,
                    })
                    .onConflictDoUpdate({
                        target: textAiPreferencesTable.userId,
                        set: { maxCreditsPerAction: budget },
                    });
                for (const reserveToolContinuation of [false, true]) {
                    const admitted = db.transaction((tx) =>
                        conversationAdmission(policy)(tx, {
                            ownerId,
                            turnId,
                            conversationId: chatId,
                            requestId: randomUUID(),
                            fingerprint: `synthetic-budget-${budget}`,
                            inputTokenBound: 1000,
                            reserveToolContinuation,
                        }),
                    );
                    if (outputTokens === 0) {
                        await expect(admitted).rejects.toMatchObject({
                            code: 'credits_exhausted',
                        });
                    } else {
                        await expect(admitted).resolves.toMatchObject({
                            confirmationRequired: true,
                            quote: {
                                maximumCredits: budget,
                                approximateOutputTokens: outputTokens,
                            },
                        });
                    }
                }
            }
            expect(
                await db.execute(
                    sql`select id from ai_credit_actions where id=${turnId}::uuid`,
                ),
            ).toHaveLength(0);
        });
        it('rejects missing or legacy chat readiness and zero-credit admission with model-neutral errors', async () => {
            await expect(
                db.transaction((tx) =>
                    conversationAdmission(policy)(tx, {
                        ownerId,
                        turnId,
                        conversationId: chatId,
                        inputTokenBound: 200,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'model_unavailable' });
            await configured(false);
            await expect(
                db.transaction((tx) =>
                    conversationAdmission(policy)(tx, {
                        ownerId,
                        turnId,
                        conversationId: chatId,
                        inputTokenBound: 200,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'model_unavailable' });
            await db.insert(textAiPreferencesTable).values({
                userId: ownerId,
                mode: 'explicit',
                modelId: 'deepseek-flash',
                version: 1,
            });
            await expect(
                db.transaction((tx) =>
                    conversationAdmission(policy)(tx, {
                        ownerId,
                        turnId,
                        conversationId: chatId,
                        inputTokenBound: 200,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'model_unavailable' });
            await client`delete from user_text_ai_preferences where user_id=${ownerId}`;
            await client`delete from dictionary_ai_worker_observations`;
            await configured();
            await client`truncate ai_credit_grants cascade`;
            await expect(
                db.transaction((tx) =>
                    conversationAdmission(policy)(tx, {
                        ownerId,
                        turnId,
                        conversationId: chatId,
                        inputTokenBound: 200,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'credits_exhausted' });
        });
        it('reports capacity exhaustion separately when the actor queue is full', async () => {
            await configured();
            const [existing] = await db
                .select()
                .from(turns)
                .where(eq(turns.id, turnId));
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                for (let ordinal = 0; ordinal < 5; ordinal++) {
                    const queuedChat = randomUUID();
                    await tx.execute(
                        sql`insert into conversation_chats(id,owner_id,source_kind,source_id,source,preferences,created_at,updated_at) values (${queuedChat},${ownerId},'dictionary',${randomUUID()},'{}','{}',now(),now())`,
                    );
                    await tx.insert(turns).values({
                        ...existing!,
                        id: randomUUID(),
                        conversationId: queuedChat,
                        requestId: randomUUID(),
                        status: 'queued',
                    });
                }
            });
            await expect(
                db.transaction((tx) =>
                    conversationAdmission(policy)(tx, {
                        ownerId,
                        turnId,
                        conversationId: chatId,
                        inputTokenBound: 200,
                    }),
                ),
            ).rejects.toMatchObject({
                code: 'capacity_unavailable',
                message: expect.stringContaining('Try again later'),
            });
            expect(await wallet()).toHaveLength(0);
        });
        it('preserves capacity_unavailable on the durable failed turn when provider budget fills after admission', async () => {
            await configured();
            await client`update conversation_turns set status='succeeded' where id=${turnId}`;
            const dictionaryId = randomUUID();
            await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag) values (${dictionaryId},${ownerId},'Synthetic source','es','en')`;
            const store = new DrizzleConversationStore({
                database: db,
                admitTurn: conversationAdmission(policy),
                settleInterrupted: settleInterruptedConversationCalls,
                sources: new ConversationSourceResolver({
                    verifyDictionaryShare: () => false,
                    verifyTextShare: () => false,
                    readNote: async () => {
                        throw new Error('Unexpected note access.');
                    },
                }),
                publishNote: async () => {
                    throw new Error('Unexpected note publication.');
                },
            });
            const access = { ownerId };
            const chat = await store.create(access, {
                source: { kind: 'dictionary', id: dictionaryId },
            });
            const admitted = await store.submit(access, chat.id, {
                requestId: randomUUID(),
                content: 'Explain the language.',
                attachments: [],
            });
            expect(admitted.status).toBe('queued');
            turnId = admitted.id;
            chatId = chat.id;
            const [queuedTurn] = await db
                .select({ execution: turns.execution })
                .from(turns)
                .where(eq(turns.id, admitted.id));
            const pinnedBudget = (
                queuedTurn!.execution as unknown as TextAiAdmissionExecution
            ).budget;
            // Another job's completed work exhausts the rolling owner provider
            // budget after admission but before this turn reaches dispatch.
            const used = {
                inputTokens: pinnedBudget.maxInputTokensPerAttempt,
                outputTokens: pinnedBudget.maxOutputTokensPerAttempt,
            };
            await db
                .insert(dictionaryGenerationProviderUsageArchiveTable)
                .values(
                    Array.from({ length: 3 }, () => ({
                        id: randomUUID(),
                        ownerId,
                        jobKind: 'conversation-turn' as const,
                        settledAt: new Date(),
                        actualInputTokens: used.inputTokens,
                        actualOutputTokens: used.outputTokens,
                        actualCostMicros: textAiProviderUsageCostMicros(
                            pinnedBudget,
                            used,
                        ),
                        ...pinnedBudget,
                    })),
                );
            const worker = new ConversationWorkerService({
                store,
                createRunner: (claimed) => ({
                    run: async () => {
                        const port = createConversationAccounting({
                            database: db,
                            ownerId,
                            turnId,
                            leaseToken: claimed.leaseToken,
                            execution:
                                claimed.execution as unknown as TextAiAdmissionExecution,
                            withOperation: (work) =>
                                store.withOperation(claimed, work),
                        });
                        await port.admit(call());
                        return { text: 'Unexpected provider dispatch.' };
                    },
                }),
            });
            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );
            const detail = await store.detail(access, chat.id);
            expect(
                detail.turns.find((turn) => turn.id === admitted.id),
            ).toMatchObject({
                status: 'failed',
                failureCode: 'capacity_unavailable',
            });
            expect(await rows()).toHaveLength(0);
            expect(await wallet()).toHaveLength(0);
        });
    },
);
