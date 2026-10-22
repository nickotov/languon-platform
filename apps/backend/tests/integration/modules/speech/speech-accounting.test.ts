import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    DrizzleSpeechStore,
    cancelSpeechActorForScheduledDeletion,
} from '../../../../src/modules/speech/infrastructure/drizzle-speech-store';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { createFixtureAudio } from '../../../../src/modules/speech/domain/audio-integrity';
import { FixtureSpeechProvider } from '../../../../src/modules/speech/infrastructure/audio/speech-providers';
import { PostgresAudioObjectStorage } from '../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { SpeechWorker } from '../../../../src/modules/speech/application/speech-worker';
import type { SpeechSource } from '@languon/contracts';
import { DrizzleProviderPriceStore } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { aiAccountingSettingsRevisionsTable as settings } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderExpenseRecordsTable as expenses } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import {
    aiOperatorActionBudgetsTable as budgets,
    aiOperatorDailyBudgetsTable as daily,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/operator-budget-schema';
import {
    speechJobsTable as jobs,
    speechDailyAdmissionCountersTable as quotas,
} from '../../../../src/modules/speech/infrastructure/schema';
import { SpeechSubmissionError } from '../../../../src/modules/speech/application/ports/speech-synthesis-provider';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

/** All tariffs and limits are explicit disposable fixture values, never production defaults. */
describe.runIf(isDatabaseIntegrationEnabled())(
    'speech USD accounting authority',
    () => {
        let client: PostgresClient,
            db: PostgresJsDatabase<typeof databaseSchema>,
            store: DrizzleSpeechStore,
            storage: PostgresAudioObjectStorage;
        let owner: string, text: string;
        const provider = new FixtureSpeechProvider();
        const source: SpeechSource = {
            kind: 'dictionary-field',
            access: { kind: 'owner', dictionaryId: randomUUID() },
            cardId: randomUUID(),
            field: 'source',
        };
        const price = (amount: string, expectedVersion: number) =>
            new DrizzleProviderPriceStore(db).publish(
                {
                    expectedVersion,
                    providerId: 'fixture',
                    modelId: 'tone-v1',
                    meter: 'speech-characters',
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: amount,
                    effectiveAt: '2020-01-01T00:00:00.000Z',
                    sourceReference: 'Synthetic speech fixture',
                    sourceUrl: null,
                    reason: 'Synthetic disposable speech tariff',
                },
                owner,
                new Date(),
            );
        const prepare = () =>
            store.prepare({
                actorId: owner,
                source,
                resolved: { text, language: 'fr', revision: '1' },
                operationId: randomUUID(),
                now: new Date(),
            });
        const worker = (synthesis = provider) =>
            new SpeechWorker({
                store,
                storage,
                providers: new Map([[provider.configurationId, synthesis]]),
            });
        const job = async () =>
            (await db.select().from(jobs).where(eq(jobs.payerId, owner)))[0]!;
        const expense = async () =>
            (
                await db
                    .select()
                    .from(expenses)
                    .where(eq(expenses.actionId, (await job()).id))
            )[0]!;
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            owner = randomUUID();
            text = 'bonjour';
            await db.insert(usersTable).values({
                id: owner,
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await db.insert(settings).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '10',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: new Date(),
                reason: 'Synthetic disposable speech limits',
            });
            await price('0.01', 0);
            storage = new PostgresAudioObjectStorage(db);
            store = new DrizzleSpeechStore({
                database: db,
                fingerprintSecret: 'synthetic-speech-accounting-secret',
                profileResolver: provider,
                storageIdentity: storage.identity,
                generationEnabled: true,
                playbackEnabled: true,
                revalidateSource: async () => ({
                    text,
                    language: 'fr',
                    revision: '1',
                }),
            });
        }, 120000);
        afterAll(async () => {
            if (client) await client.end();
        });
        it('pins provider USD independently and records estimated synthesis even for free speech', async () => {
            await prepare();
            const admitted = await job();
            expect(admitted.credits).toBe(0n);
            expect(admitted.providerPriceSnapshot?.version).toBe(1);
            await price('0.99', 1);
            expect(await worker().runOnce()).toBe(true);
            const fact = await expense();
            expect(fact).toMatchObject({
                amountUsdMicros: 70n,
                measurement: 'estimated',
                costSource: 'calculated',
                attemptReference: `speech:${admitted.id}`,
            });
            expect((await db.select().from(budgets))[0]).toMatchObject({
                state: 'settled',
                consumedMicros: 70n,
            });
            expect((await job()).state).toBe('ready');
            await prepare();
            expect(await db.select().from(jobs)).toHaveLength(1);
            expect(await db.select().from(expenses)).toHaveLength(1);
        });
        it('requires reviewed pricing and configured shared USD limits before any fresh free generation', async () => {
            const unavailable = new DrizzleSpeechStore({
                database: db,
                fingerprintSecret: 'synthetic-speech-accounting-secret',
                profileResolver: {
                    supports: (language) => ({
                        ...provider.supports(language),
                        model: 'unpriced-fixture',
                    }),
                },
                storageIdentity: storage.identity,
                generationEnabled: true,
                playbackEnabled: true,
                revalidateSource: async () => ({
                    text,
                    language: 'fr',
                    revision: '1',
                }),
            });
            await expect(
                unavailable.prepare({
                    actorId: owner,
                    source,
                    resolved: { text, language: 'fr', revision: '1' },
                    operationId: randomUUID(),
                    now: new Date(),
                }),
            ).rejects.toThrow('speech_provider_unavailable');
            expect(await db.select().from(jobs)).toHaveLength(0);
            expect(await db.select().from(budgets)).toHaveLength(0);
            await db.insert(settings).values({
                id: randomUUID(),
                version: 2,
                createdAt: new Date(),
                reason: 'Synthetic deliberately unconfigured limits',
            });
            await expect(prepare()).rejects.toThrow(
                'speech_provider_unavailable',
            );
        });
        it('shares operator day ceilings across generation and retains unknown expense conservatively', async () => {
            await prepare();
            const ambiguous = Object.assign(new FixtureSpeechProvider(), {
                submit: async () => {
                    throw new SpeechSubmissionError('unknown', false);
                },
            });
            await worker(ambiguous).runOnce();
            expect(await expense()).toMatchObject({
                amountUsdMicros: null,
                measurement: 'unknown',
                costSource: 'unknown',
            });
            expect((await db.select().from(budgets))[0]).toMatchObject({
                state: 'settled',
                consumedMicros: 70n,
            });
            expect(
                (
                    await db
                        .select()
                        .from(daily)
                        .where(eq(daily.scope, 'global'))
                )[0]?.consumedMicros,
            ).toBe(70n);
            expect((await job()).state).toBe('submission_unknown');
        });
        it('records zero only when submission is known not to have occurred', async () => {
            await prepare();
            const rejected = Object.assign(new FixtureSpeechProvider(), {
                submit: async () => {
                    throw new SpeechSubmissionError('not_submitted', false);
                },
            });
            await worker(rejected).runOnce();
            expect(await expense()).toMatchObject({
                amountUsdMicros: 0n,
                measurement: 'measured',
                costSource: 'calculated',
            });
            expect((await db.select().from(budgets))[0]).toMatchObject({
                state: 'settled',
                consumedMicros: 0n,
            });
        });
        it('releases an undispatched queue deadline without inventing a provider attempt', async () => {
            await prepare();
            const admitted = await job();
            await db
                .update(jobs)
                .set({
                    queueDeadline: sql`clock_timestamp()-interval '1 second'`,
                })
                .where(eq(jobs.id, admitted.id));
            await store.releaseDeadlines(new Date());
            expect((await job()).state).toBe('failed');
            expect((await db.select().from(budgets))[0]).toMatchObject({
                state: 'settled',
                consumedMicros: 0n,
            });
            expect(await db.select().from(expenses)).toHaveLength(0);
            expect(
                (
                    await db
                        .select()
                        .from(quotas)
                        .where(
                            and(
                                eq(
                                    quotas.day,
                                    new Date().toISOString().slice(0, 10),
                                ),
                                eq(quotas.scope, `owner:${owner}`),
                            ),
                        )
                )[0]?.freeCount,
            ).toBe(1);
        });
        it('rejects an old worker dispatch that omits the new provider accounting acknowledgement', async () => {
            await prepare();
            const admitted = await job();
            await expect(
                db.transaction(async (tx) => {
                    await tx.execute(
                        sql`select set_config('languon.speech_worker_version','1',true)`,
                    );
                    await tx
                        .update(jobs)
                        .set({
                            state: 'submitting',
                            leaseToken: randomUUID(),
                            leaseExpiresAt: new Date(Date.now() + 60000),
                        })
                        .where(eq(jobs.id, admitted.id));
                }),
            ).rejects.toSatisfy((error: unknown) => {
                const cause =
                    error instanceof Error && error.cause ? error.cause : error;
                return (
                    !!cause &&
                    typeof cause === 'object' &&
                    'code' in cause &&
                    cause.code === '23514'
                );
            });
            expect((await job()).state).toBe('queued');
            expect(await store.claim(new Date())).not.toBeNull();
        });
        it('cancels queued speech at scheduling while retaining in-flight USD observation and releasing its customer hold', async () => {
            await expect(
                db.transaction((tx) =>
                    cancelSpeechActorForScheduledDeletion(tx, owner),
                ),
            ).rejects.toMatchObject({ cause: { code: '23514' } });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: owner,
                    amount: 1000000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'migration',
                    sourceReference: randomUUID(),
                }),
            );
            text =
                'A private sentence contains considerably more than ten words and requires confirmed pronunciation credits.';
            const prepared = await prepare();
            expect(prepared.quote).toBeDefined();
            await store.confirm({
                actorId: owner,
                quoteId: prepared.quote!.id,
                operationId: randomUUID(),
                now: new Date(),
            });
            const inFlight = await store.claim(new Date());
            expect(inFlight).not.toBeNull();
            text = 'salut';
            await prepare();
            const [queued] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.state, 'queued'));
            expect(queued).toBeDefined();
            await client`update users set status='deletion_pending' where id=${owner}`;
            await client`insert into account_deletion_requests(user_id,state,scheduled_at,purge_at,next_attempt_at,updated_at) values(${owner},'pending',statement_timestamp(),statement_timestamp()+interval '30 days',statement_timestamp()+interval '30 days',statement_timestamp())`;
            await db.transaction((tx) =>
                cancelSpeechActorForScheduledDeletion(tx, owner),
            );
            const [retained] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, inFlight!.id));
            expect(retained).toMatchObject({
                state: 'submitting',
                payerId: owner,
                providerOutcome: null,
            });
            expect(retained!.reservationId).not.toBeNull();
            expect(
                (
                    await db
                        .select()
                        .from(budgets)
                        .where(eq(budgets.actionId, inFlight!.id))
                )[0]?.state,
            ).toBe('active');
            expect(
                (
                    await db
                        .select()
                        .from(budgets)
                        .where(eq(budgets.actionId, queued!.id))
                )[0],
            ).toMatchObject({ state: 'settled', consumedMicros: 0n });
            expect(
                (
                    await db.select().from(jobs).where(eq(jobs.id, queued!.id))
                )[0],
            ).toMatchObject({ state: 'failed', payerId: null });
            expect(await db.select().from(expenses)).toHaveLength(0);
            const audio = createFixtureAudio();
            expect(await store.storing(inFlight!, audio, new Date())).toBe(
                true,
            );
            await store.complete(
                inFlight!,
                await storage.putForReference(inFlight!.storage, audio),
                audio,
                new Date(),
            );
            const [fact] = await db
                .select()
                .from(expenses)
                .where(eq(expenses.actionId, inFlight!.id));
            expect(fact).toMatchObject({
                measurement: 'estimated',
                costSource: 'calculated',
                amountUsdMicros:
                    BigInt(retained!.providerCharacterCount!) * 10n,
            });
            expect(
                (
                    await db
                        .select()
                        .from(jobs)
                        .where(eq(jobs.id, inFlight!.id))
                )[0],
            ).toMatchObject({
                state: 'ready',
                billingState: 'released_no_charge',
            });
            const wallet = await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).accountSummary(
                    owner,
                    new Date(),
                ),
            );
            expect(wallet.consumedCredits).toBe(0n);
            expect(wallet.reservedCredits).toBe(0n);
        });
        it('rejects an indivisible speech operation above the shared operator action ceiling', async () => {
            await db.insert(settings).values({
                id: randomUUID(),
                version: 2,
                defaultMaxCreditsPerAction: '10',
                maxProviderCostUsdPerAction: '0.00001',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: new Date(),
                reason: 'Synthetic small speech ceiling',
            });
            await expect(prepare()).rejects.toThrow('speech_provider_budget');
            expect(await db.select().from(jobs)).toHaveLength(0);
            expect(await db.select().from(budgets)).toHaveLength(0);
        });
    },
);
