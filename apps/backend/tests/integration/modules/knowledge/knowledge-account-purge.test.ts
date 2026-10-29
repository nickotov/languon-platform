import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
} from '@languon/database';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
    adminMcpTokensTable,
    adminMcpPreviewsTable,
    adminMcpReceiptsTable,
    adminMcpReservationsTable,
    adminMcpAuditTable,
} from '../../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/schema';
import {
    KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
    ChatPreferencesSchema,
    type ExerciseLearningBlock,
    type ProviderNativePricingRules,
} from '@languon/contracts';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { lockTextAiCapacity } from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleAccountPurgeStore } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { DrizzleKnowledgeStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { DrizzleKnowledgeMediaStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/media-store';
import { DrizzleLearnerStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/learner-store';
import { KnowledgeShareCrypto } from '../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { createFixtureAudio } from '../../../../src/modules/speech/domain/audio-integrity';
import { verifyKnowledgeAudio } from '../../../../src/modules/knowledge/infrastructure/media-audio-validation';
import { knowledgeNotesTable } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/schema';
import {
    knowledgeWorkbooksTable,
    knowledgeWorkbookNotesTable,
    knowledgeWorkbookSharesTable,
} from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/workbook-schema';
import {
    knowledgeMediaAssetsTable,
    knowledgeMediaBlobsTable,
} from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/media-schema';
import {
    knowledgeLearnerAttemptsTable,
    knowledgeLearnerEventsTable,
    knowledgeLearnerCompletionTable,
    knowledgeLearnerCompletionReceiptsTable,
} from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/learner-schema';
import {
    conversationsTable,
    conversationTurnsTable,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { conversationBlockProposalsTable } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-block-proposal-schema';
import { speechRecordingsTable } from '../../../../src/modules/speech/infrastructure/schema';
import { knowledgeSpeechRecordingsTable } from '../../../../src/modules/speech/infrastructure/knowledge-speech-schema';
import { aiProviderPriceRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { aiAccountingSettingsRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { dictionaryAiWorkerObservationsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { transcriptionCredentialFingerprint } from '../../../../src/modules/knowledge/infrastructure/transcription-credential-fingerprint';
import { DrizzleKnowledgeTranscriptionStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-transcription-job-store';
import {
    knowledgeTranscriptionConfigRevisionsTable as configs,
    knowledgeTranscriptionStateTable as configState,
    knowledgeTranscriptionJobsTable as jobs,
    knowledgeTranscriptionReceiptsTable as transcriptionReceipts,
} from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/transcription-accounting-schema';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const nativeRules: ProviderNativePricingRules = {
    version: 1,
    validFrom: '2020-01-01T00:00:00Z',
    validUntil: null,
    variants: [
        {
            id: 'synthetic-duration',
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

const privatePracticeTables = [
    'knowledge_vocabulary_preferences',
    'knowledge_vocabulary_attempts',
    'knowledge_vocabulary_progress',
    'knowledge_sentence_exercises',
    'knowledge_sentence_attempts',
    'knowledge_sentence_reviews',
    'knowledge_sentence_exposures',
    'knowledge_sentence_next_receipts',
] as const;

/** Seed actor-private content on another author's source: note cascades cannot erase it. */
async function seedPrivatePractice(
    client: PostgresClient,
    actor: string,
    note: string,
) {
    const block = randomUUID(),
        entry = randomUUID(),
        attempt = randomUUID(),
        exercise = randomUUID();
    await client`insert into knowledge_vocabulary_preferences(actor_id,note_id,block_id,configuration,shuffle,version)
        values(${actor},${note},${block},'{}',false,1)`;
    await client`insert into knowledge_vocabulary_attempts(id,actor_id,note_id,block_id,entry_id,operation_id,session_id,round,learning_version,rating,configuration)
        values(${attempt},${actor},${note},${block},${entry},${randomUUID()},${randomUUID()},1,1,'known','{}')`;
    await client`insert into knowledge_vocabulary_progress(actor_id,note_id,block_id,entry_id,learning_version,rating,latest_attempt_id)
        values(${actor},${note},${block},${entry},1,'known',${attempt})`;
    const content = JSON.stringify({
        knowledgeSource: { noteId: note, blockId: block },
        sourceSentence: 'Private generated example.',
    });
    await client`insert into knowledge_sentence_exercises(id,actor_id,note_id,block_id,operation_id,public_content,reference_translation,provenance)
        values(${exercise},${actor},${note},${block},${randomUUID()},${content}::jsonb,'Private reference.','[]')`;
    await client`insert into knowledge_sentence_attempts(id,actor_id,note_id,block_id,exercise_id,operation_id,session_id,answer,explanation_language,revealed_hint_ids,reference_revealed,feedback)
        values(${randomUUID()},${actor},${note},${block},${exercise},${randomUUID()},${randomUUID()},'Private answer.','en','[]',false,'{}')`;
    await client`insert into knowledge_sentence_reviews(id,actor_id,note_id,block_id,exercise_id,operation_id,session_id,request_fingerprint)
        values(${randomUUID()},${actor},${note},${block},${exercise},${randomUUID()},${randomUUID()},'synthetic')`;
    await client`insert into knowledge_sentence_exposures(actor_id,note_id,block_id,exercise_id)
        values(${actor},${note},${block},${exercise})`;
    await client`insert into knowledge_sentence_next_receipts(actor_id,operation_id,note_id,block_id,request_fingerprint,result,created_at)
        values(${actor},${randomUUID()},${note},${block},'synthetic','{"private":"prepared source"}',now())`;
}

describe.runIf(isDatabaseIntegrationEnabled())(
    'Feature059 restricted account purge lifecycle',
    () => {
        let client: PostgresClient;
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        afterAll(async () => client?.end());
        it('erases owner content and foreign-source learner state under a due lease while preserving independent copies', async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const db = createDrizzleDatabase(client, databaseSchema),
                now = new Date(),
                owner = randomUUID(),
                reader = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
            const crypto = new KnowledgeShareCrypto(
                'knowledge-account-purge-synthetic-secret',
            );
            const notes = new DrizzleKnowledgeStore(
                    db,
                    { beforeNoteDeletion: async () => {} },
                    crypto,
                ),
                media = new DrizzleKnowledgeMediaStore(db, crypto),
                learner = new DrizzleLearnerStore(db, crypto);
            const exercise: ExerciseLearningBlock = {
                id: randomUUID(),
                type: 'exercise',
                format: 'free-text',
                question: 'Name a greeting.',
                referenceAnswer: 'Hello.',
                explanation: 'Hello is a greeting.',
            };
            const content = {
                title: 'Private workbook',
                summary: '',
                categories: [],
                studiedLanguage: 'en',
                explanationLanguage: 'en',
                body: {
                    schemaVersion: 2 as const,
                    document: {
                        type: 'doc' as const,
                        content: [
                            {
                                type: 'learningBlock' as const,
                                attrs: { block: exercise },
                            },
                        ],
                    },
                },
            };
            const initial = await notes.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const uploaded = await media.upload(
                owner,
                initial.id,
                verifyKnowledgeAudio(createFixtureAudio().bytes, 'audio/wav'),
            );
            const note = await notes.update(owner, initial.id, {
                operationId: randomUUID(),
                expectedVersion: initial.version,
                content: {
                    ...content,
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                ...content.body.document.content,
                                {
                                    type: 'learningBlock',
                                    attrs: {
                                        block: {
                                            id: randomUUID(),
                                            type: 'audio',
                                            assetId: uploaded.id,
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            });
            const share = await notes.issueShare(owner, note.id),
                copy = await notes.copyShared(
                    reader,
                    share.locator,
                    share.key,
                    {
                        operationId: randomUUID(),
                        expectedVersion: note.version,
                    },
                );
            const copiedAudio = copy.body.document.content
                ?.flatMap((node) =>
                    node.attrs?.block ? [node.attrs.block] : [],
                )
                .find((block) => block.type === 'audio');
            if (copiedAudio?.type !== 'audio')
                throw new Error('Missing audio copy');
            const foreign = await notes.create(reader, {
                operationId: randomUUID(),
                content,
            });
            const foreignShare = await notes.issueShare(reader, foreign.id);
            await seedPrivatePractice(client, owner, foreign.id);
            await seedPrivatePractice(client, reader, foreign.id);
            const exerciseRevision = (
                await learner.read(owner, foreign.id, {
                    kind: 'note',
                    ...foreignShare,
                })
            ).exerciseRevisions[0]!.revision;
            await learner.attempt(
                owner,
                foreign.id,
                {
                    id: randomUUID(),
                    noteVersion: foreign.version,
                    exerciseId: exercise.id,
                    exerciseRevision,
                    answer: { format: 'free-text', text: 'Private answer.' },
                },
                { kind: 'note', ...foreignShare },
            );
            await learner.event(
                owner,
                foreign.id,
                {
                    id: randomUUID(),
                    noteVersion: foreign.version,
                    blockId: exercise.id,
                    exerciseRevision,
                    kind: 'answer-revealed',
                },
                { kind: 'note', ...foreignShare },
            );
            await learner.complete(
                owner,
                foreign.id,
                {
                    id: randomUUID(),
                    noteVersion: foreign.version,
                    completed: true,
                },
                { kind: 'note', ...foreignShare },
            );
            await learner.complete(reader, foreign.id, {
                id: randomUUID(),
                noteVersion: foreign.version,
                completed: true,
            });
            const workbook = randomUUID();
            await db.insert(knowledgeWorkbooksTable).values({
                id: workbook,
                ownerId: owner,
                title: 'Private group',
                version: 1,
                createdAt: now,
                updatedAt: now,
            });
            await db
                .insert(knowledgeWorkbookNotesTable)
                .values({ noteId: note.id, workbookId: workbook, position: 0 });
            await db.insert(knowledgeWorkbookSharesTable).values({
                workbookId: workbook,
                locator: crypto.locator(),
                keyDigest: crypto.digest('synthetic-key'),
                createdAt: now,
            });
            const branch = (await notes.getWorkspace(owner, note.id))
                    .branches[0]!,
                chat = randomUUID(),
                turn = randomUUID(),
                preferences = ChatPreferencesSchema.parse({});
            await db.insert(conversationsTable).values({
                id: chat,
                ownerId: owner,
                sourceKind: 'knowledge',
                sourceId: note.id,
                source: { kind: 'knowledge', id: note.id },
                preferences,
                createdAt: now,
                updatedAt: now,
            });
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx.insert(conversationTurnsTable).values({
                    id: turn,
                    conversationId: chat,
                    ownerId: owner,
                    requestId: randomUUID(),
                    requestFingerprint: 'synthetic',
                    status: 'succeeded',
                    authority: { sourceOwnerId: owner },
                    sourceSnapshot: {
                        version: '1',
                        title: 'Private',
                        description: null,
                        studiedLanguage: 'en',
                        provenance: 'saved',
                        material: [],
                    },
                    preferences,
                    execution: {},
                    usage: {
                        inputTokens: 0,
                        outputTokens: 0,
                        chargedCredits: '0',
                        estimated: false,
                    },
                    createdAt: now,
                    updatedAt: now,
                });
            });
            await db.insert(conversationBlockProposalsTable).values({
                id: randomUUID(),
                conversationId: chat,
                turnId: turn,
                noteId: note.id,
                branchId: branch.id,
                baseBranchVersion: branch.version,
                blocks: [exercise],
                createdAt: now,
            });
            const recording = randomUUID();
            await db.insert(speechRecordingsTable).values({
                id: recording,
                canonicalKey: randomUUID(),
                text: 'Private narrated source.',
                language: 'en',
                normalizationRevision: 'synthetic',
                profile: {
                    configurationId: 'fixture-v1',
                    provider: 'fixture',
                    model: 'tone-v1',
                    voice: 'fixture',
                    language: 'en',
                    settingsVersion: '1',
                    estimatedCostUnitsPerCharacter: 0,
                },
                state: 'ready',
                storage: {
                    backend: 'postgres',
                    namespace: 'dictionary-audio-v1',
                    key: `speech/${recording}`,
                },
                createdAt: now,
                lastAccessedAt: now,
            });
            await db
                .insert(knowledgeSpeechRecordingsTable)
                .values({ recordingId: recording, noteId: note.id });
            const priceId = randomUUID(),
                configId = randomUUID();
            await db.insert(aiProviderPriceRevisionsTable).values({
                id: priceId,
                providerId: 'openai',
                modelId: 'gpt-transcribe',
                meter: 'audio-duration',
                version: 1,
                effectiveAt: new Date('2020-01-01'),
                createdAt: now,
                createdBy: owner,
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
                    sourceReference: 'Synthetic duration fixture',
                    reason: 'Immutable billing evidence',
                },
            });
            await db.insert(configs).values({
                id: configId,
                version: 1,
                enabled: true,
                processingControlsRevision:
                    KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
                processingCredentialFingerprint:
                    transcriptionCredentialFingerprint('synthetic-purge-key'),
                dataSharingDisabled: true,
                dataSharingEvidence:
                    'Synthetic actual organization/project sharing disabled review',
                dataSharingAttestedAt: now,
                providerPriceRevisionId: priceId,
                creditsPerMinute: '1',
                maximumDurationMs: 1800000,
                maximumBytes: 5242880,
                maximumProviderCostMicros: 100000,
                billingRulesVerified: true,
                billingEvidence:
                    'Synthetic explicitly reviewed no-minimum billing fixture',
                createdBy: owner,
                createdAt: now,
                reason: 'Immutable operational rationale',
            });
            await db
                .insert(configState)
                .values({ id: 'global', activeRevisionId: configId });
            await db.insert(aiAccountingSettingsRevisionsTable).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '1',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: now,
                reason: 'Synthetic account deletion allowance',
            });
            await db.insert(dictionaryAiWorkerObservationsTable).values({
                id: 'knowledge-purge-transcription-worker',
                workerId: 'knowledge-purge-transcription-worker',
                adapterRevision: 'knowledge-transcription:v1',
                providerId: 'openai',
                modelId: 'gpt-transcribe',
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 3600000),
                status: 'available',
                message: 'Synthetic compatible executor',
                textAiSupportedFormats: ['knowledge-transcription:v1'],
            });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: owner,
                    amount: 100000n,
                    expiresAt: null,
                    source: 'migration',
                    sourceReference: randomUUID(),
                    createdAt: now,
                }),
            );
            const transcription = new DrizzleKnowledgeTranscriptionStore({
                database: db,
                executionReady: true,
                credentialFingerprint: transcriptionCredentialFingerprint(
                    'synthetic-purge-key',
                ),
            });
            const request = {
                operationId: randomUUID(),
                noteId: note.id,
                assetId: uploaded.id,
                languages: ['en'],
            };
            const quote = await transcription.submit(
                owner,
                request,
                new AbortController().signal,
            );
            await transcription.submit(
                owner,
                { ...request, confirmedMaximumCredits: quote.maximumCredits },
                new AbortController().signal,
            );
            await transcription.submit(
                reader,
                {
                    operationId: randomUUID(),
                    noteId: copy.id,
                    assetId: copiedAudio.assetId,
                    languages: ['en'],
                },
                new AbortController().signal,
            );
            const at = new Date();
            const ownedTokens = [randomUUID(), randomUUID()],
                foreignToken = randomUUID(),
                expenseReference = randomUUID(),
                ownedAudit = randomUUID(),
                foreignAudit = randomUUID(),
                ownPreview = randomUUID(),
                targetedPreview = randomUUID(),
                retainedPreview = randomUUID();
            await db.insert(adminMcpTokensTable).values(
                [...ownedTokens, foreignToken].map((id, index) => ({
                    id,
                    ownerUserId: index < 2 ? owner : reader,
                    name: 'Private administrative token',
                    secretHash: String(index + 1).repeat(64),
                    permissions: [],
                    allowedActions: ['private-action'],
                    limits: {},
                    createdAt: at,
                    expiresAt: new Date(at.getTime() + 3600000),
                })),
            );
            await db.insert(adminMcpPreviewsTable).values(
                [
                    {
                        id: ownPreview,
                        tokenId: ownedTokens[0]!,
                        target: 'private-target',
                    },
                    {
                        id: targetedPreview,
                        tokenId: foreignToken,
                        target: `user-action-budget:${owner}`,
                    },
                    {
                        id: retainedPreview,
                        tokenId: foreignToken,
                        target: 'unrelated-target',
                    },
                ].map((item) => ({
                    ...item,
                    operation: 'credits.grant' as const,
                    current: { private: 'source' },
                    proposed: { private: 'change' },
                    expectedVersion: '1',
                    reason: 'Private explanation',
                    createdAt: at,
                    expiresAt: new Date(at.getTime() + 60000),
                })),
            );
            await db.insert(adminMcpReceiptsTable).values({
                id: randomUUID(),
                tokenId: ownedTokens[0]!,
                operationKey: 'synthetic',
                previewId: ownPreview,
                payloadHash: 'a'.repeat(64),
                result: { private: 'result' },
                createdAt: at,
            });
            await db.insert(adminMcpReservationsTable).values({
                id: randomUUID(),
                tokenId: ownedTokens[0]!,
                operationKey: 'synthetic',
                payloadHash: 'b'.repeat(64),
                kind: 'model-check',
                day: 'synthetic',
                state: 'reserved',
                reservedUnits: 1n,
                createdAt: at,
            });
            await db.insert(adminMcpAuditTable).values(
                [
                    {
                        id: ownedAudit,
                        actorUserId: owner,
                        target: 'source',
                        metadata: {
                            providerExpenseId: expenseReference,
                            reservationId: 'invalid',
                            providerExpenseIds: [
                                expenseReference,
                                'private text',
                                4,
                            ],
                            private: 'erase',
                        },
                    },
                    {
                        id: foreignAudit,
                        actorUserId: reader,
                        target: 'unrelated-target',
                        metadata: { private: 'preserve' },
                    },
                ].map((item) => ({
                    ...item,
                    tokenId: foreignToken,
                    action: 'synthetic',
                    reason: 'Private rationale',
                    correlationId: randomUUID(),
                    occurredAt: at,
                    expiresAt: new Date(at.getTime() + 3600000),
                })),
            );
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            await db.insert(accountDeletionRequestsTable).values({
                userId: owner,
                state: 'pending',
                scheduledAt: new Date(at.getTime() - 120000),
                purgeAt: new Date(at.getTime() - 60000),
                nextAttemptAt: new Date(at.getTime() - 60000),
                updatedAt: at,
            });
            const role = `knowledge_owner_purge_${randomUUID().replaceAll('-', '')}`,
                connection = createPostgresClient({
                    databaseUrl: getTestDatabaseUrl(),
                    maxConnections: 1,
                });
            await client.unsafe(`create role ${role}`);
            try {
                const script = await readFile(
                    new URL(
                        '../../../../../../infra/deploy/sql/account-purge-worker-role.sql',
                        import.meta.url,
                    ),
                    'utf8',
                );
                await client.unsafe(
                    script
                        .split('\n')
                        .filter((line) => !line.startsWith('\\'))
                        .join('\n')
                        .replaceAll(':"account_purge_role"', role),
                );
                await connection.unsafe(`set role ${role}`);
                for (const query of [
                    'select body from knowledge_notes',
                    'select result from knowledge_learner_attempts',
                    'select bytes from knowledge_media_blobs',
                    'select blocks from conversation_block_proposals',
                    'select result from knowledge_transcription_jobs',
                    'select text from speech_recordings',
                    'select secret_hash from admin_mcp_tokens',
                    'select metadata from admin_mcp_audit_events',
                    'update knowledge_transcription_jobs set result=null where false',
                    `delete from knowledge_notes where id='${copy.id}'`,
                    ...privatePracticeTables.map(
                        (table) => `select * from ${table}`,
                    ),
                ])
                    await expect(
                        connection.unsafe(query),
                    ).rejects.toBeDefined();
                const worker = new DrizzleAccountPurgeStore(
                        createDrizzleDatabase(connection, databaseSchema),
                    ),
                    claim = await worker.claimDue({
                        now: at,
                        workerId: 'knowledge-owner-purge-test',
                    });
                expect(claim?.userId).toBe(owner);
                await expect(
                    connection`select languon_purge_knowledge_owner(${reader}::uuid,'knowledge-owner-purge-test',${claim!.fencingToken})`,
                ).rejects.toBeDefined();
                await expect(
                    connection`select languon_purge_admin_mcp_owner(${reader}::uuid,'knowledge-owner-purge-test',${claim!.fencingToken},${at.toISOString()}::timestamptz)`,
                ).rejects.toBeDefined();
                await expect(
                    connection`select languon_purge_admin_mcp_owner(${owner}::uuid,'knowledge-owner-purge-test',${claim!.fencingToken + 1},${at.toISOString()}::timestamptz)`,
                ).rejects.toBeDefined();
                expect(
                    await worker.finish({
                        ...claim!,
                        workerId: 'knowledge-owner-purge-test',
                        now: new Date(),
                    }),
                ).toBe(true);
                for (const table of privatePracticeTables) {
                    const rows = await client.unsafe(
                        `select actor_id from ${table}`,
                    );
                    expect(rows.map((row) => row.actor_id)).toEqual([reader]);
                }
                const tokens = await db.select().from(adminMcpTokensTable);
                expect(
                    tokens.filter((token) => token.ownerUserId === owner),
                ).toHaveLength(2);
                for (const token of tokens.filter(
                    (token) => token.ownerUserId === owner,
                )) {
                    expect(token).toMatchObject({
                        name: 'Account purged',
                        permissions: [],
                        allowedActions: [],
                        limits: {},
                        lastUsedAt: null,
                    });
                    expect(token.revokedAt).not.toBeNull();
                }
                expect(
                    tokens.find((token) => token.id === foreignToken)
                        ?.revokedAt,
                ).toBeNull();
                expect(
                    (await db.select().from(adminMcpPreviewsTable)).map(
                        (row) => row.id,
                    ),
                ).toEqual([retainedPreview]);
                expect(
                    await db.select().from(adminMcpReceiptsTable),
                ).toHaveLength(0);
                expect(
                    await db.select().from(adminMcpReservationsTable),
                ).toHaveLength(0);
                const audits = await db.select().from(adminMcpAuditTable);
                expect(
                    audits.find((event) => event.id === ownedAudit),
                ).toMatchObject({
                    target: 'purged-account',
                    reason: 'Account purged',
                    metadata: {
                        providerExpenseId: expenseReference,
                        providerExpenseIds: [expenseReference],
                    },
                });
                expect(
                    audits.find((event) => event.id === foreignAudit)?.metadata,
                ).toEqual({ private: 'preserve' });
                for (const table of [
                    knowledgeLearnerAttemptsTable,
                    knowledgeLearnerEventsTable,
                ])
                    expect(await db.select().from(table)).toHaveLength(0);
                expect(
                    await db
                        .select()
                        .from(knowledgeLearnerCompletionReceiptsTable),
                ).toMatchObject([{ actorId: reader, noteId: foreign.id }]);
                expect(
                    await db.select().from(knowledgeLearnerCompletionTable),
                ).toMatchObject([{ actorId: reader, noteId: foreign.id }]);
                expect(
                    await db.select().from(knowledgeWorkbooksTable),
                ).toHaveLength(0);
                expect(
                    await db.select().from(conversationBlockProposalsTable),
                ).toHaveLength(0);
                expect(
                    (await db.select().from(jobs)).map((job) => job.ownerId),
                ).toEqual([reader]);
                expect(
                    (await db.select().from(transcriptionReceipts)).map(
                        (receipt) => receipt.ownerId,
                    ),
                ).toEqual([reader]);
                expect((await db.select().from(configs))[0]).toMatchObject({
                    createdBy: null,
                    reason: 'Immutable operational rationale',
                });
                expect(
                    (await db.select().from(speechRecordingsTable))[0],
                ).toMatchObject({ text: '', state: 'deleting' });
                expect(
                    await db.select().from(knowledgeSpeechRecordingsTable),
                ).toHaveLength(0);
                expect(
                    (await db.select().from(knowledgeNotesTable)).map(
                        (row) => row.ownerId,
                    ),
                ).toEqual([reader, reader]);
                expect(
                    await db.select().from(knowledgeMediaAssetsTable),
                ).toHaveLength(1);
                expect(
                    await db.select().from(knowledgeMediaBlobsTable),
                ).toHaveLength(1);
                expect(
                    (
                        await media.read(copy.id, copiedAudio.assetId, {
                            ownerId: reader,
                        })
                    ).bytes.length,
                ).toBeGreaterThan(0);
                expect(
                    await worker.finish({
                        ...claim!,
                        workerId: 'knowledge-owner-purge-test',
                        now: new Date(),
                    }),
                ).toBe(false);
                await expect(
                    connection`select languon_purge_knowledge_owner(${owner}::uuid,'knowledge-owner-purge-test',${claim!.fencingToken})`,
                ).rejects.toBeDefined();
                await expect(
                    connection`select languon_purge_admin_mcp_owner(${owner}::uuid,'knowledge-owner-purge-test',${claim!.fencingToken},${at.toISOString()}::timestamptz)`,
                ).rejects.toBeDefined();
            } finally {
                await connection.unsafe('reset role');
                await connection.end();
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        }, 120000);
    },
);
