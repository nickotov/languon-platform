import { sql } from 'drizzle-orm';
import { textAiRouteHealthEventsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/route-health-schema';
import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { aiProviderPriceRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { aiProviderExpenseRecordsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import {
    DrizzleTextAiProbeStore,
    requireProbeReady,
    isProbeDispatchAllowed,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-probe-store';
import {
    textAiProbesTable,
    textAiProbeRecoveriesTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/probe-schema';
import type {
    TextAiProbeReservation,
    TextAiProbeResult,
} from '../../../../src/modules/text-ai/application/ports/text-ai-probe-store';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const at = new Date('2026-10-25T00:00:00Z');
const limits = {
    maximumCostMicros: 10_000n,
    dailyMaximumCostMicros: 100_000n,
    cooldownSeconds: 10,
    evidenceHours: 24,
};
const result: TextAiProbeResult = {
    valid: true,
    failure: null,
    elapsedMs: 20,
    inputTokens: 100,
    outputTokens: 10,
    measurement: 'measured',
};
run('atomic operator model probes and immutable evidence', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let store: DrizzleTextAiProbeStore;
    const actorId = randomUUID();
    let providerCounter = 0;
    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        store = new DrizzleTextAiProbeStore(database);
        await database.insert(usersTable).values({
            id: actorId,
            status: 'active',
            createdAt: at,
            updatedAt: at,
        });
    });
    afterAll(async () => {
        await client?.end();
    });
    async function seedRuntimeHealth(
        input: {
            identity: {
                routeId: string;
                providerId: string;
                fingerprint: string;
            };
        },
        reason: (typeof textAiRouteHealthEventsTable.$inferInsert)['reason'],
        id = randomUUID(),
    ) {
        await database.insert(textAiRouteHealthEventsTable).values({
            id,
            routeId: input.identity.routeId,
            providerId: input.identity.providerId,
            flowId: 'sentence-check',
            fingerprint: input.identity.fingerprint,
            reason,
            observedAt: new Date(),
        });
    }
    async function fixture(
        customLimits = limits,
        minimumUsdPerRequest?: string,
        providerOverride?: string,
        modelId = 'synthetic-model',
    ) {
        const providerId = providerOverride ?? `synthetic-${++providerCounter}`;
        const identity = {
            providerId,
            modelId,
            routeId: `${providerId}/${modelId}`,
            fingerprint: 'a'.repeat(64),
        };
        await database.insert(aiProviderPriceRevisionsTable).values({
            id: randomUUID(),
            providerId,
            modelId: identity.modelId,
            meter: 'text-tokens',
            version: 1,
            effectiveAt: at,
            createdAt: at,
            createdBy: actorId,
            data: {
                providerId,
                modelId: identity.modelId,
                meter: 'text-tokens',
                ...(minimumUsdPerRequest === undefined
                    ? {}
                    : { minimumUsdPerRequest }),
                inputUsdPerMillionTokens: '0.3',
                outputUsdPerMillionTokens: '1.2',
                cacheReadUsdPerMillionTokens: null,
                cacheWriteUsdPerMillionTokens: null,
                usdPer1000Characters: null,
                effectiveAt: at.toISOString(),
                sourceReference: 'synthetic-test',
                sourceUrl: null,
                reason: 'Synthetic reviewed test rate',
            },
        });
        return {
            actorId,
            identity,
            request: {
                routeId: identity.routeId,
                approvedMaximumCostUsd: '0.01',
                kind: 'flow' as const,
                flowId: 'sentence-check',
            },
            at,
            limits: customLimits,
        };
    }
    it('atomically admits only one concurrent probe per provider', async () => {
        const input = await fixture();
        const outcomes = await Promise.allSettled(
            Array.from({ length: 8 }, () => store.reserve(input)),
        );
        expect(
            outcomes.filter((value) => value.status === 'fulfilled'),
        ).toHaveLength(1);
        const successful = outcomes.find(
            (value) => value.status === 'fulfilled',
        ) as PromiseFulfilledResult<TextAiProbeReservation>;
        await store.finish(
            successful.value,
            result,
            new Date(at.getTime() + 20),
        );
        await expect(
            store.reserve({ ...input, at: new Date(at.getTime() + 1000) }),
        ).rejects.toThrow('probe_cooldown');
    });
    it('enforces shared daily reservation across different admins/providers and keeps unknown nonzero for cap', async () => {
        const otherAdmin = randomUUID();
        await database.insert(usersTable).values({
            id: otherAdmin,
            status: 'active',
            createdAt: at,
            updatedAt: at,
        });
        const inputs = await Promise.all([
            fixture({ ...limits, dailyMaximumCostMicros: 20_100n }),
            fixture({ ...limits, dailyMaximumCostMicros: 20_100n }),
            fixture({ ...limits, dailyMaximumCostMicros: 20_100n }),
        ]);
        const outcomes = await Promise.allSettled(
            inputs.map((input, index) =>
                store.reserve({
                    ...input,
                    actorId: index === 1 ? otherAdmin : actorId,
                }),
            ),
        );
        expect(
            outcomes.filter((value) => value.status === 'fulfilled'),
        ).toHaveLength(2);
        const fulfilled = outcomes.filter(
            (value): value is PromiseFulfilledResult<TextAiProbeReservation> =>
                value.status === 'fulfilled',
        );
        await Promise.all(
            fulfilled.map((value) =>
                store.finish(
                    value.value,
                    {
                        ...result,
                        valid: false,
                        failure: 'execution_unknown',
                        inputTokens: null,
                        outputTokens: null,
                        measurement: 'unknown',
                    },
                    at,
                ),
            ),
        );
        const next = await fixture({
            ...limits,
            dailyMaximumCostMicros: 20_100n,
        });
        await expect(store.reserve(next)).rejects.toThrow(
            'probe_limit_reached',
        );
    });
    it('records real expense without learner rows, protects exact completed facts and idempotent settlement', async () => {
        const input = await fixture({
            ...limits,
            dailyMaximumCostMicros: 1_000_000n,
        });
        const reservation = await store.reserve(input);
        const saved = await store.finish(
            reservation,
            result,
            new Date(at.getTime() + 20),
        );
        expect(saved).toMatchObject({
            state: 'passed',
            providerCostUsd: '0.000042',
            measurement: 'measured',
        });
        expect(
            await store.finish(
                reservation,
                result,
                new Date(at.getTime() + 40),
            ),
        ).toEqual(saved);
        const expense = await database
            .select()
            .from(aiProviderExpenseRecordsTable)
            .where(eq(aiProviderExpenseRecordsTable.actionId, reservation.id));
        expect(expense).toHaveLength(1);
        expect(expense[0]).toMatchObject({
            sourceKind: 'admin-probe',
            amountUsdMicros: 42n,
            measurement: 'measured',
        });
        const [counts] =
            await client`select (select count(*) from ai_credit_actions where id=${reservation.id})::int actions,(select count(*) from ai_credit_reservations where job_id=${reservation.id})::int holds`;
        expect(counts).toMatchObject({ actions: 0, holds: 0 });
        await expect(
            database
                .update(textAiProbesTable)
                .set({ costMicros: 0n })
                .where(eq(textAiProbesTable.id, reservation.id)),
        ).rejects.toThrow();
    });
    it('requires fresh exact evidence for activation but not for unchanged dispatch, rejects credential changes', async () => {
        const input = await fixture({
            ...limits,
            dailyMaximumCostMicros: 1_000_000n,
        });
        const reservation = await store.reserve(input);
        await store.finish(reservation, result, at);
        const gate = {
            routeId: input.identity.routeId,
            flowId: 'sentence-check',
            now: new Date(at.getTime() + 1000),
            fingerprint: input.identity.fingerprint,
        };
        await database.transaction((tx) => requireProbeReady(tx, gate));
        await expect(
            database.transaction((tx) =>
                requireProbeReady(tx, { ...gate, fingerprint: 'changed-key' }),
            ),
        ).rejects.toThrow('probe_check_required');
        const stale = {
            ...gate,
            now: new Date(at.getTime() + 25 * 60 * 60 * 1000),
        };
        await expect(
            database.transaction((tx) => requireProbeReady(tx, stale)),
        ).rejects.toThrow('probe_check_required');
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, stale),
            ),
        ).toBe(true);
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, {
                    ...gate,
                    fingerprint: 'changed-key',
                }),
            ),
        ).toBe(false);
    });
    it('keeps hard exclusions until manual success and does not let a later timeout clear them', async () => {
        const input = await fixture({
            ...limits,
            dailyMaximumCostMicros: 1_000_000n,
        });
        await store.finish(await store.reserve(input), result, at);
        const hardAt = new Date(at.getTime() + 10_000);
        await store.finish(
            await store.reserve({ ...input, at: hardAt }),
            {
                ...result,
                valid: false,
                failure: 'model_retired',
                inputTokens: null,
                outputTokens: null,
                measurement: 'unknown',
            },
            hardAt,
        );
        const timeoutAt = new Date(at.getTime() + 20_000);
        await store.finish(
            await store.reserve({ ...input, at: timeoutAt }),
            {
                ...result,
                valid: false,
                failure: 'timeout',
                inputTokens: null,
                outputTokens: null,
                measurement: 'unknown',
            },
            timeoutAt,
        );
        const gate = {
            routeId: input.identity.routeId,
            flowId: 'sentence-check',
            now: new Date(at.getTime() + 100_000),
            fingerprint: input.identity.fingerprint,
        };
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, gate),
            ),
        ).toBe(false);
        const recoveredAt = new Date(at.getTime() + 120_000);
        const uncertain = await database
            .select()
            .from(textAiProbesTable)
            .where(eq(textAiProbesTable.routeId, input.identity.routeId));
        const timeout = uncertain.find((row) => row.failure === 'timeout')!;
        await store.recover({
            probeId: timeout.id,
            actorId,
            reason: 'Synthetic operator confirmed upstream stopped.',
            at: recoveredAt,
        });
        await store.finish(
            await store.reserve({ ...input, at: recoveredAt }),
            result,
            recoveredAt,
        );
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, { ...gate, now: recoveredAt }),
            ),
        ).toBe(true);
    });
    it('serializes explicit recovery, preserves unknown expense and fences late completion', async () => {
        const input = await fixture({
            ...limits,
            dailyMaximumCostMicros: 1_000_000n,
        });
        const reservation = await store.reserve(input);
        const recoveryAt = new Date(at.getTime() + 120_000);
        await expect(
            store.reserve({ ...input, at: recoveryAt }),
        ).rejects.toThrow('probe_busy');
        const outcomes = await Promise.all(
            Array.from({ length: 4 }, () =>
                store.recover({
                    probeId: reservation.id,
                    actorId,
                    at: recoveryAt,
                    reason: 'Synthetic operator confirmed upstream request stopped.',
                }),
            ),
        );
        expect(
            outcomes.every(
                (row) => row.state === 'failed' && row.providerCostUsd === null,
            ),
        ).toBe(true);
        const facts = await database
            .select()
            .from(aiProviderExpenseRecordsTable)
            .where(eq(aiProviderExpenseRecordsTable.actionId, reservation.id));
        expect(facts).toHaveLength(1);
        expect(facts[0]).toMatchObject({
            measurement: 'unknown',
            amountUsdMicros: null,
        });
        const attestations = await database
            .select()
            .from(textAiProbeRecoveriesTable)
            .where(eq(textAiProbeRecoveriesTable.probeId, reservation.id));
        expect(attestations).toHaveLength(1);
        const late = await store.finish(
            reservation,
            result,
            new Date(recoveryAt.getTime() + 1),
        );
        expect(late).toMatchObject({
            state: 'failed',
            failure: 'execution_unknown',
            providerCostUsd: null,
        });
        await expect(
            database
                .update(textAiProbeRecoveriesTable)
                .set({ reason: 'Altered historical reason' })
                .where(eq(textAiProbeRecoveriesTable.probeId, reservation.id)),
        ).rejects.toThrow();
        const next = await store.reserve({
            ...input,
            at: new Date(recoveryAt.getTime() + 10_000),
        });
        await store.finish(
            next,
            result,
            new Date(recoveryAt.getTime() + 10_020),
        );
    });
    it('does not release uncertain completed execution without explicit recovery', async () => {
        const input = await fixture({
            ...limits,
            dailyMaximumCostMicros: 1_000_000n,
        });
        const reservation = await store.reserve(input);
        await store.finish(
            reservation,
            {
                ...result,
                valid: false,
                failure: 'execution_unknown',
                measurement: 'unknown',
                inputTokens: null,
                outputTokens: null,
            },
            at,
        );
        const later = new Date(at.getTime() + 60_000);
        await expect(store.reserve({ ...input, at: later })).rejects.toThrow(
            'probe_recovery_required',
        );
        await store.recover({
            probeId: reservation.id,
            actorId,
            reason: 'Synthetic operator confirmed upstream request stopped.',
            at: later,
        });
        const next = await store.reserve({ ...input, at: later });
        await store.finish(next, result, later);
        const facts = await database
            .select()
            .from(aiProviderExpenseRecordsTable)
            .where(eq(aiProviderExpenseRecordsTable.actionId, reservation.id));
        expect(facts).toHaveLength(1);
        expect(facts[0]!.amountUsdMicros).toBeNull();
    });
    it('excludes actual runtime retirement until a later manual check and preserves append-only evidence', async () => {
        const input = await fixture({
            ...limits,
            dailyMaximumCostMicros: 1_000_000n,
        });
        await store.finish(await store.reserve(input), result, at);
        const eventId = randomUUID();
        await seedRuntimeHealth(input, 'model_retired', eventId);
        const [event] = await database
            .select()
            .from(textAiRouteHealthEventsTable)
            .where(eq(textAiRouteHealthEventsTable.id, eventId));
        const gate = {
            routeId: input.identity.routeId,
            flowId: 'sentence-check',
            fingerprint: input.identity.fingerprint,
            now: new Date(event!.observedAt.getTime() + 120_000),
        };
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, gate),
            ),
        ).toBe(false);
        await expect(
            database
                .update(textAiRouteHealthEventsTable)
                .set({ reason: 'provider_unavailable' })
                .where(eq(textAiRouteHealthEventsTable.id, eventId)),
        ).rejects.toThrow();
        const recheckAt = new Date(event!.observedAt.getTime() + 180_000);
        await store.finish(
            await store.reserve({ ...input, at: recheckAt }),
            result,
            recheckAt,
        );
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, { ...gate, now: recheckAt }),
            ),
        ).toBe(true);
    });
    it('does not let learner-induced invalid output or request rejection exclude a shared flow', async () => {
        const input = await fixture({
            ...limits,
            dailyMaximumCostMicros: 1_000_000n,
        });
        await store.finish(await store.reserve(input), result, at);
        const eventId = randomUUID();
        await seedRuntimeHealth(input, 'invalid_output', eventId);
        const [event] = await database
            .select()
            .from(textAiRouteHealthEventsTable)
            .where(eq(textAiRouteHealthEventsTable.id, eventId));
        const gate = {
            routeId: input.identity.routeId,
            flowId: 'sentence-check',
            fingerprint: input.identity.fingerprint,
            now: new Date(event!.observedAt.getTime() + 1000),
        };
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, gate),
            ),
        ).toBe(true);
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, {
                    ...gate,
                    now: new Date(event!.observedAt.getTime() + 61_000),
                }),
            ),
        ).toBe(true);
        await seedRuntimeHealth(input, 'request_rejected');
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, gate),
            ),
        ).toBe(true);
        await seedRuntimeHealth(input, 'schema_incompatible');
        expect(
            await database.transaction((tx) =>
                isProbeDispatchAllowed(tx, {
                    ...gate,
                    now: new Date(event!.observedAt.getTime() + 120_000),
                }),
            ),
        ).toBe(false);
    });

    it('settles reviewed minimum request charges but keeps undispatched work zero and unknown usage unknown', async () => {
        const input = await fixture(
            { ...limits, dailyMaximumCostMicros: 1_000_000n },
            '0.001',
        );
        const charged = await store.reserve(input);
        expect(await store.finish(charged, result, at)).toMatchObject({
            providerCostUsd: '0.001000',
        });
        const nextAt = new Date(at.getTime() + 10_000);
        const undispatched = await store.reserve({ ...input, at: nextAt });
        expect(
            await store.finish(
                undispatched,
                {
                    ...result,
                    valid: false,
                    failure: 'budget_insufficient',
                    inputTokens: 0,
                    outputTokens: 0,
                },
                nextAt,
            ),
        ).toMatchObject({ providerCostUsd: '0.000000' });
        const laterAt = new Date(at.getTime() + 20_000);
        const unknown = await store.reserve({ ...input, at: laterAt });
        expect(
            await store.finish(
                unknown,
                {
                    ...result,
                    valid: true,
                    inputTokens: null,
                    outputTokens: null,
                    measurement: 'unknown',
                },
                laterAt,
            ),
        ).toMatchObject({ state: 'passed', providerCostUsd: null });
    });
    it('rejects an unfundable minimum and missing EvoLink minimum before creating any probe reservation', async () => {
        const expensive = await fixture(
            { ...limits, dailyMaximumCostMicros: 1_000_000n },
            '0.02',
        );
        await expect(store.reserve(expensive)).rejects.toThrow(
            'probe_budget_insufficient',
        );
        expect(
            await database
                .select()
                .from(textAiProbesTable)
                .where(
                    eq(textAiProbesTable.routeId, expensive.identity.routeId),
                ),
        ).toHaveLength(0);
        const evolink = await fixture(
            { ...limits, dailyMaximumCostMicros: 1_000_000n },
            undefined,
            'evolink',
        );
        await expect(store.reserve(evolink)).rejects.toThrow(
            'probe_prices_missing',
        );
        const zeroMinimum = await fixture(
            { ...limits, dailyMaximumCostMicros: 1_000_000n },
            '0',
            'evolink',
            'synthetic-zero-minimum',
        );
        await expect(store.reserve(zeroMinimum)).rejects.toThrow(
            'probe_prices_missing',
        );
        expect(
            await database
                .select()
                .from(textAiProbesTable)
                .where(eq(textAiProbesTable.routeId, evolink.identity.routeId)),
        ).toHaveLength(0);
    });
    it('retains bounded index lookups with representative probe history', async () => {
        const input = await fixture({
            ...limits,
            dailyMaximumCostMicros: 1_000_000n,
        });
        await store.finish(await store.reserve(input), result, at);
        await database.execute(sql`insert into text_ai_probes(id,route_id,provider_id,model_id,kind,flow_id,fingerprint,state,evidence_hours,day,maximum_micros,price,started_at,completed_at)
            select gen_random_uuid(),case when n%3<>2 then ${input.identity.routeId} else 'history-'||(n%100)::text||'/synthetic' end,case when n%3<>2 then ${input.identity.providerId} else 'history-'||(n%100)::text end,'synthetic','flow',case when n%3=0 then 'sentence-check' else 'conversation' end,case when n%3=0 then repeat('a',64) else repeat('b',64) end,'passed',24,'2026-10-25',10000,'{}'::jsonb,case when n%3=0 then '2026-10-01'::timestamptz else '2026-10-25 01:00:00'::timestamptz end + n*interval '1 second',case when n%3=0 then '2026-10-01'::timestamptz else '2026-10-25 01:00:00'::timestamptz end + n*interval '1 second' from generate_series(1,25000) n`);
        await database.execute(sql`analyze text_ai_probes`);
        const passedPlan = await database.execute(
            sql`explain (analyze,buffers,format json) select started_at from text_ai_probes where route_id=${input.identity.routeId} and flow_id='sentence-check' and fingerprint=${input.identity.fingerprint} and state='passed' and kind='flow' order by started_at desc nulls last limit 1`,
        );
        const authPlan = await database.execute(
            sql`explain (analyze,buffers,format json) select id from text_ai_probes where provider_id=${input.identity.providerId} and state='failed' and failure='authorization_failed' and started_at>${at.toISOString()}::timestamptz limit 1`,
        );
        const summarize = (rows: unknown) => {
            type PlanNode = {
                'Index Name'?: string;
                'Shared Hit Blocks'?: number;
                Plans?: PlanNode[];
            };
            const report = (rows as Array<Record<string, unknown>>)[0]?.[
                'QUERY PLAN'
            ] as Array<{ Plan: PlanNode; 'Execution Time': number }>;
            const indexes = (node: PlanNode): string[] => [
                ...(node['Index Name'] ? [node['Index Name']] : []),
                ...(node.Plans ?? []).flatMap(indexes),
            ];
            return {
                indexes: report?.[0]?.Plan ? indexes(report[0].Plan) : [],
                sharedHitBlocks: report?.[0]?.Plan['Shared Hit Blocks'],
                executionMs: report?.[0]?.['Execution Time'],
            };
        };
        console.info('Probe-history lookup evidence', {
            historyRows: 25000,
            passed: summarize(passedPlan),
            providerAuth: summarize(authPlan),
        });
        expect(JSON.stringify(passedPlan)).toContain(
            'text_ai_probe_passed_flow_idx',
        );
        expect(JSON.stringify(authPlan)).toContain(
            'text_ai_probe_failed_auth_idx',
        );
        expect(JSON.stringify(passedPlan)).not.toContain('Seq Scan');
        expect(JSON.stringify(passedPlan)).not.toContain('Sort');
        expect(JSON.stringify(authPlan)).not.toContain('Seq Scan');
    });
});
