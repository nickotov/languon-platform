import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import type { LearningBlock } from '@languon/contracts';
import { eq } from 'drizzle-orm';
import { describe, it, expect } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleAccountPurgeStore } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { DrizzleKnowledgeStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { KnowledgeShareCrypto } from '../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { pinKnowledgeLearningSource } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/learning-source-binding';
import { DrizzleTextsJobStore } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/drizzle-texts-job-store';
import { DrizzleTextAiAdmissionParticipant } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    ActionAllowanceConfirmationRequired,
    withActionAllowanceConsent,
} from '../../../../src/modules/ai-credits/infrastructure/action-allowance-consent';
import {
    aiCreditActionsTable,
    aiCreditActionAttemptsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { textsAiJobsTable } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-schema';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    textAiModelCatalog,
    defaultTextAiProviderBudgetPolicy,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { textsExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import { fixtureRouteFingerprint } from '../../../support/text-ai-routing-fixture';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Knowledge private action account purge',
    () => {
        it('fences and refunds foreign-reader work on deleted sources, removes actor work, and preserves independent copies', async () => {
            const client = createTestPostgresClient();
            const connection = createPostgresClient({
                databaseUrl: getTestDatabaseUrl(),
                maxConnections: 1,
            });
            const role = `knowledge_learning_purge_${randomUUID().replaceAll('-', '')}`;
            let roleCreated = false;
            try {
                await resetTestDatabase(client);
                await migrateTestDatabase(client);
                const db = createDrizzleDatabase(client, databaseSchema);
                const owner = randomUUID(),
                    reader = randomUUID(),
                    now = new Date();
                await db.insert(usersTable).values([
                    { id: owner, status: 'active' },
                    { id: reader, status: 'active' },
                ]);
                const crypto = new KnowledgeShareCrypto(
                    'synthetic-knowledge-learning-purge',
                );
                const notes = new DrizzleKnowledgeStore(
                    db,
                    { beforeNoteDeletion: async () => {} },
                    crypto,
                );
                const block: Extract<
                    LearningBlock,
                    { type: 'bilingual-text' }
                > = {
                    id: randomUUID(),
                    type: 'bilingual-text',
                    language: 'en',
                    segments: [{ id: randomUUID(), text: 'The cat sleeps.' }],
                    translations: [],
                };
                const content = {
                    title: 'Private translation source',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'en',
                    explanationLanguage: 'ru',
                    body: {
                        schemaVersion: 2 as const,
                        document: {
                            type: 'doc' as const,
                            content: [
                                {
                                    type: 'learningBlock' as const,
                                    attrs: { block },
                                },
                            ],
                        },
                    },
                };
                const source = await notes.create(owner, {
                    operationId: randomUUID(),
                    content,
                });
                const share = await notes.issueShare(owner, source.id);
                const copy = await notes.copyShared(
                    reader,
                    share.locator,
                    share.key,
                    {
                        operationId: randomUUID(),
                        expectedVersion: source.version,
                    },
                );
                const copiedBlock =
                    copy.body.document.content?.[0]?.attrs?.block;
                if (copiedBlock?.type !== 'bilingual-text')
                    throw new Error('Missing independent text copy');
                const copyShare = await notes.issueShare(reader, copy.id);
                const model = textAiModelCatalog[0]!,
                    revisionId = randomUUID();
                await db
                    .insert(dictionaryAiConfigurationRevisionsTable)
                    .values({
                        id: revisionId,
                        version: 1,
                        createdByUserId: reader,
                        catalogSnapshot: {
                            ...model,
                            modelId: model.id,
                            enabledModelIds: [model.id],
                            supportedFormats: [...model.supportedFormats],
                        },
                    });
                await db.insert(dictionaryAiConfigurationTable).values({
                    id: 'global',
                    version: 1,
                    activeRevisionId: revisionId,
                });
                await db.insert(dictionaryAiWorkerObservationsTable).values({
                    id: textsExecutionObservationId(
                        'knowledge-purge-worker',
                        model.providerId,
                        model.id,
                    ),
                    workerId: 'knowledge-purge-worker',
                    providerId: model.providerId,
                    modelId: model.id,
                    adapterRevision: model.adapterRevision,
                    textAiSelectionRevision: 1,
                    textAiCapacityRevision: 1,
                    textsExecutionRevision: 1,
                    textsCapacityRevision: 1,
                    creditSettlementRevision: 1,
                    textAiSupportedFormats: [...model.supportedFormats],
                    status: 'available',
                    message: 'Synthetic executor',
                    checkedAt: now,
                    expiresAt: new Date(now.getTime() + 3600000),
                });
                await seedLegacyActionFixture(db);
                for (const actor of [owner, reader])
                    await db.transaction((tx) =>
                        new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).issueGrant({
                            ownerId: actor,
                            amount: 1000000000n,
                            createdAt: now,
                            expiresAt: null,
                            source: 'admin',
                            sourceReference: randomUUID(),
                        }),
                    );
                const jobs = new DrizzleTextsJobStore(db, {
                    fingerprintSecret: 'synthetic-knowledge-purge-jobs',
                    globalQueueLimit: 100,
                    userQueueLimit: 50,
                    resolveExecution: (tx, userId, format, at) =>
                        new DrizzleTextAiAdmissionParticipant(tx, {
                            routingEnabled: true,
                            credentialConfigured: () => true,
                            routeFingerprint: fixtureRouteFingerprint,
                        }).resolve({
                            userId,
                            format,
                            now: at,
                            legacyBudget: defaultTextAiProviderBudgetPolicy,
                            requiredWorkerFormat: format,
                        }),
                });
                const context = () => ({
                    now: new Date(),
                    signal: new AbortController().signal,
                });
                async function enqueue(
                    actorId: string,
                    noteId: string,
                    value: typeof block,
                    access?: { kind: 'note'; locator: string; key: string },
                ) {
                    const pinned = await db.transaction((tx) =>
                        pinKnowledgeLearningSource(
                            tx,
                            crypto,
                            actorId,
                            noteId,
                            value.id,
                            access,
                        ),
                    );
                    const request = {
                        operationId: randomUUID(),
                        folderId: null,
                        sourceText: value.segments[0]!.text,
                        sourceLanguage: 'en' as const,
                        targetLanguage: 'ru' as const,
                    };
                    const segments = [
                        {
                            pairId: value.segments[0]!.id,
                            text: request.sourceText,
                            startOffset: 0,
                            endOffset: request.sourceText.length,
                            paragraphIndex: 0,
                        },
                    ];
                    try {
                        return await jobs.enqueueKnowledgeTranslation(
                            actorId,
                            request,
                            segments,
                            pinned.binding,
                            context(),
                        );
                    } catch (error) {
                        if (
                            !(
                                error instanceof
                                ActionAllowanceConfirmationRequired
                            )
                        )
                            throw error;
                        return withActionAllowanceConsent(error.quote.id, () =>
                            jobs.enqueueKnowledgeTranslation(
                                actorId,
                                request,
                                segments,
                                pinned.binding,
                                context(),
                            ),
                        );
                    }
                }
                const foreign = await enqueue(reader, source.id, block, {
                    kind: 'note',
                    ...share,
                });
                const lease = await jobs.claimNext(
                    {
                        workerId: 'knowledge-purge-worker',
                        leaseMs: 60000,
                        globalConcurrency: 10,
                        userConcurrency: 10,
                        supportedFormats: [
                            'text-translation:v1',
                            'text-translation:v2',
                            'text-translation:v3',
                        ],
                    },
                    context(),
                );
                expect(lease?.lease.jobId).toBe(foreign.id);
                expect(await jobs.markDispatched(lease!.lease, context())).toBe(
                    true,
                );
                const actorJob = await enqueue(owner, copy.id, copiedBlock, {
                    kind: 'note',
                    ...copyShare,
                });
                const control = await enqueue(reader, copy.id, copiedBlock);
                await client`insert into knowledge_private_translations(actor_id,note_id,block_id,source_fingerprint,target_language,segments,updated_at)
                select actor_id,note_id,block_id,binding->>'sourceFingerprint','es','[{"sourceSegmentId":"00000000-0000-4000-8000-000000000001","text":"Private translation"}]',now()
                from knowledge_text_job_sources where job_id in (${foreign.id}::uuid,${actorJob.id}::uuid,${control.id}::uuid)`;
                const [held] = await db
                    .select()
                    .from(aiCreditActionsTable)
                    .where(eq(aiCreditActionsTable.id, foreign.id));
                expect(held!.heldMilli).toBeGreaterThan(0n);
                const at = new Date();
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
                await client.unsafe(`create role ${role}`);
                roleCreated = true;
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
                    'select input_payload from texts_ai_jobs',
                    'select binding from knowledge_text_job_sources',
                    'select segments from knowledge_private_translations',
                    "update texts_ai_jobs set execution_state='cancelled' where false",
                ])
                    await expect(
                        connection.unsafe(query),
                    ).rejects.toBeDefined();
                const worker = new DrizzleAccountPurgeStore(
                    createDrizzleDatabase(connection, databaseSchema),
                );
                const claim = await worker.claimDue({
                    now: at,
                    workerId: 'knowledge-learning-purger',
                });
                expect(claim?.userId).toBe(owner);
                await expect(
                    connection`select languon_quiesce_knowledge_learning_for_purge(${owner}::uuid,'wrong-worker',${claim!.fencingToken})`,
                ).rejects.toBeDefined();
                await expect(
                    connection`select languon_quiesce_knowledge_learning_for_purge(${reader}::uuid,'knowledge-learning-purger',${claim!.fencingToken})`,
                ).rejects.toBeDefined();
                await expect(
                    connection`select languon_quiesce_knowledge_learning_for_purge(${owner}::uuid,'knowledge-learning-purger',${claim!.fencingToken + 1})`,
                ).rejects.toBeDefined();
                expect(
                    await worker.finish({
                        ...claim!,
                        workerId: 'knowledge-learning-purger',
                        now: new Date(),
                    }),
                ).toBe(true);
                const [cancelled] = await db
                    .select()
                    .from(textsAiJobsTable)
                    .where(eq(textsAiJobsTable.id, foreign.id));
                expect(cancelled).toMatchObject({
                    ownerId: reader,
                    executionState: 'cancelled',
                    failureCategory: 'access_revoked',
                    workerId: null,
                    leaseDeadline: null,
                    inputPayload: null,
                    resultPayload: null,
                    externalSourceKind: 'knowledge-block',
                    providerReservationState: 'settled',
                });
                expect(cancelled!.fencingToken).toBeGreaterThan(
                    BigInt(lease!.lease.fencingToken),
                );
                const [settled] = await db
                    .select()
                    .from(aiCreditActionsTable)
                    .where(eq(aiCreditActionsTable.id, foreign.id));
                expect(settled).toMatchObject({
                    state: 'settled',
                    outcome: 'failure',
                    chargedMilli: 0n,
                });
                expect(
                    await db
                        .select()
                        .from(aiCreditActionsTable)
                        .where(eq(aiCreditActionsTable.id, actorJob.id)),
                ).toHaveLength(0);
                const [attempt] = await db
                    .select()
                    .from(aiCreditActionAttemptsTable)
                    .where(
                        eq(aiCreditActionAttemptsTable.actionId, foreign.id),
                    );
                expect(attempt).toMatchObject({
                    state: 'settled',
                    successful: 0,
                });
                expect(await notes.get(reader, copy.id)).toMatchObject({
                    id: copy.id,
                    title: content.title,
                });
                const [unchanged] = await db
                    .select()
                    .from(textsAiJobsTable)
                    .where(eq(textsAiJobsTable.id, control.id));
                expect(unchanged).toMatchObject({
                    executionState: 'queued',
                    inputPayload: expect.any(Object),
                });
                expect(
                    await client`select actor_id,note_id from knowledge_private_translations`,
                ).toMatchObject([{ actor_id: reader, note_id: copy.id }]);
                await expect(
                    jobs.markDispatched(lease!.lease, context()),
                ).resolves.toBe(false);
                await expect(
                    connection`select languon_quiesce_knowledge_learning_for_purge(${owner}::uuid,'knowledge-learning-purger',${claim!.fencingToken})`,
                ).rejects.toBeDefined();
            } finally {
                await connection.unsafe('reset role');
                await connection.end();
                if (roleCreated) {
                    await client.unsafe(`drop owned by ${role}`);
                    await client.unsafe(`drop role ${role}`);
                }
                await client.end();
            }
        }, 120000);
    },
);
