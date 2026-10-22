import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleSpeechStore } from '../../../../src/modules/speech/infrastructure/drizzle-speech-store';
import { FixtureSpeechProvider } from '../../../../src/modules/speech/infrastructure/audio/speech-providers';
import { PostgresAudioObjectStorage } from '../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { SpeechWorker } from '../../../../src/modules/speech/application/speech-worker';
import { SpeechTaskFailedError } from '../../../../src/modules/speech/application/ports/speech-synthesis-provider';
import { DrizzleProviderPriceStore } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiAccountingSettingsRevisionsTable as settings } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderExpenseRecordsTable as expenses } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { aiOperatorActionBudgetsTable as budgets } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/operator-budget-schema';
import {
    speechJobsTable as jobs,
    speechDailyAdmissionCountersTable as quotas,
} from '../../../../src/modules/speech/infrastructure/schema';
import type { SpeechSource } from '@languon/contracts';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'actual dictionary worker role speech accounting',
    () => {
        let client: PostgresClient,
            db: PostgresJsDatabase<typeof databaseSchema>,
            ownerId: string;
        const provider = new FixtureSpeechProvider();
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            ownerId = randomUUID();
            await db
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 1_000_000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'migration',
                    sourceReference: randomUUID(),
                }),
            );
            await db.insert(settings).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '10',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: new Date(),
                reason: 'Synthetic disposable worker limits',
            });
            await new DrizzleProviderPriceStore(db).publish(
                {
                    expectedVersion: 0,
                    providerId: 'fixture',
                    modelId: 'tone-v1',
                    meter: 'speech-characters',
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: '0.01',
                    effectiveAt: '2020-01-01T00:00:00.000Z',
                    sourceReference: 'Synthetic fixture',
                    sourceUrl: null,
                    reason: 'Synthetic disposable speech rate',
                },
                ownerId,
                new Date(),
            );
        }, 120000);
        afterAll(async () => {
            await client?.end();
        });
        it.each(['free-success', 'paid-failure'] as const)(
            'executes %s and bounded quota cleanup with exact deployed grants',
            async (outcome) => {
                const text =
                    outcome === 'free-success'
                        ? 'bonjour'
                        : 'A deliberately longer sentence contains more than ten distinct words and needs confirmed pronunciation credits.';
                const source: SpeechSource = {
                    kind: 'dictionary-field',
                    access: { kind: 'owner', dictionaryId: randomUUID() },
                    cardId: randomUUID(),
                    field: 'source',
                };
                const makeStore = (
                    database: PostgresJsDatabase<typeof databaseSchema>,
                ) =>
                    new DrizzleSpeechStore({
                        database,
                        fingerprintSecret:
                            'synthetic-speech-worker-role-secret',
                        profileResolver: provider,
                        storageIdentity: new PostgresAudioObjectStorage(
                            database,
                        ).identity,
                        generationEnabled: true,
                        playbackEnabled: true,
                        revalidateSource: async () => ({
                            text,
                            language: 'fr',
                            revision: '1',
                        }),
                    });
                const admission = makeStore(db),
                    prepared = await admission.prepare({
                        actorId: ownerId,
                        source,
                        resolved: { text, language: 'fr', revision: '1' },
                        operationId: randomUUID(),
                        now: new Date(),
                    });
                if (prepared.quote)
                    await admission.confirm({
                        actorId: ownerId,
                        quoteId: prepared.quote.id,
                        operationId: randomUUID(),
                        now: new Date(),
                    });
                const [admitted] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.payerId, ownerId));
                expect(admitted).toBeDefined();
                expect(admitted!.credits > 0n).toBe(outcome === 'paid-failure');
                await db.insert(quotas).values({
                    day: '2000-01-01',
                    scope: `owner:${ownerId}`,
                    freeCount: 1,
                    estimatedUnits: 1n,
                });
                const role = `speech_worker_${randomUUID().replaceAll('-', '')}`;
                await client.unsafe(`create role ${role} nologin`);
                const script = await readFile(
                    new URL(
                        '../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                        import.meta.url,
                    ),
                    'utf8',
                );
                let restrictedClient: PostgresClient | undefined;
                try {
                    await client.unsafe(
                        script
                            .split('\n')
                            .filter((line) => !line.startsWith('\\'))
                            .join('\n')
                            .replaceAll(':"dictionary_worker_role"', role),
                    );
                    const databaseUrl = new URL(getTestDatabaseUrl());
                    databaseUrl.searchParams.set('options', `-c role=${role}`);
                    restrictedClient = createPostgresClient({
                        databaseUrl: databaseUrl.toString(),
                        maxConnections: 2,
                    });
                    const restrictedDb = createDrizzleDatabase(
                        restrictedClient,
                        databaseSchema,
                    );
                    expect(
                        (
                            await restrictedDb.execute(
                                sql`select current_user role_name`,
                            )
                        )[0]?.role_name,
                    ).toBe(role);
                    await expect(
                        restrictedClient`update speech_jobs set provider_dispatched_at='2000-01-01'::timestamptz where id=${admitted!.id}::uuid`,
                    ).rejects.toThrow('permission denied');
                    await expect(
                        restrictedClient`select languon_admit_speech_provider_attempt(${admitted!.id}::uuid)`,
                    ).rejects.toThrow('permission denied');
                    for (const token of [null, randomUUID()])
                        await expect(
                            restrictedClient`select languon_admit_speech_provider_attempt(${admitted!.id}::uuid,${token}::uuid)`,
                        ).rejects.toThrow();
                    await expect(
                        restrictedClient.begin(async (tx) => {
                            await tx`select set_config('languon.speech_worker_version','1',true)`;
                            const lease = randomUUID();
                            await tx`update speech_jobs set state='submitting',lease_token=${lease}::uuid,lease_expires_at=clock_timestamp()+interval '1 minute' where id=${admitted!.id}::uuid`;
                            await expect(
                                tx.savepoint(
                                    (sp) =>
                                        sp`select languon_admit_speech_provider_attempt(${admitted!.id}::uuid,${randomUUID()}::uuid)`,
                                ),
                            ).rejects.toThrow();
                            await tx`update speech_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=${admitted!.id}::uuid`;
                            await expect(
                                tx.savepoint(
                                    (sp) =>
                                        sp`select languon_admit_speech_provider_attempt(${admitted!.id}::uuid,${lease}::uuid)`,
                                ),
                            ).rejects.toThrow();
                            throw new Error(
                                'Rollback synthetic lease witnesses',
                            );
                        }),
                    ).rejects.toThrow('Rollback synthetic lease witnesses');
                    await expect(
                        restrictedClient`select languon_cancel_speech_for_scheduled_deletion(${ownerId}::uuid)`,
                    ).rejects.toThrow('permission denied');
                    // A provider reference cannot preempt the authoritative speech observation.
                    for (const reference of [
                        `speech:${admitted!.id}`,
                        `conversation:${randomUUID()}`,
                    ]) {
                        await expect(
                            restrictedClient`insert into ai_provider_expense_records(id,source_kind,attempt_reference,action_id,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at) values(${randomUUID()}::uuid,'speech-attempt',${reference},${admitted!.id}::uuid,'forged','forged','estimated','calculated',0,clock_timestamp())`,
                        ).rejects.toThrow('permission denied');
                    }
                    await expect(
                        restrictedClient`select languon_record_speech_provider_expense(${admitted!.id}::uuid,'ready')`,
                    ).rejects.toThrow();
                    const workerStore = makeStore(restrictedDb),
                        storage = new PostgresAudioObjectStorage(restrictedDb);
                    await workerStore.releaseDeadlines(new Date());
                    expect(
                        await db
                            .select()
                            .from(quotas)
                            .where(
                                and(
                                    eq(quotas.day, '2000-01-01'),
                                    eq(quotas.scope, `owner:${ownerId}`),
                                ),
                            ),
                    ).toHaveLength(0);
                    const synthesis =
                        outcome === 'free-success'
                            ? provider
                            : Object.assign(new FixtureSpeechProvider(), {
                                  submit: async () => {
                                      throw new SpeechTaskFailedError(
                                          'generation_failed',
                                      );
                                  },
                              });
                    await new SpeechWorker({
                        store: workerStore,
                        storage,
                        providers: new Map([
                            [provider.configurationId, synthesis],
                        ]),
                    }).runOnce();
                    expect(
                        (
                            await db
                                .select()
                                .from(jobs)
                                .where(eq(jobs.id, admitted!.id))
                        )[0],
                    ).toMatchObject({
                        state: outcome === 'free-success' ? 'ready' : 'failed',
                        billingState:
                            outcome === 'free-success'
                                ? 'free'
                                : 'released_no_charge',
                    });
                    const [dispatched] = await db
                        .select({ at: jobs.providerDispatchedAt })
                        .from(jobs)
                        .where(eq(jobs.id, admitted!.id));
                    expect(dispatched?.at?.getTime()).toBeGreaterThanOrEqual(
                        admitted!.createdAt.getTime(),
                    );
                    const [fact] = await db
                        .select()
                        .from(expenses)
                        .where(eq(expenses.actionId, admitted!.id));
                    expect(fact).toMatchObject(
                        outcome === 'free-success'
                            ? {
                                  measurement: 'estimated',
                                  costSource: 'calculated',
                                  amountUsdMicros: 70n,
                              }
                            : {
                                  measurement: 'unknown',
                                  costSource: 'unknown',
                                  amountUsdMicros: null,
                              },
                    );
                    await expect(
                        restrictedClient`select languon_admit_speech_provider_attempt(${admitted!.id}::uuid,${admitted!.leaseToken}::uuid)`,
                    ).rejects.toThrow();
                    const canonicalOutcome =
                        outcome === 'free-success' ? 'ready' : 'unknown';
                    await expect(
                        restrictedClient`select languon_record_speech_provider_expense(${admitted!.id}::uuid,${canonicalOutcome})`,
                    ).resolves.toBeDefined();
                    await expect(
                        restrictedClient`select languon_record_speech_provider_expense(${admitted!.id}::uuid,${canonicalOutcome === 'ready' ? 'unknown' : 'ready'})`,
                    ).rejects.toThrow();
                    expect(
                        (
                            await db
                                .select()
                                .from(budgets)
                                .where(eq(budgets.actionId, admitted!.id))
                        )[0]?.state,
                    ).toBe('settled');
                    const wallet = await db.transaction((tx) =>
                        new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).accountSummary(ownerId, new Date()),
                    );
                    expect(wallet.consumedCredits).toBe(0n);
                    expect(wallet.reservedCredits).toBe(0n);
                } finally {
                    await restrictedClient?.end({ timeout: 1 });
                    await client.unsafe(`drop owned by ${role}`);
                    await client.unsafe(`drop role ${role}`);
                }
            },
        );
    },
);
