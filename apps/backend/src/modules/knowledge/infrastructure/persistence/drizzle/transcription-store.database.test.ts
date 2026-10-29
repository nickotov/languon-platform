import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
} from '@languon/database';
import {
    KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
    KnowledgeNoteContentSchema,
    type ProviderNativePricingRules,
} from '@languon/contracts';
import { eq } from 'drizzle-orm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { aiAccountingSettingsRevisionsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderPriceRevisionsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiCreditActionsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { aiProviderExpenseRecordsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { dictionaryAiWorkerObservationsTable } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { createFixtureAudio } from '../../../../speech/domain/audio-integrity';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleKnowledgeMediaStore } from './media-store';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { DrizzleKnowledgeTranscriptionStore } from './drizzle-transcription-job-store';
import {
    knowledgeTranscriptionConfigRevisionsTable as configs,
    knowledgeTranscriptionStateTable as state,
} from './transcription-accounting-schema';
import { transcriptionCredentialFingerprint } from '../../transcription-credential-fingerprint';
import { createKnowledgeTranscriptionWorker } from '../../transcription-job-composition';
import { knowledgeNotesTable } from './schema';
import type { KnowledgeDatabase } from './knowledge-transaction';
import { evaluateNativeProviderCost } from '../../../../ai-credits/domain/native-provider-pricing';

const workerId = 'knowledge-transcription-financial-fixture';
const credentialFingerprint =
    transcriptionCredentialFingerprint('synthetic-only')!;
const secret = 'knowledge-transcription-financial-test-secret';
const nativeRules: ProviderNativePricingRules = {
    version: 1,
    validFrom: '2020-01-01T00:00:00Z',
    validUntil: null,
    variants: [
        {
            id: 'synthetic-fixture-no-minimum',
            applies: { endpointIds: ['/v1/audio/transcriptions'] },
            components: [
                {
                    meter: 'audioInputMilliseconds',
                    pricePerUnit: '0.0045',
                    unitQuantity: 60000,
                    chargeWhen: 'positive-usage',
                },
            ],
        },
    ],
};

describe.runIf(isDatabaseIntegrationEnabled())(
    'Knowledge transcription canonical duration accounting',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let owner: string;
        let notes: DrizzleKnowledgeStore;
        let media: DrizzleKnowledgeMediaStore;
        let store: DrizzleKnowledgeTranscriptionStore;
        let noteId: string;
        let assetId: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const now = new Date();
            const priceId = randomUUID();
            const configId = randomUUID();
            await db.insert(aiAccountingSettingsRevisionsTable).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '1',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: now,
                reason: 'Synthetic bounded operator allowance',
            });
            await db.insert(aiProviderPriceRevisionsTable).values({
                id: priceId,
                providerId: 'openai',
                modelId: 'gpt-transcribe',
                meter: 'audio-duration',
                version: 1,
                effectiveAt: new Date('2020-01-01'),
                createdAt: now,
                data: {
                    providerId: 'openai',
                    modelId: 'gpt-transcribe',
                    meter: 'audio-duration',
                    nativeRules,
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: null,
                    effectiveAt: '2020-01-01T00:00:00Z',
                    sourceUrl: null,
                    sourceReference:
                        'Synthetic duration fixture, no production activation',
                    reason: 'Synthetic explicit test rate',
                },
            });
            await db.insert(configs).values({
                id: configId,
                version: 1,
                enabled: true,
                processingControlsRevision:
                    KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
                processingCredentialFingerprint: credentialFingerprint,
                dataSharingDisabled: true,
                dataSharingEvidence:
                    'Synthetic actual organization/project training opt-in disabled review',
                dataSharingAttestedAt: now,
                providerPriceRevisionId: priceId,
                creditsPerMinute: '1',
                maximumDurationMs: 1_800_000,
                maximumBytes: 5_242_880,
                maximumProviderCostMicros: 100000,
                billingRulesVerified: true,
                billingEvidence:
                    'Synthetic no-minimum duration rules for deterministic HTTP replacement only',
                createdAt: now,
                reason: 'Synthetic explicitly enabled fixture',
            });
            await db
                .insert(state)
                .values({ id: 'global', activeRevisionId: configId });
            await db.insert(dictionaryAiWorkerObservationsTable).values({
                id: workerId,
                workerId,
                adapterRevision: 'knowledge-transcription:v1',
                providerId: 'openai',
                modelId: 'gpt-transcribe',
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 3_600_000),
                status: 'available',
                message: 'Synthetic compatible executor fixture',
                textAiSupportedFormats: ['knowledge-transcription:v1'],
            });
            notes = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                new KnowledgeShareCrypto(secret),
            );
            media = new DrizzleKnowledgeMediaStore(
                db,
                new KnowledgeShareCrypto(secret),
            );
            store = new DrizzleKnowledgeTranscriptionStore({
                database: db,
                executionReady: true,
                credentialFingerprint,
            });
        }, 120_000);
        beforeEach(async () => {
            owner = randomUUID();
            await db.insert(usersTable).values({ id: owner, status: 'active' });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: owner,
                    amount: 5000n,
                    source: 'migration',
                    sourceReference: randomUUID(),
                    createdAt: new Date(),
                    expiresAt: null,
                }),
            );
            const note = await notes.create(owner, {
                operationId: randomUUID(),
                content: KnowledgeNoteContentSchema.parse({
                    title: 'Audio',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'en',
                    explanationLanguage: 'ru',
                    body: {
                        schemaVersion: 1,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        {
                                            type: 'text',
                                            text: 'Audio comprehension.',
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                }),
            });
            noteId = note.id;
            const wav = createFixtureAudio();
            const audio = await media.upload(owner, noteId, {
                bytes: wav.bytes,
                mimeType: 'audio/wav',
                durationMs: 1000,
            });
            assetId = audio.id;
        });
        afterAll(async () => client?.end(), 120_000);
        const request = () => ({
            operationId: randomUUID(),
            noteId,
            assetId,
            languages: ['en'],
        });
        async function enqueue() {
            const input = request();
            const quote = await store.submit(
                owner,
                input,
                new AbortController().signal,
            );
            expect(quote.state).toBe('confirmation-required');
            return {
                input,
                quote,
                job: await store.submit(
                    owner,
                    { ...input, confirmedMaximumCredits: quote.maximumCredits },
                    new AbortController().signal,
                ),
            };
        }
        const http = (response: () => Response | Promise<Response>) =>
            vi.fn<typeof fetch>(async (url, options) => {
                expect(url).toBe(
                    'https://api.openai.com/v1/audio/transcriptions',
                );
                expect(options?.redirect).toBe('error');
                expect((options?.body as FormData).get('model')).toBe(
                    'gpt-transcribe',
                );
                return response();
            });
        it('requires explicit spend confirmation and does not hold credits during preview', async () => {
            const input = request();
            const quote = await store.submit(
                owner,
                input,
                new AbortController().signal,
            );
            expect(quote.maximumCredits).toBe('0.017');
            expect(quote.state).toBe('confirmation-required');
            expect(
                await db
                    .select()
                    .from(aiCreditActionsTable)
                    .where(eq(aiCreditActionsTable.id, input.operationId)),
            ).toHaveLength(0);
            expect(
                (
                    await store.submit(
                        owner,
                        { ...input, confirmedMaximumCredits: '99' },
                        new AbortController().signal,
                    )
                ).state,
            ).toBe('confirmation-required');
            const accepted = await store.submit(
                owner,
                { ...input, confirmedMaximumCredits: quote.maximumCredits },
                new AbortController().signal,
            );
            expect(accepted.state).toBe('queued');
            const [action] = await db
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.id, input.operationId));
            expect(action).toMatchObject({
                usageMeter: 'audio-duration',
                audioInputLimitMilliseconds: 1000,
                outputLimit: 0,
                heldMilli: 17n,
            });
            await store.cancel(owner, noteId, input.operationId);
        });
        it('runs production admission, worker and actual adapter through fake HTTP to usable transcript and exact settlement', async () => {
            const { input } = await enqueue();
            const transport = http(() =>
                Response.json({
                    text: 'The cat sleeps.',
                    languages: [{ code: 'en' }],
                    usage: { type: 'duration', seconds: 1 },
                }),
            );
            const worker = createKnowledgeTranscriptionWorker({
                database: db,
                apiKey: 'synthetic-only',
                workerId,
                fetch: transport,
            });
            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );
            const saved = await store.read(owner, noteId, input.operationId);
            expect(saved).toMatchObject({
                state: 'completed',
                result: { text: 'The cat sleeps.', languages: ['en'] },
            });
            expect(transport).toHaveBeenCalledTimes(1);
            const [action] = await db
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.id, input.operationId));
            expect(action).toMatchObject({
                state: 'settled',
                chargedMilli: 17n,
                outcome: 'success',
            });
            const [expense] = await db
                .select()
                .from(aiProviderExpenseRecordsTable)
                .where(
                    eq(
                        aiProviderExpenseRecordsTable.actionId,
                        input.operationId,
                    ),
                );
            expect(expense).toMatchObject({
                sourceKind: 'transcription-attempt',
                measurement: 'measured',
                amountUsdMicros: 75n,
            });
            expect(await worker.processNext(new AbortController().signal)).toBe(
                false,
            );
            expect(transport).toHaveBeenCalledTimes(1);
        });
        it('releases customer holds on controlled provider failure and never retries ambiguous work', async () => {
            const { input } = await enqueue();
            const transport = http(
                () => new Response('Unavailable', { status: 503 }),
            );
            const worker = createKnowledgeTranscriptionWorker({
                database: db,
                apiKey: 'synthetic-only',
                workerId,
                fetch: transport,
            });
            await worker.processNext(new AbortController().signal);
            expect(
                (await store.read(owner, noteId, input.operationId)).state,
            ).toBe('failed');
            const [action] = await db
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.id, input.operationId));
            expect(action).toMatchObject({
                state: 'settled',
                chargedMilli: 0n,
                outcome: 'failure',
            });
            const [expense] = await db
                .select()
                .from(aiProviderExpenseRecordsTable)
                .where(
                    eq(
                        aiProviderExpenseRecordsTable.actionId,
                        input.operationId,
                    ),
                );
            expect(expense).toMatchObject({
                measurement: 'unknown',
                amountUsdMicros: null,
            });
            expect(await worker.processNext(new AbortController().signal)).toBe(
                false,
            );
            expect(transport).toHaveBeenCalledTimes(1);
        });
        it('preserves unknown provider cost when a usable response omits duration', async () => {
            const { input } = await enqueue();
            const transport = http(() =>
                Response.json({ text: 'Speech', languages: [{ code: 'en' }] }),
            );
            await createKnowledgeTranscriptionWorker({
                database: db,
                apiKey: 'synthetic-only',
                workerId,
                fetch: transport,
            }).processNext(new AbortController().signal);
            expect(
                (await store.read(owner, noteId, input.operationId)).state,
            ).toBe('completed');
            const [expense] = await db
                .select()
                .from(aiProviderExpenseRecordsTable)
                .where(
                    eq(
                        aiProviderExpenseRecordsTable.actionId,
                        input.operationId,
                    ),
                );
            expect(expense).toMatchObject({
                measurement: 'unknown',
                amountUsdMicros: null,
            });
        });
        it('retains late financial observations after cancellation without publishing a transcript', async () => {
            const { input } = await enqueue();
            let started!: () => void;
            let complete!: (value: Response) => void;
            const entered = new Promise<void>((resolve) => {
                started = resolve;
            });
            const reply = new Promise<Response>((resolve) => {
                complete = resolve;
            });
            const transport = http(async () => {
                started();
                return reply;
            });
            const pending = createKnowledgeTranscriptionWorker({
                database: db,
                apiKey: 'synthetic-only',
                workerId,
                fetch: transport,
            }).processNext(new AbortController().signal);
            await entered;
            await store.cancel(owner, noteId, input.operationId);
            complete(
                Response.json({
                    text: 'Too late',
                    languages: [{ code: 'en' }],
                    usage: { type: 'duration', seconds: 1 },
                }),
            );
            await pending;
            expect(
                await store.read(owner, noteId, input.operationId),
            ).toMatchObject({ state: 'cancelled', result: null });
            const [action] = await db
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.id, input.operationId));
            expect(action?.chargedMilli).toBe(0n);
            const rows =
                await client`select r.provider_usage from ai_credit_native_call_dispatches r join ai_credit_action_attempts a on a.id=r.attempt_id where a.action_id=${input.operationId}::uuid`;
            expect(rows).toHaveLength(1);
            expect(rows[0]!.provider_usage).toMatchObject({
                audioInputMilliseconds: 1000,
                requests: 1,
            });
            const [frozenExpense] = await db
                .select()
                .from(aiProviderExpenseRecordsTable)
                .where(
                    eq(
                        aiProviderExpenseRecordsTable.actionId,
                        input.operationId,
                    ),
                );
            expect(frozenExpense).toMatchObject({
                measurement: 'unknown',
                amountUsdMicros: null,
            });
        });
        it('settles queued work before source deletion and rejects operation resurrection', async () => {
            const { input } = await enqueue();
            await db
                .delete(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, noteId));
            const [action] = await db
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.id, input.operationId));
            expect(action).toMatchObject({
                state: 'settled',
                chargedMilli: 0n,
            });
            await expect(
                store.submit(owner, input, new AbortController().signal),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('rejects forged dispatch witnesses and preserves typed allowance dimensions', async () => {
            const { input } = await enqueue();
            const lease = await store.claim(workerId);
            expect(lease?.operationId).toBe(input.operationId);
            const audio = await store.audio(lease!);
            const checksum = createHash('sha256')
                .update(audio.bytes)
                .digest('hex');
            await expect(
                client`select languon_authorize_transcription_dispatch(${input.operationId}::uuid,${workerId},${lease!.fencingToken + 1},${checksum},${audio.bytes.length},1000)`,
            ).rejects.toThrow();
            await expect(
                client`update ai_credit_actions set usage_meter='text-tokens',audio_input_limit_milliseconds=NULL,output_limit=1 where id=${input.operationId}::uuid`,
            ).rejects.toThrow();
            await expect(
                client`update knowledge_transcription_jobs set source_duration_ms=2000 where id=${input.operationId}::uuid`,
            ).rejects.toThrow();
            const issued =
                await client`select count(*)::integer as count from ai_credit_native_call_dispatches r join ai_credit_action_attempts a on a.id=r.attempt_id where a.action_id=${input.operationId}::uuid`;
            expect(issued[0]!.count).toBe(0);
            await store.cancel(owner, noteId, input.operationId);
        });
        it('blocks dispatch without code-owned processing approval despite valid billing and credentials', async () => {
            const { input } = await enqueue();
            const lease = await store.claim(workerId);
            const audio = await store.audio(lease!);
            await expect(
                client`update knowledge_transcription_jobs set processing_controls_revision='forged' where id=${input.operationId}::uuid`,
            ).rejects.toThrow();
            await client.unsafe(
                `create or replace function languon_approved_transcription_processing_revision() returns text language sql immutable as $$ select NULL::text $$`,
            );
            try {
                await expect(
                    store.authorizeDispatch(lease!, {
                        ...input,
                        checksum: createHash('sha256')
                            .update(audio.bytes)
                            .digest('hex'),
                        byteLength: audio.bytes.length,
                        durationMs: audio.durationMs,
                        signal: new AbortController().signal,
                    }),
                ).rejects.toThrow();
                const [attempts] =
                    await client`select count(*)::integer as count from ai_credit_action_attempts where action_id=${input.operationId}::uuid`;
                expect(attempts!.count).toBe(0);
            } finally {
                await client.unsafe(
                    `create or replace function languon_approved_transcription_processing_revision() returns text language sql immutable as $$ select '${KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION}'::text $$`,
                );
                await store.cancel(owner, noteId, input.operationId);
            }
        });
        it('rejects changed admission credentials and an expired account attestation without reserving or dispatching work', async () => {
            const wrongStore = new DrizzleKnowledgeTranscriptionStore({
                database: db,
                executionReady: true,
                credentialFingerprint: transcriptionCredentialFingerprint(
                    'different-organization-key',
                ),
            });
            const denied = request();
            await expect(
                wrongStore.submit(owner, denied, new AbortController().signal),
            ).rejects.toThrow('configured');
            expect(
                await client`select id from ai_credit_actions where id=${denied.operationId}::uuid`,
            ).toHaveLength(0);
            const { input } = await enqueue();
            const lease = await store.claim(workerId);
            expect(lease?.operationId).toBe(input.operationId);
            const audio = await store.audio(lease!);
            const [active] =
                await client`select active_revision_id from knowledge_transcription_state where id='global'`;
            const [original] = await db
                .select()
                .from(configs)
                .where(eq(configs.id, active!.active_revision_id));
            const [versionRow] =
                await client`select max(version) as maximum from knowledge_transcription_config_revisions`;
            if (!versionRow)
                throw new Error('Expected a configuration version.');
            const expiredAt = new Date(Date.now() - 31 * 24 * 60 * 60_000);
            const expiredId = randomUUID();
            await db.insert(configs).values({
                ...original!,
                id: expiredId,
                version: Number(versionRow.maximum) + 1,
                dataSharingAttestedAt: expiredAt,
                createdAt: expiredAt,
            });
            await db
                .update(state)
                .set({ activeRevisionId: expiredId })
                .where(eq(state.id, 'global'));
            try {
                const expiredRequest = request();
                await expect(
                    store.submit(
                        owner,
                        expiredRequest,
                        new AbortController().signal,
                    ),
                ).rejects.toThrow('configured');
                expect(
                    await client`select id from ai_credit_actions where id=${expiredRequest.operationId}::uuid`,
                ).toHaveLength(0);
                await expect(
                    store.authorizeDispatch(lease!, {
                        ...input,
                        checksum: createHash('sha256')
                            .update(audio.bytes)
                            .digest('hex'),
                        byteLength: audio.bytes.length,
                        durationMs: audio.durationMs,
                        signal: new AbortController().signal,
                    }),
                ).rejects.toThrow('dispatch authorization was rejected');
                await expect(
                    client`select languon_authorize_transcription_dispatch_fenced(${input.operationId}::uuid,${workerId},${lease!.fencingToken},${lease!.leaseToken}::uuid,${createHash('sha256').update(audio.bytes).digest('hex')},${audio.bytes.length},${audio.durationMs},${credentialFingerprint})`,
                ).rejects.toThrow('organization data sharing attestation');
                const [job] =
                    await client`select attempt_id from knowledge_transcription_jobs where id=${input.operationId}::uuid`;
                expect(job!.attempt_id).toBeNull();
            } finally {
                await db
                    .update(state)
                    .set({ activeRevisionId: original!.id })
                    .where(eq(state.id, 'global'));
                await store.cancel(owner, noteId, input.operationId);
            }
        });
        it('retains issued receipt identity and rejects foreign observations or changed replay', async () => {
            const { input } = await enqueue();
            const lease = await store.claim(workerId);
            const audio = await store.audio(lease!);
            const permit = await store.authorizeDispatch(lease!, {
                ...input,
                checksum: createHash('sha256')
                    .update(audio.bytes)
                    .digest('hex'),
                byteLength: audio.bytes.length,
                durationMs: audio.durationMs,
                signal: new AbortController().signal,
            });
            await expect(
                client`select languon_observe_transcription_call(${input.operationId}::uuid,${randomUUID()}::uuid,1000)`,
            ).rejects.toThrow();
            await expect(
                client`select languon_observe_native_text_call(${permit.receiptId}::uuid,'{"usage":{"requests":1,"inputTokens":1}}'::jsonb)`,
            ).rejects.toThrow();
            await store.finish(lease!, {
                receiptId: permit.receiptId,
                text: 'The transcript',
                languages: ['en'],
                usage: { type: 'duration', seconds: 1 },
            });
            await client`select languon_observe_transcription_call(${input.operationId}::uuid,${permit.receiptId}::uuid,1000)`;
            await expect(
                client`select languon_observe_transcription_call(${input.operationId}::uuid,${permit.receiptId}::uuid,1001)`,
            ).rejects.toThrow();
            await expect(
                client`update knowledge_transcription_jobs set result=NULL where id=${input.operationId}::uuid`,
            ).rejects.toThrow();
        });
        it('runs the real worker with deployed restricted grants and refuses raw media and forged receipts', async () => {
            const foreignOwner = randomUUID();
            await db
                .insert(usersTable)
                .values({ id: foreignOwner, status: 'active' });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: foreignOwner,
                    amount: 5000n,
                    source: 'migration',
                    sourceReference: randomUUID(),
                    createdAt: new Date(),
                    expiresAt: null,
                }),
            );
            const foreignNote = await notes.create(foreignOwner, {
                operationId: randomUUID(),
                content: KnowledgeNoteContentSchema.parse({
                    title: 'Foreign private audio',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'en',
                    explanationLanguage: 'ru',
                    body: {
                        schemaVersion: 1,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        {
                                            type: 'text',
                                            text: 'Private source.',
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                }),
            });
            const foreignAudio = await media.upload(
                foreignOwner,
                foreignNote.id,
                {
                    bytes: createFixtureAudio().bytes,
                    mimeType: 'audio/wav',
                    durationMs: 1000,
                },
            );
            const foreignInput = {
                operationId: randomUUID(),
                noteId: foreignNote.id,
                assetId: foreignAudio.id,
                languages: ['en'],
            };
            const foreignQuote = await store.submit(
                foreignOwner,
                foreignInput,
                new AbortController().signal,
            );
            await store.submit(
                foreignOwner,
                {
                    ...foreignInput,
                    confirmedMaximumCredits: foreignQuote.maximumCredits,
                },
                new AbortController().signal,
            );
            const foreignLease = await store.claim(workerId);
            expect(foreignLease?.operationId).toBe(foreignInput.operationId);
            const foreignBytes = await store.audio(foreignLease!);
            const foreignPermit = await store.authorizeDispatch(foreignLease!, {
                ...foreignInput,
                checksum: createHash('sha256')
                    .update(foreignBytes.bytes)
                    .digest('hex'),
                byteLength: foreignBytes.bytes.length,
                durationMs: 1000,
                signal: new AbortController().signal,
            });
            await store.finish(foreignLease!, {
                receiptId: foreignPermit.receiptId,
                text: 'Another author private transcript',
                languages: ['en'],
                usage: { type: 'duration', seconds: 1 },
            });
            expect(
                (
                    await store.read(
                        foreignOwner,
                        foreignNote.id,
                        foreignInput.operationId,
                    )
                ).state,
            ).toBe('completed');
            const { input } = await enqueue();
            const role = `transcription_worker_${randomUUID().replaceAll('-', '')}`;
            await client.unsafe(`create role ${role} nologin`);
            let restricted: PostgresClient | undefined;
            try {
                const script = await readFile(
                    new URL(
                        '../../../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                        import.meta.url,
                    ),
                    'utf8',
                );
                await client.unsafe(
                    script
                        .split('\n')
                        .filter((line) => !line.startsWith('\\'))
                        .join('\n')
                        .replaceAll(':"dictionary_worker_role"', role),
                );
                const url = new URL(getTestDatabaseUrl());
                url.searchParams.set('options', `-c role=${role}`);
                restricted = createPostgresClient({
                    databaseUrl: url.toString(),
                    maxConnections: 2,
                });
                const restrictedDb = createDrizzleDatabase(
                    restricted,
                    databaseSchema,
                );
                expect(
                    (await restricted`select current_user as role`)[0]!.role,
                ).toBe(role);
                await expect(
                    restricted`select processing_credential_fingerprint from knowledge_transcription_config_revisions`,
                ).rejects.toThrow('permission denied');
                await expect(
                    restricted`select processing_credential_fingerprint from knowledge_transcription_jobs`,
                ).rejects.toThrow('permission denied');
                await expect(
                    restricted`select result from knowledge_transcription_jobs where id=${foreignInput.operationId}::uuid`,
                ).rejects.toThrow('permission denied');
                await expect(
                    restricted`select * from knowledge_transcription_jobs`,
                ).rejects.toThrow('permission denied');
                await expect(
                    restricted`select bytes from knowledge_media_blobs`,
                ).rejects.toThrow('permission denied');
                await expect(
                    restricted`select * from knowledge_learner_attempts`,
                ).rejects.toThrow('permission denied');
                await expect(
                    restricted`update knowledge_transcription_jobs set owner_id=${randomUUID()}::uuid where id=${input.operationId}::uuid`,
                ).rejects.toThrow();
                await expect(
                    restricted`insert into ai_credit_native_call_dispatches(id,attempt_id,ordinal,input_limit,output_limit,dispatched_at) values(${randomUUID()}::uuid,${randomUUID()}::uuid,1,0,1,clock_timestamp())`,
                ).rejects.toThrow('permission denied');
                expect(
                    await restricted`select * from languon_read_transcription_audio_fenced(${input.operationId}::uuid,${workerId},0,${randomUUID()}::uuid)`,
                ).toHaveLength(0);
                const transport = http(async () => {
                    const otherWorker = `${workerId}-other`;
                    await db
                        .insert(dictionaryAiWorkerObservationsTable)
                        .values({
                            id: otherWorker,
                            workerId: otherWorker,
                            adapterRevision: 'knowledge-transcription:v1',
                            providerId: 'openai',
                            modelId: 'gpt-transcribe',
                            checkedAt: new Date(),
                            expiresAt: new Date(Date.now() + 3600000),
                            status: 'available',
                            message: 'Synthetic second executor',
                            textAiSupportedFormats: [
                                'knowledge-transcription:v1',
                            ],
                        })
                        .onConflictDoNothing();
                    const second = await enqueue();
                    const otherLease = await store.claim(otherWorker);
                    expect(otherLease?.operationId).toBe(
                        second.input.operationId,
                    );
                    const otherAudio = await store.audio(otherLease!);
                    const restrictedStore =
                        new DrizzleKnowledgeTranscriptionStore({
                            database: restrictedDb,
                            executionReady: true,
                            credentialFingerprint,
                        });
                    await client.unsafe(
                        `create or replace function languon_approved_transcription_processing_revision() returns text language sql immutable as $$ select NULL::text $$`,
                    );
                    try {
                        await expect(
                            restrictedStore.authorizeDispatch(otherLease!, {
                                ...second.input,
                                checksum: createHash('sha256')
                                    .update(otherAudio.bytes)
                                    .digest('hex'),
                                byteLength: otherAudio.bytes.length,
                                durationMs: otherAudio.durationMs,
                                signal: new AbortController().signal,
                            }),
                        ).rejects.toThrow();
                        const [notDispatched] =
                            await client`select attempt_id from knowledge_transcription_jobs where id=${second.input.operationId}::uuid`;
                        expect(notDispatched!.attempt_id).toBeNull();
                    } finally {
                        await client.unsafe(
                            `create or replace function languon_approved_transcription_processing_revision() returns text language sql immutable as $$ select '${KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION}'::text $$`,
                        );
                    }
                    const wrongCredentialStore =
                        new DrizzleKnowledgeTranscriptionStore({
                            database: restrictedDb,
                            executionReady: true,
                            credentialFingerprint:
                                transcriptionCredentialFingerprint(
                                    'different-organization-key',
                                ),
                        });
                    await expect(
                        wrongCredentialStore.authorizeDispatch(otherLease!, {
                            ...second.input,
                            checksum: createHash('sha256')
                                .update(otherAudio.bytes)
                                .digest('hex'),
                            byteLength: otherAudio.bytes.length,
                            durationMs: otherAudio.durationMs,
                            signal: new AbortController().signal,
                        }),
                    ).rejects.toThrow('dispatch authorization was rejected');
                    await expect(
                        restricted!`select languon_authorize_transcription_dispatch_fenced(${second.input.operationId}::uuid,${otherWorker},${otherLease!.fencingToken},${otherLease!.leaseToken}::uuid,${createHash('sha256').update(otherAudio.bytes).digest('hex')},${otherAudio.bytes.length},${otherAudio.durationMs},${transcriptionCredentialFingerprint('different-organization-key')})`,
                    ).rejects.toThrow('credentials differ');
                    await expect(
                        restricted!`select languon_authorize_transcription_dispatch_fenced(${second.input.operationId}::uuid,${otherWorker},${otherLease!.fencingToken},${otherLease!.leaseToken}::uuid,${createHash('sha256').update(otherAudio.bytes).digest('hex')},${otherAudio.bytes.length},${otherAudio.durationMs})`,
                    ).rejects.toThrow('permission denied');
                    const [unissuedAfterWrongKey] =
                        await client`select attempt_id from knowledge_transcription_jobs where id=${second.input.operationId}::uuid`;
                    expect(unissuedAfterWrongKey!.attempt_id).toBeNull();
                    const otherPermit = await store.authorizeDispatch(
                        otherLease!,
                        {
                            ...second.input,
                            checksum: createHash('sha256')
                                .update(otherAudio.bytes)
                                .digest('hex'),
                            byteLength: otherAudio.bytes.length,
                            durationMs: otherAudio.durationMs,
                            signal: new AbortController().signal,
                        },
                    );
                    const [issued] =
                        await client`select j.receipt_id,j.fencing_token,c.token from knowledge_transcription_jobs j join knowledge_transcription_lease_capabilities c on c.job_id=j.id where j.id=${input.operationId}::uuid`;
                    const forged = {
                        receiptId: issued!.receipt_id,
                        text: 'Forged terminal result',
                        languages: ['en'],
                        usage: { type: 'duration', seconds: 1 },
                    };
                    await expect(
                        restricted!`select * from knowledge_transcription_lease_capabilities`,
                    ).rejects.toThrow('permission denied');
                    expect(
                        (
                            await restricted!`select languon_finish_transcription(${input.operationId}::uuid,${workerId},${issued!.fencing_token},${otherLease!.leaseToken}::uuid,${JSON.stringify(forged)}::jsonb,NULL) as finished`
                        )[0]!.finished,
                    ).toBe(false);
                    await expect(
                        restricted!`update knowledge_transcription_jobs set state='completed',result=${JSON.stringify(forged)}::jsonb where id=${input.operationId}::uuid`,
                    ).rejects.toThrow('permission denied');
                    await expect(
                        restricted!`select languon_observe_transcription_call(${input.operationId}::uuid,${issued!.receipt_id}::uuid,1000)`,
                    ).rejects.toThrow('permission denied');
                    expect(
                        (
                            await restricted!`select languon_finish_transcription(${input.operationId}::uuid,${otherWorker},${otherLease!.fencingToken},${otherLease!.leaseToken}::uuid,${JSON.stringify(forged)}::jsonb,NULL) as finished`
                        )[0]!.finished,
                    ).toBe(false);
                    await expect(
                        restricted!`select languon_finish_transcription(${input.operationId}::uuid,${workerId},${issued!.fencing_token},${issued!.token}::uuid,${JSON.stringify({ ...forged, receiptId: otherPermit.receiptId })}::jsonb,NULL)`,
                    ).rejects.toThrow('fenced issued receipt');
                    const [unobserved] =
                        await client`select observed_at from ai_credit_native_call_dispatches where id=${otherPermit.receiptId}::uuid`;
                    expect(unobserved!.observed_at).toBeNull();
                    await expect(
                        client`update knowledge_transcription_jobs set state='completed',result=${JSON.stringify(forged)}::jsonb where id=${input.operationId}::uuid`,
                    ).rejects.toThrow(
                        'Active action requires its live owned feature work',
                    );
                    expect(
                        await store.finish(otherLease!, {
                            receiptId: otherPermit.receiptId,
                            text: 'Second valid executor',
                            languages: ['en'],
                            usage: { type: 'duration', seconds: 1 },
                        }),
                    ).toBe(true);
                    return Response.json({
                        text: 'Restricted worker transcript',
                        languages: [{ code: 'en' }],
                        usage: { type: 'duration', seconds: 1 },
                    });
                });
                const worker = createKnowledgeTranscriptionWorker({
                    database: restrictedDb,
                    apiKey: 'synthetic-only',
                    workerId,
                    fetch: transport,
                });
                expect(
                    await worker.processNext(new AbortController().signal),
                ).toBe(true);
                expect(
                    await store.read(owner, noteId, input.operationId),
                ).toMatchObject({
                    state: 'completed',
                    result: { text: 'Restricted worker transcript' },
                });
                expect(transport).toHaveBeenCalledTimes(1);
                expect(
                    await restricted`select * from languon_read_transcription_audio_fenced(${input.operationId}::uuid,${workerId},1,${randomUUID()}::uuid)`,
                ).toHaveLength(0);
                const [action] = await db
                    .select()
                    .from(aiCreditActionsTable)
                    .where(eq(aiCreditActionsTable.id, input.operationId));
                expect(action).toMatchObject({
                    state: 'settled',
                    chargedMilli: 17n,
                    outcome: 'success',
                });
                const [expense] = await db
                    .select()
                    .from(aiProviderExpenseRecordsTable)
                    .where(
                        eq(
                            aiProviderExpenseRecordsTable.actionId,
                            input.operationId,
                        ),
                    );
                expect(expense).toMatchObject({
                    sourceKind: 'transcription-attempt',
                    measurement: 'measured',
                    amountUsdMicros: 75n,
                });
            } finally {
                await restricted?.end();
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        });
        it('serializes confirmed admission against permanent source deletion without deadlock or stranded holds', async () => {
            const input = request();
            const quote = await store.submit(
                owner,
                input,
                new AbortController().signal,
            );
            const outcomes = await Promise.allSettled([
                store.submit(
                    owner,
                    { ...input, confirmedMaximumCredits: quote.maximumCredits },
                    new AbortController().signal,
                ),
                notes.delete(owner, noteId, {
                    operationId: randomUUID(),
                    expectedVersion: 1,
                }),
            ]);
            expect(outcomes[1]!.status).toBe('fulfilled');
            if (outcomes[0]!.status === 'rejected')
                expect(outcomes[0]!.reason).toMatchObject({
                    code: 'knowledge_not_found',
                });
            const [action] = await db
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.id, input.operationId));
            if (action)
                expect(action).toMatchObject({
                    state: 'settled',
                    chargedMilli: 0n,
                });
            expect(
                await db
                    .select()
                    .from(knowledgeNotesTable)
                    .where(eq(knowledgeNotesTable.id, noteId)),
            ).toHaveLength(0);
        }, 10_000);
        it('keeps TS and SQL duration arithmetic equivalent while rejecting token receipt reinterpretation', async () => {
            const at = new Date().toISOString();
            const facts = {
                endpointId: '/v1/audio/transcriptions',
                dispatchedAt: at,
            };
            for (const milliseconds of [0, 1, 1001, 60_000, 120_000]) {
                const usage = {
                    audioInputMilliseconds: milliseconds,
                    requests: 1 as const,
                };
                const ts = evaluateNativeProviderCost(
                    nativeRules,
                    facts,
                    usage,
                );
                const [row] =
                    await client`select languon_evaluate_provider_price(${JSON.stringify({ nativeRules })}::jsonb,${JSON.stringify(facts)}::jsonb,${JSON.stringify(usage)}::jsonb,'actual') as value`;
                expect(row!.value.status).toBe(ts.status);
                if (ts.status === 'calculated')
                    expect(row!.value.amountUsdMicros).toBe(
                        ts.micros.toString(),
                    );
            }
            const [compatible] =
                await client`select languon_native_meter_compatible(${JSON.stringify({ nativeRules })}::jsonb,'text-tokens') as value`;
            expect(compatible!.value).toBe(false);
        });
    },
);
