import { createHash, randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { SpeechSource } from '@languon/contracts';
import { DrizzleConversationStore } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import { DrizzleKnowledgeTransactionParticipant } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { knowledgeBodyPlainText } from '../../../../src/modules/knowledge/domain/knowledge';
import {
    knowledgeWorkbooksTable,
    knowledgeWorkbookNotesTable,
    knowledgeWorkbookSharesTable,
} from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/workbook-schema';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleProviderPriceStore } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import {
    aiAccountingSettingsRevisionsTable,
    capabilityPolicyRevisionsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiProviderExpenseRecordsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { parseCreditMilli } from '../../../../src/modules/ai-credits/domain/exact-credit-amount';
import { DrizzleKnowledgeStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { KnowledgeShareCrypto } from '../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { DrizzleKnowledgeMediaStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/media-store';
import { verifyKnowledgeAudio } from '../../../../src/modules/knowledge/infrastructure/media-audio-validation';
import { loadDictionaryAudioEnvironment } from '../../../../src/modules/speech/infrastructure/audio/dictionary-audio-environment';
import { FixtureSpeechProvider } from '../../../../src/modules/speech/infrastructure/audio/speech-providers';
import { PostgresAudioObjectStorage } from '../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { createSpeechInfrastructure } from '../../../../src/modules/speech/infrastructure/composition';
import {
    speechRecordingsTable,
    speechJobsTable,
    speechBindingsTable,
    speechQuotesTable,
} from '../../../../src/modules/speech/infrastructure/schema';
import { SpeechSubmissionError } from '../../../../src/modules/speech/application/ports/speech-synthesis-provider';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Private knowledge narration production composition',
    () => {
        let client: PostgresClient,
            db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>,
            notes: DrizzleKnowledgeStore,
            media: DrizzleKnowledgeMediaStore,
            speech: ReturnType<typeof createSpeechInfrastructure>,
            owner: string,
            other: string;
        const crypto = new KnowledgeShareCrypto(
            'knowledge-speech-private-test-secret',
        );
        const provider = new FixtureSpeechProvider();
        let failure = false;
        let providerSubmissions = 0;
        let beforeSynthesis: (() => Promise<void>) | undefined;
        let beforePublication: (() => Promise<void>) | undefined;
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        afterAll(async () => client?.end());
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            owner = randomUUID();
            other = randomUUID();
            failure = false;
            providerSubmissions = 0;
            beforeSynthesis = undefined;
            beforePublication = undefined;
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: other, status: 'active' },
            ]);
            await db.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: owner,
                role: 'owner',
                grantedByUserId: owner,
                grantReason: 'Disposable narration test administrator',
            });
            await db.insert(aiAccountingSettingsRevisionsTable).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '10',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: new Date(),
                reason: 'Synthetic narration limits',
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
                    reason: 'Synthetic disposable tariff',
                },
                owner,
                new Date(),
            );
            notes = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            media = new DrizzleKnowledgeMediaStore(db, crypto);
            const environment = loadDictionaryAudioEnvironment(
                {
                    SPEECH_PLAYBACK_ENABLED: 'true',
                    SPEECH_GENERATION_ENABLED: 'true',
                    DICTIONARY_AUDIO_PROVIDER: 'fixture',
                    DICTIONARY_AUDIO_FINGERPRINT_SECRET:
                        'synthetic-private-knowledge-speech-fingerprint',
                },
                { deployed: false, role: 'worker' },
            );
            const storage = new PostgresAudioObjectStorage(db);
            const write = storage.putForReference.bind(storage);
            storage.putForReference = async (...args) => {
                const reference = await write(...args);
                await beforePublication?.();
                return reference;
            };
            speech = createSpeechInfrastructure({
                database: db,
                dictionaryHmacSecret: 'knowledge-speech-private-test-secret',
                environment,
                storage,
                provider,
                providers: new Map([
                    [
                        provider.configurationId,
                        {
                            configurationId: provider.configurationId,
                            supports: provider.supports.bind(provider),
                            submit: async (input) => {
                                providerSubmissions += 1;
                                await beforeSynthesis?.();
                                if (failure)
                                    throw new SpeechSubmissionError(
                                        'not_submitted',
                                        false,
                                    );
                                return provider.submit(input);
                            },
                            poll: provider.poll.bind(provider),
                        },
                    ],
                ]),
                generationEnabled: true,
                playbackEnabled: true,
                burstLimiter: { consume: async () => ({ allowed: true }) },
            });
        }, 120000);
        async function source(
            actor = owner,
            sourceText = 'Bonjour de mon carnet.',
        ) {
            const blockId = randomUUID();
            const note = await notes.create(actor, {
                operationId: randomUUID(),
                content: {
                    title: 'Private narration',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'fr',
                    explanationLanguage: 'en',
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'learningBlock',
                                    attrs: {
                                        block: {
                                            id: blockId,
                                            type: 'bilingual-text',
                                            language: 'fr',
                                            segments: [
                                                {
                                                    id: randomUUID(),
                                                    text: sourceText,
                                                },
                                            ],
                                            translations: [],
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            });
            const workspace = await notes.getWorkspace(actor, note.id);
            const branch = workspace.branches[0]!;
            return {
                note,
                source: {
                    kind: 'knowledge-block',
                    noteId: note.id,
                    branchId: branch.id,
                    blockId,
                    expectedBranchVersion: branch.version,
                } satisfies SpeechSource,
            };
        }
        it('rejects revoked payer speech before dispatch and after provider success even when a valid joiner remains', async () => {
            const at = new Date();
            await db.insert(capabilityPolicyRevisionsTable).values({
                id: randomUUID(),
                capability: 'speech',
                version: 1,
                funding: 'customer',
                createdAt: at,
                createdBy: owner,
                reason: 'Synthetic paid knowledge speech coverage',
            });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: other,
                    amount: 1_000_000n,
                    createdAt: at,
                    expiresAt: null,
                    source: 'migration',
                    sourceReference: randomUUID(),
                }),
            );
            const wallet = (actor: string) =>
                db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).accountSummary(actor, new Date()),
                );
            const input = await source(
                owner,
                'Cette phrase française contient suffisamment de mots pour demander une confirmation explicite avant de créer son enregistrement vocal privé.',
            );
            const sharedSource = (
                note: typeof input,
                share: { locator: string; key: string },
            ): SpeechSource => ({
                kind: 'knowledge-snippet',
                noteId: note.note.id,
                blockId: note.source.blockId,
                origin: {
                    kind: 'saved',
                    expectedNoteVersion: note.note.version,
                    access: {
                        kind: 'note',
                        locator: share.locator,
                        key: share.key,
                    },
                },
                selector: { kind: 'bilingual' },
            });
            const firstShare = await notes.issueShare(owner, input.note.id);
            const unconfirmed = await speech.service.prepare(other, {
                source: sharedSource(input, firstShare),
                operationId: randomUUID(),
            });
            expect(unconfirmed.state).toBe('confirmation_required');
            expect(await db.select().from(speechJobsTable)).toHaveLength(0);
            await notes.revokeShare(owner, input.note.id);
            await expect(
                speech.service.confirm(other, {
                    quoteId: unconfirmed.quote!.id,
                    operationId: randomUUID(),
                }),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
            expect((await wallet(other)).reservedCredits).toBe(0n);
            expect((await wallet(other)).consumedCredits).toBe(0n);
            expect(await db.select().from(speechJobsTable)).toHaveLength(0);
            const secondShare = await notes.issueShare(owner, input.note.id);
            const quote = await speech.service.prepare(other, {
                source: sharedSource(input, secondShare),
                operationId: randomUUID(),
            });
            const confirmed = await speech.service.confirm(other, {
                quoteId: quote.quote!.id,
                operationId: randomUUID(),
            });
            const held = parseCreditMilli(quote.quote!.credits);
            expect(held).toBeGreaterThan(0n);
            expect((await wallet(other)).reservedCredits).toBe(held);
            const joined = await speech.service.prepare(owner, {
                source: {
                    kind: 'knowledge-snippet',
                    noteId: input.note.id,
                    blockId: input.source.blockId,
                    origin: {
                        kind: 'saved',
                        expectedNoteVersion: input.note.version,
                    },
                    selector: { kind: 'bilingual' },
                },
                operationId: randomUUID(),
            });
            expect(joined.state).toBe('queued');
            const [originalJob] = await db.select().from(speechJobsTable);
            expect(originalJob?.sourceBindingId).toBe(confirmed.requestId);
            expect(originalJob?.sourceBindingId).not.toBe(joined.requestId);
            await expect(
                db
                    .update(speechJobsTable)
                    .set({ sourceBindingId: joined.requestId })
                    .where(eq(speechJobsTable.id, originalJob!.id)),
            ).rejects.toMatchObject({
                cause: {
                    code: '23514',
                    message:
                        'Original knowledge speech payer binding is immutable',
                },
            });
            await notes.revokeShare(owner, input.note.id);
            await speech.worker.runOnce();
            expect(providerSubmissions).toBe(0);
            const refused = await speech.store.request(
                other,
                confirmed.requestId!,
                new Date(),
            );
            expect(refused.response).toMatchObject({
                state: 'failed',
                billingState: 'released_no_charge',
                playbackId: null,
            });
            expect((await wallet(other)).reservedCredits).toBe(0n);
            expect((await wallet(other)).consumedCredits).toBe(0n);
            expect(
                await speech.service.status(owner, joined.requestId!),
            ).toMatchObject({
                state: 'failed',
                billingState: 'free',
                playbackId: null,
            });
            const retryInput = await source(
                owner,
                'Cette autre phrase possède aussi suffisamment de mots pour vérifier la protection de la personne qui a demandé cet audio.',
            );
            const retryShare = await notes.issueShare(
                owner,
                retryInput.note.id,
            );
            const paidQuote = await speech.service.prepare(other, {
                source: sharedSource(retryInput, retryShare),
                operationId: randomUUID(),
            });
            const inFlight = await speech.service.confirm(other, {
                quoteId: paidQuote.quote!.id,
                operationId: randomUUID(),
            });
            let entered!: () => void, release!: () => void;
            const arrived = new Promise<void>((resolve) => {
                entered = resolve;
            });
            const heldResponse = new Promise<void>((resolve) => {
                release = resolve;
            });
            beforeSynthesis = async () => {
                entered();
                await heldResponse;
            };
            const running = speech.worker.runOnce();
            await Promise.race([
                arrived,
                running.then(() => {
                    throw new Error('Expected held provider dispatch.');
                }),
            ]);
            expect(providerSubmissions).toBe(1);
            const [dispatched] = await db
                .select()
                .from(speechJobsTable)
                .where(
                    eq(speechJobsTable.sourceBindingId, inFlight.requestId!),
                );
            expect(dispatched?.providerDispatchedAt).toBeInstanceOf(Date);
            try {
                await notes.revokeShare(owner, retryInput.note.id);
            } finally {
                release();
            }
            await running;
            const refusedOutput = await speech.store.request(
                other,
                inFlight.requestId!,
                new Date(),
            );
            expect(refusedOutput.response).toMatchObject({
                state: 'failed',
                billingState: 'released_no_charge',
                playbackId: null,
            });
            expect((await wallet(other)).reservedCredits).toBe(0n);
            expect((await wallet(other)).consumedCredits).toBe(0n);
            expect((await wallet(owner)).reservedCredits).toBe(0n);
            expect((await wallet(owner)).consumedCredits).toBe(0n);
            expect(
                (await db.select().from(speechRecordingsTable)).every(
                    (row) => row.state !== 'ready',
                ),
            ).toBe(true);
            const expenses = await db
                .select()
                .from(aiProviderExpenseRecordsTable)
                .where(
                    eq(aiProviderExpenseRecordsTable.actionId, dispatched!.id),
                );
            expect(expenses).toHaveLength(1);
            expect(expenses[0]?.amountUsdMicros).toBeGreaterThan(0n);
            await expect(
                speech.service.status(other, inFlight.requestId!),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
        }, 60000);
        it('rechecks source authority after bytes are stored and before ready publication', async () => {
            const input = await source();
            const share = await notes.issueShare(owner, input.note.id);
            const prepared = await speech.service.prepare(other, {
                source: {
                    kind: 'knowledge-snippet',
                    noteId: input.note.id,
                    blockId: input.source.blockId,
                    origin: {
                        kind: 'saved',
                        expectedNoteVersion: input.note.version,
                        access: {
                            kind: 'note',
                            locator: share.locator,
                            key: share.key,
                        },
                    },
                    selector: { kind: 'bilingual' },
                },
                operationId: randomUUID(),
            });
            let entered!: () => void, release!: () => void;
            const arrived = new Promise<void>((resolve) => {
                    entered = resolve;
                }),
                held = new Promise<void>((resolve) => {
                    release = resolve;
                });
            beforePublication = async () => {
                entered();
                await held;
            };
            const running = speech.worker.runOnce();
            await Promise.race([
                arrived,
                running.then(() => {
                    throw new Error('Expected held storage publication.');
                }),
            ]);
            try {
                await notes.revokeShare(owner, input.note.id);
            } finally {
                release();
            }
            await running;
            const failed = await speech.store.request(
                other,
                prepared.requestId!,
                new Date(),
            );
            expect(failed.response).toMatchObject({
                state: 'failed',
                playbackId: null,
            });
            expect(
                (await db.select().from(speechRecordingsTable)).every(
                    (row) => row.state !== 'ready',
                ),
            ).toBe(true);
            expect(
                (await db.select().from(aiProviderExpenseRecordsTable))[0]
                    ?.amountUsdMicros,
            ).toBeGreaterThan(0n);
        }, 60000);
        it('scrubs private draft speech quotes and bindings on branch discard without dispatch or lost financial facts', async () => {
            const input = await source(),
                workspace = await notes.getWorkspace(owner, input.note.id),
                original = workspace.branches[0]!;
            const updated = await notes.updateWorking(owner, input.note.id, {
                operationId: randomUUID(),
                branchId: original.id,
                expectedVersion: original.version,
                content: { ...original.content, title: 'Working edits' },
            });
            const kept = await notes.updateWorking(owner, input.note.id, {
                operationId: randomUUID(),
                branchId: original.id,
                expectedVersion: original.version,
                content: { ...original.content, title: 'Kept branch' },
            });
            expect(kept.conflict).toBe(true);
            const draftSource: SpeechSource = {
                kind: 'knowledge-audio-draft',
                noteId: input.note.id,
                branchId: original.id,
                blockId: randomUUID(),
                sourceText: 'Private branch audio.',
                language: 'fr',
            };
            const prepared = await speech.service.prepare(owner, {
                source: draftSource,
                operationId: randomUUID(),
            });
            const at = new Date();
            await db.insert(speechQuotesTable).values({
                id: randomUUID(),
                actorId: owner,
                operationId: randomUUID(),
                source: draftSource,
                sourceRevision: 'synthetic-private-branch-quote',
                canonicalKey: 'private-branch-quote',
                profile: provider.supports('fr'),
                credits: 1000n,
                characterCount: 21,
                wordCount: 3,
                provisional: 0,
                createdAt: at,
                expiresAt: new Date(at.getTime() + 300000),
            });
            await notes.resolveWorking(owner, input.note.id, {
                operationId: randomUUID(),
                keepBranchId: kept.branch.id,
                keepVersion: kept.branch.version,
                discardBranches: [
                    {
                        id: original.id,
                        expectedVersion: updated.branch.version,
                    },
                ],
            });
            expect(await db.select().from(speechQuotesTable)).toHaveLength(0);
            expect(await db.select().from(speechBindingsTable)).toHaveLength(0);
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.text,
            ).toBe('');
            await speech.worker.runOnce();
            expect(providerSubmissions).toBe(0);
            expect((await db.select().from(speechJobsTable))[0]).toMatchObject({
                state: 'failed',
                error: 'speech_source_unavailable',
                sourceBindingId: prepared.requestId,
            });
            await expect(
                speech.service.status(owner, prepared.requestId!),
            ).rejects.toBeDefined();
        }, 60000);
        it('retains prepared speech only when a different live branch binding still authorizes it', async () => {
            const input = await source(),
                workspace = await notes.getWorkspace(owner, input.note.id),
                original = workspace.branches[0]!;
            const prepared = await speech.service.prepare(owner, {
                source: {
                    kind: 'knowledge-audio-draft',
                    noteId: input.note.id,
                    branchId: original.id,
                    blockId: randomUUID(),
                    sourceText: 'Bonjour autorisé.',
                    language: 'fr',
                },
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            const firstReady = await speech.service.status(
                owner,
                prepared.requestId!,
            );
            const changed = await notes.updateWorking(owner, input.note.id, {
                operationId: randomUUID(),
                branchId: original.id,
                expectedVersion: original.version,
                content: { ...original.content, title: 'Working edits' },
            });
            const kept = await notes.updateWorking(owner, input.note.id, {
                operationId: randomUUID(),
                branchId: original.id,
                expectedVersion: original.version,
                content: { ...original.content, title: 'Kept branch' },
            });
            const retained = await speech.service.prepare(owner, {
                source: {
                    kind: 'knowledge-audio-draft',
                    noteId: input.note.id,
                    branchId: kept.branch.id,
                    blockId: randomUUID(),
                    sourceText: 'Bonjour autorisé.',
                    language: 'fr',
                },
                operationId: randomUUID(),
            });
            expect(retained.state).toBe('ready');
            await notes.resolveWorking(owner, input.note.id, {
                operationId: randomUUID(),
                keepBranchId: kept.branch.id,
                keepVersion: kept.branch.version,
                discardBranches: [
                    {
                        id: original.id,
                        expectedVersion: changed.branch.version,
                    },
                ],
            });
            await expect(
                speech.service.content(owner, firstReady.playbackId!),
            ).rejects.toBeDefined();
            expect(
                (await speech.service.content(owner, retained.playbackId!))
                    .text,
            ).toBe('Bonjour autorisé.');
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.text,
            ).toBe('Bonjour autorisé.');
        }, 60000);
        it('removes expired unconfirmed private draft quotes in bounded worker maintenance', async () => {
            const input = await source(),
                at = new Date();
            const values = {
                actorId: owner,
                source: {
                    kind: 'knowledge-audio-draft' as const,
                    noteId: input.note.id,
                    branchId: input.source.branchId,
                    blockId: randomUUID(),
                    sourceText: 'Private unconfirmed source.',
                    language: 'fr',
                },
                sourceRevision: 'private-expiring-quote',
                canonicalKey: 'private-expiring-quote',
                profile: provider.supports('fr'),
                credits: 1000n,
                characterCount: 26,
                wordCount: 3,
                provisional: 0,
                createdAt: at,
            };
            await db.insert(speechQuotesTable).values([
                {
                    ...values,
                    id: randomUUID(),
                    operationId: randomUUID(),
                    expiresAt: new Date(at.getTime() - 1000),
                },
                {
                    ...values,
                    id: randomUUID(),
                    operationId: randomUUID(),
                    expiresAt: new Date(at.getTime() + 300000),
                },
            ]);
            await speech.worker.runOnce();
            const remaining = await db.select().from(speechQuotesTable);
            expect(remaining).toHaveLength(1);
            expect(remaining[0]!.expiresAt.getTime()).toBeGreaterThan(
                Date.now(),
            );
            expect(providerSubmissions).toBe(0);
        }, 60000);
        it('erases frozen draft speech quotes on note deletion even before any recording exists', async () => {
            const input = await source(),
                at = new Date();
            await db.insert(speechQuotesTable).values({
                id: randomUUID(),
                actorId: owner,
                operationId: randomUUID(),
                source: {
                    kind: 'knowledge-audio-draft',
                    noteId: input.note.id,
                    branchId: input.source.branchId,
                    blockId: randomUUID(),
                    sourceText: 'Private unconfirmed draft quote.',
                    language: 'fr',
                },
                sourceRevision: 'synthetic-frozen-draft',
                canonicalKey: 'synthetic-frozen-quote',
                profile: provider.supports('fr')!,
                credits: 1000n,
                characterCount: 32,
                wordCount: 4,
                provisional: 0,
                createdAt: at,
                expiresAt: new Date(at.getTime() + 300000),
            });
            expect(await db.select().from(speechRecordingsTable)).toHaveLength(
                0,
            );
            expect(await db.select().from(speechQuotesTable)).toHaveLength(1);
            await notes.delete(owner, input.note.id, {
                operationId: randomUUID(),
                expectedVersion: input.note.version,
            });
            expect(await db.select().from(speechQuotesTable)).toHaveLength(0);
        }, 60000);
        it('prepares frozen owner audio draft text without changing the sheet and cleans it with the source', async () => {
            const input = await source();
            const audioDraft: SpeechSource = {
                kind: 'knowledge-audio-draft',
                noteId: input.note.id,
                branchId: input.source.branchId,
                blockId: randomUUID(),
                sourceText: 'Bonjour du brouillon.',
                language: 'fr',
            };
            await expect(
                speech.service.prepare(other, {
                    source: audioDraft,
                    operationId: randomUUID(),
                }),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
            await expect(
                speech.service.prepare(owner, {
                    source: { ...audioDraft, branchId: randomUUID() },
                    operationId: randomUUID(),
                }),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
            const prepared = await speech.service.prepare(owner, {
                source: audioDraft,
                operationId: randomUUID(),
            });
            const workspace = await notes.getWorkspace(owner, input.note.id),
                branch = workspace.branches[0]!;
            await notes.updateWorking(owner, input.note.id, {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedVersion: branch.version,
                content: {
                    ...branch.content,
                    title: 'Unrelated title changed',
                },
            });
            await speech.worker.runOnce();
            const ready = await speech.service.status(
                owner,
                prepared.requestId!,
            );
            expect(ready.state).toBe('ready');
            const content = await speech.service.content(
                owner,
                ready.playbackId!,
            );
            expect(content.text).toBe('Bonjour du brouillon.');
            expect(
                JSON.stringify(
                    (await notes.getWorkspace(owner, input.note.id)).published,
                ),
            ).not.toContain('Bonjour du brouillon.');
            await notes.delete(owner, input.note.id, {
                operationId: randomUUID(),
                expectedVersion: input.note.version,
            });
            await expect(
                speech.service.content(owner, ready.playbackId!),
            ).rejects.toBeDefined();
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.text,
            ).toBe('');
        }, 60000);
        it('plays an exact working snippet through production preparation and rejects stale or foreign sources', async () => {
            const input = await source();
            const snippet: SpeechSource = {
                kind: 'knowledge-snippet',
                noteId: input.note.id,
                blockId: input.source.blockId,
                origin: {
                    kind: 'working',
                    branchId: input.source.branchId,
                    expectedBranchVersion: input.source.expectedBranchVersion,
                },
                selector: { kind: 'bilingual' },
            };
            await expect(
                speech.service.prepare(other, {
                    source: snippet,
                    operationId: randomUUID(),
                }),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
            const prepared = await speech.service.prepare(owner, {
                source: snippet,
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            const ready = await speech.service.status(
                owner,
                prepared.requestId!,
            );
            expect(ready.state).toBe('ready');
            expect(
                (await speech.service.content(owner, ready.playbackId!)).text,
            ).toBe('Bonjour de mon carnet.');
            const workspace = await notes.getWorkspace(owner, input.note.id);
            const branch = workspace.branches[0]!;
            await notes.updateWorking(owner, input.note.id, {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedVersion: branch.version,
                content: { ...branch.content, title: 'Changed working title' },
            });
            await expect(
                speech.service.status(owner, prepared.requestId!),
            ).rejects.toMatchObject({ code: 'speech_source_changed' });
            await expect(
                speech.service.content(owner, ready.playbackId!),
            ).rejects.toMatchObject({ code: 'speech_source_changed' });
        }, 60000);
        it('pins saved shared speech to a digest, isolates drafts and rechecks revocation on delivery', async () => {
            const input = await source();
            const share = await notes.issueShare(owner, input.note.id);
            const snippet: SpeechSource = {
                kind: 'knowledge-snippet',
                noteId: input.note.id,
                blockId: input.source.blockId,
                origin: {
                    kind: 'saved',
                    expectedNoteVersion: input.note.version,
                    access: {
                        kind: 'note',
                        locator: share.locator,
                        key: share.key,
                    },
                },
                selector: { kind: 'bilingual' },
            };
            const prepared = await speech.service.prepare(other, {
                source: snippet,
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            const ready = await speech.service.status(
                other,
                prepared.requestId!,
            );
            expect(ready.state).toBe('ready');
            expect(
                (await speech.service.content(other, ready.playbackId!)).text,
            ).toBe('Bonjour de mon carnet.');
            const rows = await db.select().from(speechBindingsTable);
            expect(JSON.stringify(rows)).not.toContain(share.key);
            expect(JSON.stringify(rows)).toContain(crypto.digest(share.key));
            await notes.revokeShare(owner, input.note.id);
            await expect(
                speech.service.status(other, prepared.requestId!),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
            await expect(
                speech.service.content(other, ready.playbackId!),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
        }, 60000);
        it('plays only persisted owned chat proposal snippets and revokes them with the conversation', async () => {
            const input = await source();
            const conversations = new DrizzleConversationStore({
                database: db,
                sources: new ConversationSourceResolver({
                    verifyDictionaryShare: () => false,
                    verifyTextShare: () => false,
                    verifyKnowledgeShare: (key, digest) =>
                        crypto.verify(key, digest),
                    readNote: (tx, actor, id) =>
                        new DrizzleKnowledgeTransactionParticipant(
                            tx,
                        ).getForSource(actor, id),
                }),
                admitTurn: async () => ({
                    snapshot: { modelId: 'deepseek-flash' },
                }),
                publishNote: (tx, actor, publication) =>
                    new DrizzleKnowledgeTransactionParticipant(tx).publish(
                        actor,
                        publication,
                    ),
            });
            const access = { ownerId: owner };
            const chat = await conversations.create(access, {
                source: { kind: 'knowledge', id: input.note.id },
            });
            const text = knowledgeBodyPlainText(input.note.body);
            await conversations.submit(access, chat.id, {
                requestId: randomUUID(),
                content: 'Prepare a vocabulary proposal for pronunciation.',
                attachments: [],
                editorContext: {
                    content: text,
                    editorTarget: {
                        from: 0,
                        to: 0,
                        originalText: '',
                        documentHash: createHash('sha256')
                            .update(text)
                            .digest('hex'),
                    },
                    workingBranch: {
                        id: input.source.branchId,
                        version: input.source.expectedBranchVersion,
                    },
                },
            });
            const turn = await conversations.claim();
            if (!turn) throw new Error('Expected admitted conversation turn.');
            const proposal = await conversations.proposeBlocks(turn, {
                blocks: [
                    {
                        id: randomUUID(),
                        type: 'vocabulary',
                        language: 'fr',
                        translationLanguage: 'ru',
                        entries: [
                            {
                                id: randomUUID(),
                                term: 'travail',
                                translation: 'работа',
                                example: 'Je travaille.',
                            },
                        ],
                    },
                ],
            });
            await conversations.finish(turn, 'succeeded');
            const preparedBlock = (
                await conversations.listBlockProposals(access, chat.id)
            ).proposals.find((item) => item.id === proposal.id)?.blocks[0];
            if (preparedBlock?.type !== 'vocabulary')
                throw new Error('Expected persisted vocabulary proposal.');
            const snippet = {
                kind: 'knowledge-snippet',
                noteId: input.note.id,
                blockId: preparedBlock.id,
                origin: {
                    kind: 'proposal',
                    conversationId: chat.id,
                    proposalId: proposal.id,
                },
                selector: {
                    kind: 'vocabulary',
                    entryId: preparedBlock.entries[0]!.id,
                    field: 'term',
                },
            } satisfies SpeechSource;
            await expect(
                speech.service.prepare(other, {
                    source: snippet,
                    operationId: randomUUID(),
                }),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
            const prepared = await speech.service.prepare(owner, {
                source: snippet,
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            const ready = await speech.service.status(
                owner,
                prepared.requestId!,
            );
            expect(
                (await speech.service.content(owner, ready.playbackId!)).text,
            ).toBe('travail');
            const queued = await speech.service.prepare(owner, {
                source: {
                    ...snippet,
                    selector: {
                        kind: 'vocabulary',
                        entryId: preparedBlock.entries[0]!.id,
                        field: 'example',
                    },
                },
                operationId: randomUUID(),
            });
            const at = new Date();
            const quoteId = randomUUID();
            await db.insert(speechQuotesTable).values({
                id: quoteId,
                actorId: owner,
                operationId: randomUUID(),
                source: snippet,
                sourceRevision: 'synthetic-proposal-quote',
                canonicalKey: 'synthetic-proposal-quote',
                profile: provider.supports('fr')!,
                credits: 1000n,
                characterCount: 7,
                wordCount: 1,
                provisional: 0,
                createdAt: at,
                expiresAt: new Date(at.getTime() + 300000),
            });
            const recordingsBefore = await db
                .select()
                .from(speechRecordingsTable);
            expect(recordingsBefore).toHaveLength(2);
            const jobsBefore = await db.select().from(speechJobsTable);
            const expensesBefore = await db
                .select()
                .from(aiProviderExpenseRecordsTable);
            expect(expensesBefore).toHaveLength(1);
            await conversations.delete(access, chat.id);
            expect(await db.select().from(speechBindingsTable)).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(speechQuotesTable)
                    .where(eq(speechQuotesTable.id, quoteId)),
            ).toHaveLength(0);
            const erased = await db.select().from(speechRecordingsTable);
            expect(
                erased.every(
                    (row) => row.text === '' && row.state === 'deleting',
                ),
            ).toBe(true);
            expect(
                (await db.select().from(speechJobsTable))
                    .map((row) => row.sourceBindingId)
                    .sort(),
            ).toEqual(jobsBefore.map((row) => row.sourceBindingId).sort());
            expect(
                await db.select().from(aiProviderExpenseRecordsTable),
            ).toEqual(expensesBefore);
            await speech.worker.runOnce();
            expect(providerSubmissions).toBe(1);
            await expect(
                speech.service.status(owner, queued.requestId!),
            ).rejects.toMatchObject({ code: 'speech_request_not_found' });
            const [refusedJob] = await db
                .select()
                .from(speechJobsTable)
                .where(eq(speechJobsTable.sourceBindingId, queued.requestId!));
            expect(refusedJob).toMatchObject({
                state: 'failed',
                billingState: 'free',
                error: 'speech_source_unavailable',
            });
            expect(
                await db.select().from(aiProviderExpenseRecordsTable),
            ).toEqual(expensesBefore);
            await expect(
                speech.service.content(owner, ready.playbackId!),
            ).rejects.toMatchObject({ code: 'speech_recording_unavailable' });
        }, 60000);
        it('removes saved snippet playback when workbook membership ends without exposing private drafts', async () => {
            const input = await source(),
                workbookId = randomUUID(),
                locator = crypto.locator(),
                at = new Date();
            const key = crypto.key(locator);
            await db.insert(knowledgeWorkbooksTable).values({
                id: workbookId,
                ownerId: owner,
                title: 'Synthetic workbook',
                createdAt: at,
                updatedAt: at,
            });
            await db
                .insert(knowledgeWorkbookNotesTable)
                .values({ workbookId, noteId: input.note.id, position: 0 });
            await db.insert(knowledgeWorkbookSharesTable).values({
                workbookId,
                locator,
                keyDigest: crypto.digest(key),
                createdAt: at,
            });
            const snippet: SpeechSource = {
                kind: 'knowledge-snippet',
                noteId: input.note.id,
                blockId: input.source.blockId,
                origin: {
                    kind: 'saved',
                    expectedNoteVersion: input.note.version,
                    access: { kind: 'workbook', locator, key },
                },
                selector: { kind: 'bilingual' },
            };
            const prepared = await speech.service.prepare(other, {
                source: snippet,
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            const ready = await speech.service.status(
                other,
                prepared.requestId!,
            );
            expect(
                (await speech.service.content(other, ready.playbackId!)).text,
            ).toBe('Bonjour de mon carnet.');
            await db
                .delete(knowledgeWorkbookNotesTable)
                .where(eq(knowledgeWorkbookNotesTable.noteId, input.note.id));
            await expect(
                speech.service.content(other, ready.playbackId!),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
        }, 60000);
        it('authorizes immutable branches, isolates private cache and explicitly copies preview audio to owned media', async () => {
            const first = await source(),
                second = await source(other);
            await expect(
                speech.service.prepare(other, {
                    source: first.source,
                    operationId: randomUUID(),
                }),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
            const prepared = await speech.service.prepare(owner, {
                source: first.source,
                operationId: randomUUID(),
            });
            await speech.service.prepare(other, {
                source: second.source,
                operationId: randomUUID(),
            });
            expect(await db.select().from(speechJobsTable)).toHaveLength(2);
            await expect(
                notes.delete(owner, first.note.id, {
                    operationId: randomUUID(),
                    expectedVersion: first.note.version,
                }),
            ).rejects.toMatchObject({ code: 'deletion_busy' });
            await speech.worker.runOnce();
            await speech.worker.runOnce();
            const ready = await speech.service.status(
                owner,
                prepared.requestId!,
            );
            expect(ready.state).toBe('ready');
            const preview = await speech.service.content(
                owner,
                ready.playbackId!,
            );
            const destination = await source(owner);
            const asset = await media.upload(
                owner,
                destination.note.id,
                verifyKnowledgeAudio(
                    preview.audio.bytes,
                    preview.audio.mimeType,
                ),
            );
            await notes.delete(owner, first.note.id, {
                operationId: randomUUID(),
                expectedVersion: first.note.version,
            });
            expect(
                (
                    await media.read(destination.note.id, asset.id, {
                        ownerId: owner,
                    })
                ).bytes.length,
            ).toBeGreaterThan(0);
            const rows = await db.select().from(speechRecordingsTable);
            expect(rows.filter((r) => r.text === '')).toHaveLength(1);
            expect(
                rows.filter(
                    (r) =>
                        r.text === 'bonjour de mon carnet.' ||
                        r.text === 'Bonjour de mon carnet.',
                ),
            ).toHaveLength(1);
            await expect(
                speech.service.content(owner, ready.playbackId!),
            ).rejects.toBeDefined();
        }, 60000);
        it('persists technical failure without a customer charge and permits source cleanup', async () => {
            const input = await source();
            failure = true;
            const prepared = await speech.service.prepare(owner, {
                source: input.source,
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            expect(
                await speech.service.status(owner, prepared.requestId!),
            ).toMatchObject({ state: 'failed', billingState: 'free' });
            await notes.delete(owner, input.note.id, {
                operationId: randomUUID(),
                expectedVersion: input.note.version,
            });
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.text,
            ).toBe('');
        }, 60000);
        it('restricts private narration account erasure to its due fenced purge lease', async () => {
            const input = await source();
            const prepared = await speech.service.prepare(owner, {
                source: input.source,
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            expect(
                (await speech.service.status(owner, prepared.requestId!)).state,
            ).toBe('ready');
            const at = new Date();
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            await db.insert(accountDeletionRequestsTable).values({
                userId: owner,
                state: 'running',
                scheduledAt: new Date(at.getTime() - 120000),
                purgeAt: new Date(at.getTime() - 60000),
                nextAttemptAt: new Date(at.getTime() - 60000),
                leaseDeadline: new Date(at.getTime() + 120000),
                leaseWorkerId: 'synthetic-knowledge-purge',
                fencingToken: 1,
                updatedAt: at,
            });
            const role = `knowledge_purge_${randomUUID().replaceAll('-', '')}`;
            await client.unsafe(`create role ${role}`);
            try {
                await client.unsafe(`grant usage on schema public to ${role}`);
                await client.unsafe(
                    `grant execute on function languon_purge_private_knowledge_speech(uuid,text,integer) to ${role}`,
                );
                await expect(
                    db.transaction(async (tx) => {
                        await tx.execute(sql.raw(`set local role ${role}`));
                        await tx.execute(
                            sql`select text from speech_recordings`,
                        );
                    }),
                ).rejects.toBeDefined();
                await expect(
                    db.transaction(async (tx) => {
                        await tx.execute(sql.raw(`set local role ${role}`));
                        await tx.execute(
                            sql`select languon_purge_private_knowledge_speech(${owner}::uuid,'wrong-worker',1)`,
                        );
                    }),
                ).rejects.toBeDefined();
                await db.transaction(async (tx) => {
                    await tx.execute(
                        sql`select languon_finalize_speech_accounting_for_purge(${owner}::uuid,'synthetic-knowledge-purge',1)`,
                    );
                });
                expect(
                    (await db.select().from(speechRecordingsTable))[0]?.text,
                ).not.toBe('');
                await db.transaction(async (tx) => {
                    await tx.execute(sql.raw(`set local role ${role}`));
                    await tx.execute(
                        sql`select languon_purge_private_knowledge_speech(${owner}::uuid,'synthetic-knowledge-purge',1)`,
                    );
                });
                expect(
                    (await db.select().from(speechRecordingsTable))[0]?.text,
                ).toBe('');
            } finally {
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        }, 60000);
    },
);
