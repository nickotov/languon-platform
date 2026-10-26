import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
    createPostgresClient,
    runPostgresMigrations,
    grantDisposableMigrationPurpose,
} from '@languon/database';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createAuthenticationRedisClient } from '../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';
import type { ClaimedConversationTurn } from '../../src/modules/conversations/application/ports/conversation-store';
import { describe, expect, it } from 'vitest';
import { databaseSchema } from '../../src/infrastructure/database/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleConversationStore } from '../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import { conversationAdmission } from '../../src/modules/conversations/infrastructure/conversation-accounting';
import { ConversationService } from '../../src/modules/conversations/application/conversation-service';
import { createConversationRoutes } from '../../src/modules/conversations/interface/http/conversation.routes';
import { AuthHttpPolicy } from '../../src/modules/authentication/interface/http/auth-http-policy';
import { RedisRateLimiter } from '../../src/modules/authentication/infrastructure/rate-limit/redis-rate-limiter';
import { textAiModelCatalog } from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { conversationExecutionObservationId } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { aiProviderPriceRevisionsTable } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { aiAccountingSettingsRevisionsTable } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { usersTable } from '../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    fixtureRouteFingerprint,
    seedTextAiRoutingFixture,
} from '../support/text-ai-routing-fixture';
import {
    percentile,
    validatePerformanceTargets,
} from './accounting-load-metrics';

type AdmissionQueryTrace = {
    queries: string[];
    durations: Array<{ query: string; durationMs: number }>;
    lastQuery?: { query: string; startedAt: number };
};

/**
 * Drizzle exposes a pre-execution logger only. Within one admission trace the
 * next logged statement marks the preceding statement's completion boundary;
 * finishing the trace closes the last statement. These are inter-query elapsed
 * times, so they include tiny intervening application work and are diagnostic,
 * not server-side PostgreSQL execution timings.
 */
function closeAdmissionQueryTrace(trace: AdmissionQueryTrace, at: number) {
    if (!trace.lastQuery) return;
    trace.durations.push({
        query: trace.lastQuery.query,
        durationMs: at - trace.lastQuery.startedAt,
    });
    delete trace.lastQuery;
}

// Explicit opt-in; ordinary backend tests never create the million-row fixture.
const enabled = process.env.ALLOW_ACCOUNTING_PERFORMANCE_TESTS === 'true';
const root = resolve(import.meta.dirname, '../../../..');
async function hashes(directory: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const entry of await readdir(resolve(root, directory), {
        withFileTypes: true,
    })) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) Object.assign(result, await hashes(path));
        else
            result[path] = createHash('sha256')
                .update(await readFile(resolve(root, path)))
                .digest('hex');
    }
    return result;
}

describe.runIf(enabled)('AC9 deterministic real accounting/stream load', () => {
    it('measures full conversation admission with million-row history and 100 real SSE subscriptions', async () => {
        const target = validatePerformanceTargets(process.env);
        const output = process.env.ACCOUNTING_PERF_EVIDENCE_PATH;
        if (!output)
            throw new Error(
                'ACCOUNTING_PERF_EVIDENCE_PATH required to retain evidence.',
            );
        // The accepted workload always uses 100 subscriptions. Zero is an
        // intentionally narrow diagnostic control that isolates subscription
        // reads from admission contention without changing the API or fixture.
        const requestedStreams =
            process.env.ACCOUNTING_PERF_DIAGNOSTIC_STREAMS === undefined
                ? 100
                : Number(process.env.ACCOUNTING_PERF_DIAGNOSTIC_STREAMS);
        if (![0, 100].includes(requestedStreams))
            throw new Error(
                'ACCOUNTING_PERF_DIAGNOSTIC_STREAMS must be 0 or 100.',
            );
        const captureLockDiagnostics =
            process.env.ACCOUNTING_PERF_CAPTURE_LOCK_DIAGNOSTICS === 'true';
        const client = createPostgresClient({
            databaseUrl: target.databaseUrl,
            maxConnections: 20,
        });
        const redis = createAuthenticationRedisClient({ url: target.redisUrl });
        const context = new AsyncLocalStorage<AdmissionQueryTrace>();
        const admissionSelects = new Map<string, unknown[]>();
        const db = drizzle(client, {
            schema: databaseSchema,
            logger: {
                logQuery(query, params) {
                    const trace = context.getStore();
                    if (!trace) return;
                    const now = performance.now();
                    closeAdmissionQueryTrace(trace, now);
                    trace.queries.push(query);
                    trace.lastQuery = { query, startedAt: now };
                    if (/^select\s/i.test(query))
                        admissionSelects.set(query, params);
                },
            },
        });
        const controllers: AbortController[] = [];
        const drains: Promise<void>[] = [];
        const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
        const owners: string[] = [],
            chats: string[] = [],
            admissionChats: string[] = [];
        const phases: Record<string, unknown>[] = [];
        const claimed: ClaimedConversationTurn[] = [];
        let writing = true;
        let writer: Promise<void> | undefined;
        let writerFailure: unknown;
        let persistedBatches = 0;
        const runId = randomUUID();
        let activeStreams = 0,
            receivedFrames = 0,
            streamFailures = 0;
        // The production capacity policy admits at most ten provider attempts.
        // Reserve one slot for each measured accepted admission while retaining
        // 100 subscribed chats under active load.
        const runningFixtureTurns = 8;
        const startedAt = new Date();
        const sourceBefore = {
            ...(await hashes('apps/backend/src')),
            ...(await hashes('apps/backend/drizzle')),
            ...(await hashes('packages/contracts/src')),
            ...(await hashes('packages/database/src')),
            ...(await hashes('apps/backend/tests/performance')),
            'apps/backend/tests/support/text-ai-routing-fixture.ts': createHash(
                'sha256',
            )
                .update(
                    await readFile(
                        resolve(
                            root,
                            'apps/backend/tests/support/text-ai-routing-fixture.ts',
                        ),
                    ),
                )
                .digest('hex'),
        };
        try {
            await redis.connect();
            await redis.ping();
            await runPostgresMigrations({
                client,
                migrationsFolder: resolve(root, 'apps/backend/drizzle'),
                purpose: grantDisposableMigrationPurpose(),
            });
            // Reruns require a separately recreated empty database. No resets, truncates or Redis FLUSH.
            const [existing] =
                await client`select count(*)::int as count from users`;
            if (existing!.count !== 0)
                throw new Error(
                    'Performance database must be empty; provision a fresh isolated target.',
                );
            const model = textAiModelCatalog.find(
                (entry) => entry.id === 'deepseek-flash',
            )!;
            const revision = randomUUID();
            const now = new Date();
            for (let n = 0; n < 100; n++) {
                const owner = randomUUID(),
                    dictionary = randomUUID();
                owners.push(owner);
                await client`insert into users(id,status) values(${owner},'active')`;
                await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag) values(${dictionary},${owner},'Synthetic load source','es','en')`;
                await db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                        ownerId: owner,
                        amount: 1_000_000_000n,
                        createdAt: now,
                        expiresAt: null,
                        source: 'admin',
                        sourceReference: randomUUID(),
                    }),
                );
                // Sources are private owner dictionaries. Unused note/share capabilities fail explicitly.
                const store = makeStore();
                const chat = await store.create(
                    { ownerId: owner },
                    { source: { kind: 'dictionary', id: dictionary } },
                );
                chats.push(chat.id);
                admissionChats.push(
                    (
                        await store.create(
                            { ownerId: owner },
                            { source: { kind: 'dictionary', id: dictionary } },
                        )
                    ).id,
                );
            }
            await db.insert(dictionaryAiConfigurationRevisionsTable).values({
                id: revision,
                version: 1,
                createdByUserId: owners[0]!,
                catalogSnapshot: {
                    ...model,
                    modelId: model.id,
                    enabledModelIds: [model.id],
                    supportedFormats: ['conversation:v1'],
                },
            });
            await db.insert(dictionaryAiConfigurationTable).values({
                id: 'global',
                version: 1,
                activeRevisionId: revision,
            });
            await db.insert(dictionaryAiWorkerObservationsTable).values({
                id: conversationExecutionObservationId(
                    runId,
                    model.providerId,
                    model.id,
                ),
                workerId: runId,
                providerId: model.providerId,
                modelId: model.id,
                adapterRevision: model.adapterRevision,
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 600_000),
                status: 'available',
                message: 'Synthetic no-dispatch load fixture',
                textAiSelectionRevision: 1,
                textAiSupportedFormats: ['conversation:v1'],
                textAiCapacityRevision: 1,
                textsCapacityRevision: 1,
                conversationCapacityRevision: 1,
                conversationExecutionRevision: 1,
                creditSettlementRevision: 1,
            });
            await db.insert(aiAccountingSettingsRevisionsTable).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '100000',
                maxProviderCostUsdPerAction: '100',
                maxProviderCostUsdPerAccountDay: '10000',
                maxProviderCostUsdPerDay: '100000',
                createdAt: now,
                reason: 'Synthetic load fixture only',
            });
            await db.insert(aiProviderPriceRevisionsTable).values({
                id: randomUUID(),
                providerId: model.providerId,
                modelId: model.id,
                meter: 'text-tokens',
                version: 1,
                effectiveAt: now,
                createdAt: now,
                data: {
                    providerId: model.providerId,
                    modelId: model.id,
                    meter: 'text-tokens',
                    inputUsdPerMillionTokens: '0.001',
                    outputUsdPerMillionTokens: '0.001',
                    cacheReadUsdPerMillionTokens: '0.001',
                    cacheWriteUsdPerMillionTokens: '0.001',
                    usdPer1000Characters: null,
                    effectiveAt: now.toISOString(),
                    sourceReference:
                        'Synthetic fixture; never production pricing',
                    sourceUrl: null,
                    reason: 'Synthetic no-provider load fixture',
                },
            });
            await seedTextAiRoutingFixture(db, { at: now });
            function makeStore() {
                return new DrizzleConversationStore({
                    database: db,
                    sources: new ConversationSourceResolver({
                        verifyDictionaryShare: async () => false,
                        verifyTextShare: async () => false,
                        readNote: async () => {
                            throw new Error(
                                'Knowledge source outside load fixture',
                            );
                        },
                    }),
                    admitTurn: conversationAdmission({
                        routingEnabled: true,
                        credentialConfigured: () => true,
                        routeFingerprint: fixtureRouteFingerprint,
                    }),
                    publishNote: async () => {
                        throw new Error('No publishing in load fixture');
                    },
                });
            }
            const store = makeStore();
            const limiter = new RedisRateLimiter({
                redis,
                namespace: `accounting-load-${runId}`,
                hmacSecret: 'synthetic-load-fixture-secret-no-production-use',
            });
            const app = createConversationRoutes({
                service: new ConversationService(
                    store,
                    async (token) => {
                        const owner = token.split('.')[1]!;
                        if (
                            !token.startsWith('fixture.') ||
                            !token.endsWith('.signature') ||
                            !owners.includes(owner)
                        )
                            throw new Error('Unknown synthetic actor');
                        // Real PG identity lookup on every revalidation. This goes through
                        // the instrumented Drizzle client so the admission evidence includes
                        // its query shape; credential cryptography remains deliberately excluded.
                        const [user] = await db
                            .select({ id: usersTable.id })
                            .from(usersTable)
                            .where(
                                and(
                                    eq(usersTable.id, owner),
                                    eq(usersTable.status, 'active'),
                                ),
                            );
                        if (!user)
                            throw new Error('Synthetic actor unavailable');
                        return { userId: owner };
                    },
                    limiter,
                    limiter,
                ),
                policy: new AuthHttpPolicy({
                    allowedOrigins: ['http://localhost:3333'],
                    appEnvironment: 'test',
                    refreshTokenTtlSeconds: 3600,
                }),
            });
            // Real admission seeds100active turns; real worker claims8, leaving92queued.
            // Two provider slots remain available while route admissions/finalizers hand off.
            // Admissions use separate chats and settle immediately to keep capacity bounded.
            for (let n = 0; n < 100; n++) {
                const turn = await store.submit(
                    { ownerId: owners[n]! },
                    chats[n]!,
                    {
                        requestId: randomUUID(),
                        content: 'Synthetic deterministic question',
                        attachments: [],
                    },
                );
                if (n < runningFixtureTurns) {
                    const running = await store.claim();
                    expect(running).not.toBeNull();
                    claimed.push(running!);
                }
                expect(turn.status).toBe('queued');
            }
            async function finalize(
                turnId: string,
                ownerId: string,
                conversationId: string,
            ) {
                // Exercise the real queued terminal path, including capacity,
                // actor/source/turn fences, publication and zero-usage settlement.
                await store.stop({ ownerId }, conversationId, turnId);
            }
            await Promise.all(
                chats.slice(0, requestedStreams).map(async (chat, n) => {
                    const controller = new AbortController();
                    controllers.push(controller);
                    const response = await app.request(
                        `/conversations/${chat}/events`,
                        {
                            signal: controller.signal,
                            headers: {
                                Authorization: `Bearer fixture.${owners[n]}.signature`,
                            },
                        },
                    );
                    expect(response.status).toBe(200);
                    const reader = response.body!.getReader();
                    readers.push(reader);
                    const initial = await reader.read();
                    expect(initial.done).toBe(false);
                    activeStreams++;
                    receivedFrames++;
                    drains.push(
                        (async () => {
                            try {
                                while (!(await reader.read()).done)
                                    receivedFrames++;
                            } catch {
                                if (!controller.signal.aborted)
                                    streamFailures++;
                            } finally {
                                activeStreams--;
                            }
                        })(),
                    );
                }),
            );
            writer = (async () => {
                try {
                    let nextHeartbeatAt = Date.now() + 5_000;
                    while (writing) {
                        const tick = performance.now();
                        const heartbeatDue = Date.now() >= nextHeartbeatAt;
                        if (heartbeatDue) nextHeartbeatAt = Date.now() + 5_000;
                        await Promise.all(
                            claimed.map(async (turn) => {
                                // Match ConversationWorkerService's production default.
                                // Output remains persisted every 100ms; lease renewal is
                                // independent and occurs every five seconds.
                                if (heartbeatDue) await store.heartbeat(turn);
                                await store.append(
                                    turn,
                                    'Deterministic provider fixture output. ',
                                );
                                persistedBatches++;
                            }),
                        );
                        await delay(
                            Math.max(0, 100 - (performance.now() - tick)),
                        );
                    }
                } catch (failure) {
                    writerFailure = failure;
                }
            })();
            const [server] = await client`select version() as version`;
            // Establish steady streaming/polling before measuring admission.
            // The measured target is concurrent live streams, not SSE startup.
            await delay(2000);
            async function submitThroughRoute(n: number) {
                const response = await app.request(
                    `/conversations/${admissionChats[n]!}/turns`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer fixture.${owners[n]}.signature`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            requestId: randomUUID(),
                            content: 'Synthetic deterministic admission',
                            attachments: [],
                        }),
                    },
                );
                if (response.status !== 200)
                    throw new Error(
                        `Synthetic admission route failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
                    );
                return (await response.json()) as { turn: { id: string } };
            }
            const measure = async (label: string, count: number) => {
                const durationMs: number[] = [],
                    lagMs: number[] = [],
                    queryCounts: number[] = [];
                const statements = new Map<string, number>();
                const statementDurations = new Map<string, number[]>();
                let lockWaitSamples = 0,
                    maxLockWaiters = 0;
                const lockDiagnostics: unknown[] = [];
                let sampling = true;
                const sampler = (async () => {
                    while (sampling) {
                        const [waiters] =
                            await client`select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event_type='Lock'`;
                        if (waiters!.count > 0) lockWaitSamples++;
                        maxLockWaiters = Math.max(
                            maxLockWaiters,
                            waiters!.count,
                        );
                        if (
                            captureLockDiagnostics &&
                            waiters!.count > 0 &&
                            lockDiagnostics.length < 20
                        ) {
                            // Record only lock identities/counts and transaction ages;
                            // never copy SQL text from pg_stat_activity because it can
                            // contain request data under a simple-protocol deployment.
                            const details = await client`select
                                wait.wait_event as wait_event,
                                wait.wait_event_type as wait_event_type,
                                floor(extract(epoch from clock_timestamp() - wait.xact_start) * 1000)::int as waiting_xact_age_ms,
                                cardinality(pg_blocking_pids(wait.pid)) as blocking_pid_count,
                                coalesce((select json_agg(json_build_object('classId', lock.classid, 'objectId', lock.objid, 'mode', lock.mode, 'granted', lock.granted))
                                    from pg_locks lock where lock.pid=wait.pid and lock.locktype='advisory'), '[]'::json) as waiter_advisory_locks,
                                coalesce((select json_agg(json_build_object('classId', lock.classid, 'objectId', lock.objid, 'mode', lock.mode, 'granted', lock.granted))
                                    from pg_locks lock where lock.pid=any(pg_blocking_pids(wait.pid)) and lock.locktype='advisory'), '[]'::json) as blocker_advisory_locks
                                from pg_stat_activity wait
                                where wait.datname=current_database() and wait.wait_event_type='Lock'`;
                            lockDiagnostics.push({
                                at: new Date().toISOString(),
                                waiters: details,
                            });
                        }
                        await delay(100);
                    }
                })();
                const start = performance.now();
                const pending: Promise<
                    { ok: true } | { ok: false; error: string }
                >[] = [];
                for (let index = 0; index < count; index++) {
                    await delay(
                        Math.max(0, start + index * 100 - performance.now()),
                    );
                    lagMs.push(
                        Math.max(0, performance.now() - (start + index * 100)),
                    );
                    // Handle rejections when they are created. This workload starts
                    // requests before joining them, so Promise.allSettled at the end
                    // would otherwise be too late for Node's rejection tracker.
                    pending.push(
                        (async () => {
                            const n = 10 + (index % 90);
                            const trace: AdmissionQueryTrace = {
                                queries: [],
                                durations: [],
                            };
                            const begin = performance.now();
                            const response = await context.run(trace, () =>
                                submitThroughRoute(n),
                            );
                            closeAdmissionQueryTrace(trace, performance.now());
                            durationMs.push(performance.now() - begin);
                            queryCounts.push(trace.queries.length);
                            for (const query of trace.queries)
                                statements.set(
                                    query,
                                    (statements.get(query) ?? 0) + 1,
                                );
                            for (const timing of trace.durations) {
                                const samples = statementDurations.get(
                                    timing.query,
                                );
                                if (samples) samples.push(timing.durationMs);
                                else
                                    statementDurations.set(timing.query, [
                                        timing.durationMs,
                                    ]);
                            }
                            await finalize(
                                response.turn.id,
                                owners[n]!,
                                admissionChats[n]!,
                            );
                        })().then(
                            () => ({ ok: true as const }),
                            (error: unknown) => ({
                                ok: false as const,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            }),
                        ),
                    );
                }
                const results = await Promise.all(pending);
                sampling = false;
                await sampler;
                const failures = results
                    .filter(
                        (entry): entry is { ok: false; error: string } =>
                            !entry.ok,
                    )
                    .map((entry) => entry.error);
                phases.push({
                    label,
                    count,
                    successful: durationMs.length,
                    failures,
                    p50Ms: durationMs.length
                        ? percentile(durationMs, 0.5)
                        : null,
                    p95Ms: durationMs.length
                        ? percentile(durationMs, 0.95)
                        : null,
                    maxMs: Math.max(...durationMs),
                    maxSchedulingLagMs: Math.max(...lagMs),
                    queriesPerAdmission: {
                        min: Math.min(...queryCounts),
                        max: Math.max(...queryCounts),
                    },
                    lockWaitSamples,
                    maxLockWaiters,
                    ...(captureLockDiagnostics ? { lockDiagnostics } : {}),
                    activeStreams,
                    receivedFrames,
                    statements: [...statements].map(([query, calls]) => ({
                        query,
                        calls,
                    })),
                    queryTiming: [...statementDurations].map(
                        ([query, samples]) => ({
                            query,
                            samples: samples.length,
                            p50Ms: percentile(samples, 0.5),
                            p95Ms: percentile(samples, 0.95),
                            maxMs: Math.max(...samples),
                        }),
                    ),
                });
            };
            await measure('small-history-baseline', 100);
            // Genuine immutable ledger facts for the SAME active owners. No naked
            // actions: every real action requires owned feature/policy authority.
            // This isolates history-size effects without inventing feature outcomes.
            await client`insert into ai_credit_history(id,owner_id,kind,amount,reason,created_at)
                select md5('accounting-load-ledger-' || n::text)::uuid, (${client.array(owners)}::uuid[])[1+(n%100)::int], 'policy_update', 0, 'Synthetic historical policy update', now()-interval '2 days' from generate_series(1,1000000) n`;
            await client`analyze ai_credit_history`;
            const [history] =
                await client`select count(*)::int as count from ai_credit_history where reason='Synthetic historical policy update'`;
            const [actionHistory] =
                await client`select count(*)::int as count from ai_credit_actions where state='settled'`;
            expect(history!.count).toBeGreaterThanOrEqual(1_000_000);
            await measure('million-history-loaded', 300);
            const [historyAfterAdmission] =
                await client`select count(*)::int as count from ai_credit_history where reason='Synthetic historical policy update'`;
            expect(historyAfterAdmission!.count).toBe(history!.count);
            for (const query of admissionSelects.keys())
                expect(query).not.toMatch(/\bai_credit_history\b/i);
            const plans = [];
            for (const [query, parameters] of admissionSelects) {
                plans.push({
                    query,
                    plan: await client.unsafe(
                        `explain (analyze,buffers,format json) ${query}`,
                        parameters as Parameters<typeof client.unsafe>[1],
                    ),
                });
            }
            const sourceAfter = {
                ...(await hashes('apps/backend/src')),
                ...(await hashes('apps/backend/drizzle')),
                ...(await hashes('packages/contracts/src')),
                ...(await hashes('packages/database/src')),
                ...(await hashes('apps/backend/tests/performance')),
                'apps/backend/tests/support/text-ai-routing-fixture.ts':
                    createHash('sha256')
                        .update(
                            await readFile(
                                resolve(
                                    root,
                                    'apps/backend/tests/support/text-ai-routing-fixture.ts',
                                ),
                            ),
                        )
                        .digest('hex'),
            };
            const evidence = {
                runId,
                startedAt: startedAt.toISOString(),
                finishedAt: new Date().toISOString(),
                testedLayer:
                    'Real Hono POST admission and SSE routes, production ConversationService Redis rate admission, DrizzleConversationStore.submit + conversationAdmission + wallet/capability/rate/capacity PostgreSQL queries, and real Redis stream leases. Admission timing starts before the POST route and ends after its successful response, including auth revalidation, Redis request limiting, source auth, transaction commit and queued-job/event persistence. It excludes TCP/proxy buffering, credential cryptography and provider latency. Synthetic fixture never dispatches providers.',
                workload: {
                    streams: requestedStreams,
                    activeQueuedTurns: 100 - runningFixtureTurns,
                    activeRunningTurns: runningFixtureTurns,
                    admissionsPerSecond: 10,
                    historyRows: history!.count,
                    ledgerHistoryRows: history!.count,
                    ledgerHistoryRowsAfterAdmission:
                        historyAfterAdmission!.count,
                    settledActionRows: actionHistory!.count,
                    elapsed: '10s baseline and30s loaded',
                    streamingWarmupMs: 2000,
                    providerCalls: 0,
                    streamFailures,
                    receivedFrames,
                    persistedBatches,
                    writerFailure: writerFailure ? String(writerFailure) : null,
                },
                hardware: {
                    platform: platform(),
                    release: release(),
                    cpu: cpus()[0]?.model,
                    logicalCpus: cpus().length,
                    totalMemoryBytes: totalmem(),
                    node: process.version,
                    postgres: server!.version,
                    poolMax: 20,
                    redisVersion: (await redis.info('server')).match(
                        /redis_version:([^\r]+)/,
                    )?.[1],
                },
                phases,
                plans,
                sourceHashes: sourceBefore,
                databaseTarget: target.databaseName,
                redisDatabase: 3,
                sourceUnchangedDuringRun:
                    JSON.stringify(sourceBefore) ===
                    JSON.stringify(sourceAfter),
                limitations: [
                    'In-process Hono streaming excludes TCP/proxy buffering.',
                    'All100subscriptions use production polling: running output125ms, queued streams back off to750–1000ms after four unchanged polls. A2000ms streaming warm-up precedes measurement. Eight running and92queued turns come from real store admission/claim. Two provider slots remain available while measured route admissions and their immediate finalizers hand off. No worker/provider dispatch occurs.',
                    'One million historical rows are immutable zero-amount policy-update ledger facts across the same active owners. Settled actions are only the real baseline admissions; this does not establish million-action/allocation/provider-history performance.',
                    'No provider or generation worker throughput claim.',
                    'Each measured queued turn is finalized through the production store Stop path after its admission timer stops; those terminal transactions overlap subsequent admissions.',
                    'pg_stat_activity lock samples are sampled waiter counts, not exact lock duration.',
                    'EXPLAIN ANALYZE captures each distinct admission SELECT, including locking queries. Trigger internals need separate SQL review.',
                ],
            };
            await mkdir(resolve(output, '..'), { recursive: true });
            await writeFile(output, JSON.stringify(evidence, null, 2));
            expect(writerFailure).toBeUndefined();
            expect(persistedBatches).toBeGreaterThan(0);
            expect(evidence.sourceUnchangedDuringRun).toBe(true);
            for (const phase of phases) {
                expect(phase.failures).toEqual([]);
                expect(phase.successful).toBe(phase.count);
                expect(phase.activeStreams).toBe(requestedStreams);
                expect(phase.maxSchedulingLagMs).toBeLessThanOrEqual(100);
            }
            expect(streamFailures).toBe(0);
            const loaded = phases[1] as { p95Ms: number };
            expect(loaded.p95Ms).not.toBeNull();
            expect(loaded.p95Ms).toBeLessThanOrEqual(100);
        } finally {
            writing = false;
            await writer;
            controllers.forEach((controller) => controller.abort());
            await Promise.allSettled(readers.map((reader) => reader.cancel()));
            await Promise.allSettled(drains);
            redis.disconnect();
            await client.end();
        }
    }, 600_000);
});
