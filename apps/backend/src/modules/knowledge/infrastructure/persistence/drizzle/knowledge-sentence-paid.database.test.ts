import type { SentencePersistencePolicy } from '../../../../learning/infrastructure/persistence/drizzle/sentence-practice-context';
import { readFile } from 'node:fs/promises';
import type { SentenceDatabase } from '../../../../learning/infrastructure/persistence/drizzle/sentence-persistence-support';
import { accountDeletionRequestsTable } from '../../../../users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleAccountPurgeStore } from '../../../../users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { KnowledgeNoteContentSchema } from '@languon/contracts';
import { eq, sql } from 'drizzle-orm';
import {
    afterAll,
    afterEach,
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
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { seedLegacyActionFixture } from '../../../../../../tests/support/legacy-action-fixture';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { aiCreditAccountsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/schema';
import { aiCreditActionsTable as actions } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { dictionaryAiConfigurationRevisionsTable as configurations } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import { sentenceAiJobsTable as jobs } from '../../../../learning/infrastructure/persistence/drizzle/sentence-schema';
import { DrizzleSentenceWorkerStore } from '../../../../learning/infrastructure/persistence/drizzle/drizzle-sentence-worker-store';
import { createSentenceAiProvider } from '../../../../learning/infrastructure/ai/sentence-ai-provider';
import { validateSentenceGeneration } from '../../../../learning/domain/sentence-content';
import { validateSentenceCheck } from '../../../../learning/domain/sentence-feedback';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleKnowledgeSentenceFreeStore } from './knowledge-sentence-free-store';
import { DrizzleKnowledgeSentencePaid } from './knowledge-sentence-paid';
import { eraseKnowledgeSentenceJobs } from './knowledge-sentence-cleanup';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';

const secret = 'synthetic-knowledge-sentence-paid-source';
describe.runIf(isDatabaseIntegrationEnabled())(
    'private knowledge sentence paid lifecycle',
    () => {
        let client: PostgresClient;
        let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
        let owner: string, reader: string, noteId: string, blockId: string;
        let source: {
            actorId: string;
            noteId: string;
            blockId: string;
            access: { kind: 'note'; locator: string; key: string };
        };
        let policy: SentencePersistencePolicy;
        let knowledge: DrizzleKnowledgeStore,
            paid: DrizzleKnowledgeSentencePaid,
            free: DrizzleKnowledgeSentenceFreeStore,
            worker: DrizzleSentenceWorkerStore;
        const context = () => ({
            now: new Date(),
            signal: new AbortController().signal,
        });
        const request = () => ({
            operationId: randomUUID(),
            sessionId: randomUUID(),
            direction: 'source-to-target' as const,
            mode: 'new-only' as const,
            scope: { type: 'all' as const },
            visitedExerciseIds: [],
        });
        const claim = () =>
            worker.claimNext(
                {
                    workerId: 'knowledge-sentence-fixture',
                    supportedFormats: [
                        'sentence-generation:v1',
                        'sentence-generation:v2',
                        'sentence-check:v1',
                    ],
                    learningExecutionRevision: 1,
                    textAiSelectionRevision: 1,
                    creditSettlementRevision: 1,
                    leaseMs: 60_000,
                    globalConcurrency: 10,
                    learnerConcurrency: 2,
                },
                context(),
            );
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
        }, 120_000);
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            owner = randomUUID();
            reader = randomUUID();
            blockId = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
            await db
                .insert(aiCreditAccountsTable)
                .values({ userId: reader, mode: 'unlimited' });
            const crypto = new KnowledgeShareCrypto(secret);
            knowledge = new DrizzleKnowledgeStore(
                db,
                {
                    beforeNoteDeletion: async (tx, { noteId, now }) =>
                        eraseKnowledgeSentenceJobs(tx, noteId, now),
                },
                crypto,
            );
            const note = await knowledge.create(owner, {
                operationId: randomUUID(),
                content: KnowledgeNoteContentSchema.parse({
                    title: 'Practice source',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'en',
                    explanationLanguage: 'es',
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
                                            type: 'vocabulary',
                                            language: 'en',
                                            translationLanguage: 'es',
                                            entries: [
                                                {
                                                    id: randomUUID(),
                                                    term: 'cat',
                                                    translation: 'gato',
                                                },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                    },
                }),
            });
            noteId = note.id;
            const share = await knowledge.issueShare(owner, noteId);
            source = {
                actorId: reader,
                noteId,
                blockId,
                access: { kind: 'note', ...share },
            };
            const model = textAiModelCatalog[0]!;
            const snapshot: TextAiExecutionSnapshot = {
                adapterRevision: model.adapterRevision,
                aggregateBudget: model.aggregateBudget,
                credentialReference: model.credentialReference,
                creditPricing: model.creditPricing,
                enabledModelIds: [model.id],
                modelId: model.id,
                perCallMaxInputTokens: model.perCallMaxInputTokens,
                perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                providerId: model.providerId,
                supportedFormats: [
                    'sentence-generation:v1',
                    'sentence-generation:v2',
                    'sentence-check:v1',
                ],
            };
            const revisionId = randomUUID();
            await db.insert(configurations).values({
                id: revisionId,
                version: 1,
                createdByUserId: owner,
                catalogSnapshot: snapshot,
            });
            await seedLegacyActionFixture(db);
            policy = {
                resolveExecution: async () => ({
                    snapshot: { ...snapshot },
                    revisionId,
                    selectionVersion: 1,
                    budget: snapshot.aggregateBudget,
                }),
            };
            paid = new DrizzleKnowledgeSentencePaid(db, crypto, policy);
            free = new DrizzleKnowledgeSentenceFreeStore(db, crypto, (tx) =>
                paid.admission(tx),
            );
            worker = new DrizzleSentenceWorkerStore(db);
        }, 120_000);
        afterEach(() => vi.unstubAllGlobals());
        afterAll(async () => client?.end());
        it.each([1, 2] as const)(
            'uses the existing provider and financial engine for private generation v%i and answer feedback',
            async (policyVersion) => {
                paid = new DrizzleKnowledgeSentencePaid(
                    db,
                    new KnowledgeShareCrypto(secret),
                    {
                        ...policy,
                        generationFormat: `sentence-generation:v${policyVersion}`,
                    },
                );
                const submitted = await free.next(source, request(), context());
                expect(submitted.kind).toBe('job');
                const job = await claim();
                if (!job || job.kind !== 'sentence-generation')
                    throw new Error('Expected sentence job');
                const entry = job.input.candidates[0]!;
                let reply: object = {
                    sourceText: 'The cat sleeps.',
                    referenceTranslation: 'El gato duerme.',
                    segments: [
                        {
                            text: 'The ',
                            entryId: null,
                            ...(policyVersion === 2
                                ? {
                                      contextualHint: {
                                          normalizedHint: 'el',
                                          hintForm: 'lemma',
                                      },
                                  }
                                : {}),
                        },
                        {
                            text: 'cat',
                            entryId: 'candidate-1',
                            ...(policyVersion === 2
                                ? { contextualHint: null }
                                : {}),
                        },
                        {
                            text: ' sleeps.',
                            entryId: null,
                            ...(policyVersion === 2
                                ? { contextualHint: null }
                                : {}),
                        },
                    ],
                    targets: [
                        {
                            entryId: 'candidate-1',
                            normalizedHint: 'gato',
                            hintForm: 'lemma',
                        },
                    ],
                };
                let calls = 0;
                vi.stubGlobal(
                    'fetch',
                    async (url: unknown, init?: RequestInit) => {
                        expect(String(url)).toBe(
                            'https://api.deepseek.com/chat/completions',
                        );
                        expect(init?.method).toBe('POST');
                        calls++;
                        return new Response(
                            JSON.stringify({
                                id: 'synthetic-private-sentence',
                                object: 'chat.completion',
                                created: 0,
                                model: 'deepseek-flash',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: JSON.stringify(reply),
                                        },
                                        finish_reason: 'stop',
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 100,
                                    completion_tokens: 30,
                                    total_tokens: 130,
                                },
                            }),
                            { headers: { 'Content-Type': 'application/json' } },
                        );
                    },
                );
                const provider = createSentenceAiProvider({
                    credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
                });
                expect(await worker.markDispatched(job.lease, context())).toBe(
                    'dispatch',
                );
                const generated = await provider.generate({
                    input: job.input,
                    execution: job.execution,
                    budget: job.budget,
                    idempotencyKey: job.providerIdempotencyKey,
                    signal: context().signal,
                });
                expect(
                    await worker.completeGeneration(
                        job.lease,
                        {
                            content: validateSentenceGeneration(
                                job.input,
                                generated.draft,
                            ),
                            ...(generated.usage
                                ? { usage: generated.usage }
                                : {}),
                        },
                        context(),
                    ),
                ).toBe('committed');
                const read = await paid.getJob(
                    source,
                    job.lease.jobId,
                    context(),
                );
                if (read.result?.kind !== 'exercise')
                    throw new Error('Expected published result');
                expect(read.result.exercise).toMatchObject({
                    dictionaryId: null,
                    knowledgeSource: { noteId, blockId },
                });
                await expect(
                    paid.getJob(
                        { ...source, actorId: owner },
                        job.lease.jobId,
                        context(),
                    ),
                ).rejects.toThrow();
                const check = await paid.enqueueCheck(
                    source,
                    read.result.exercise.id,
                    {
                        operationId: randomUUID(),
                        sessionId: randomUUID(),
                        answer: 'El gato está durmiendo.',
                        explanationLanguage: 'en',
                        revealedHintIds: [],
                    },
                    context(),
                );
                const checking = await claim();
                if (!checking || checking.kind !== 'sentence-check')
                    throw new Error('Expected checking job');
                reply = {
                    proposedPercentage: 100,
                    meaning: 'correct',
                    grammar: 'correct',
                    targets: {
                        'target-1': {
                            status: 'used',
                            explanation: 'Valid alternative.',
                        },
                    },
                    issues: [],
                    improvedTranslation: 'El gato está durmiendo.',
                    explanation: 'The alternative preserves the meaning.',
                };
                expect(
                    await worker.markDispatched(checking.lease, context()),
                ).toBe('dispatch');
                const checked = await provider.check({
                    input: checking.input,
                    execution: checking.execution,
                    budget: checking.budget,
                    idempotencyKey: checking.providerIdempotencyKey,
                    signal: context().signal,
                });
                expect(
                    await worker.completeCheck(
                        checking.lease,
                        {
                            feedback: validateSentenceCheck(
                                checking.input,
                                checked.draft,
                            ),
                            ...(checked.usage ? { usage: checked.usage } : {}),
                        },
                        context(),
                    ),
                ).toBe('committed');
                const answer = await paid.getJob(source, check.id, context());
                expect(answer.result?.kind).toBe('attempt');
                expect(calls).toBe(2);
                const [row] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, job.lease.jobId));
                expect(row).toMatchObject({
                    dictionaryId: null,
                    sourceKind: 'knowledge-vocabulary',
                });
                const financial = await db.select().from(actions);
                expect(financial).toHaveLength(2);
                expect(
                    financial.every(
                        (a) =>
                            a.ownerId === reader &&
                            a.state === 'settled' &&
                            a.outcome === 'success',
                    ),
                ).toBe(true);
                expect(entry.sourceText).toBe('cat');
            },
            60_000,
        );
        it('rejects revoked reads and settles a deleted source while an old worker fence cannot publish', async () => {
            await free.next(source, request(), context());
            const job = await claim();
            if (!job) throw new Error('Expected admitted source');
            await knowledge.revokeShare(owner, noteId);
            await expect(
                paid.getJob(source, job.lease.jobId, context()),
            ).rejects.toThrow();
            expect(await worker.markDispatched(job.lease, context())).toBe(
                'terminalized',
            );
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.lease.jobId));
            expect(action).toMatchObject({
                state: 'settled',
                outcome: 'failure',
                chargedMilli: 0n,
            });
            const share = await knowledge.issueShare(owner, noteId);
            source = { ...source, access: { kind: 'note', ...share } };
            const queued = await free.next(source, request(), context());
            expect(queued.kind).toBe('job');
            await modelPricingTransaction(db, async (tx) =>
                eraseKnowledgeSentenceJobs(tx, noteId, new Date()),
            );
            const rows = await db.select().from(jobs);
            expect(
                rows.every(
                    (j) =>
                        j.executionState === 'cancelled' ||
                        j.executionState === 'failed',
                ),
            ).toBe(true);
        });
        it('quiesces foreign-reader sentence jobs for a due source-owner purge while independent copies survive', async () => {
            const submitted = await free.next(source, request(), context());
            if (submitted.kind !== 'job')
                throw new Error('Expected pending reader action');
            const active = await claim();
            if (!active) throw new Error('Expected active reader job');
            const note = await knowledge.get(owner, noteId);
            const copy = await knowledge.copyShared(
                reader,
                source.access.locator,
                source.access.key,
                { operationId: randomUUID(), expectedVersion: note.version },
            );
            const copiedBlock = copy.body.document.content?.[0]?.attrs?.block;
            if (copiedBlock?.type !== 'vocabulary')
                throw new Error('Expected independently copied vocabulary');
            const independent = await free.next(
                { actorId: reader, noteId: copy.id, blockId: copiedBlock.id },
                request(),
                context(),
            );
            if (independent.kind !== 'job')
                throw new Error('Expected independent queued job');
            const now = new Date();
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            await db.insert(accountDeletionRequestsTable).values({
                userId: owner,
                state: 'pending',
                scheduledAt: new Date(now.getTime() - 120_000),
                purgeAt: new Date(now.getTime() - 60_000),
                nextAttemptAt: new Date(now.getTime() - 60_000),
                updatedAt: now,
            });
            const workerId = 'knowledge-sentence-purge';
            const purge = await new DrizzleAccountPurgeStore(db).claimDue({
                now,
                workerId,
            });
            if (!purge) throw new Error('Expected due purge claim');
            await client`select public.languon_quiesce_knowledge_learning_for_purge(${owner}::uuid,${workerId},${purge.fencingToken}::integer)`;
            const [cancelled] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, submitted.job.id));
            expect(cancelled).toMatchObject({
                executionState: 'cancelled',
                failureCategory: 'access_revoked',
                workerId: null,
            });
            expect(cancelled!.fencingToken).toBeGreaterThan(
                BigInt(active.lease.fencingToken),
            );
            const [financial] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, submitted.job.id));
            expect(financial).toMatchObject({
                state: 'settled',
                outcome: 'failure',
                chargedMilli: 0n,
            });
            const [control] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, independent.job.id));
            expect(control).toMatchObject({
                executionState: 'queued',
                sourceNoteId: copy.id,
            });
            expect(await worker.markDispatched(active.lease, context())).toBe(
                'lost',
            );
        });
        it('publishes private exercises under the deployment worker role and denies sheet editing', async () => {
            await free.next(source, request(), context());
            const role = `knowledge_sentence_worker_${randomUUID().replaceAll('-', '')}`;
            await client.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
            try {
                const raw = await readFile(
                    new URL(
                        '../../../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                        import.meta.url,
                    ),
                    'utf8',
                );
                await client.unsafe(
                    raw
                        .split('\n')
                        .filter((line) => !line.startsWith('\\'))
                        .join('\n')
                        .replaceAll(':"dictionary_worker_role"', `"${role}"`),
                );
                const restricted = Object.create(db) as SentenceDatabase;
                restricted.transaction = async (callback) =>
                    db.transaction(async (tx) => {
                        await tx.execute(sql.raw(`SET LOCAL ROLE "${role}"`));
                        return callback(tx);
                    });
                worker = new DrizzleSentenceWorkerStore(restricted);
                const job = await claim();
                if (!job || job.kind !== 'sentence-generation')
                    throw new Error('Expected restricted worker claim');
                const entry = job.input.candidates[0]!;
                expect(await worker.markDispatched(job.lease, context())).toBe(
                    'dispatch',
                );
                const content = validateSentenceGeneration(job.input, {
                    sourceText: 'The cat sleeps.',
                    referenceTranslation: 'El gato duerme.',
                    segments: [
                        { text: 'The ', entryId: null },
                        { text: 'cat', entryId: entry.entryId },
                        { text: ' sleeps.', entryId: null },
                    ],
                    targets: [
                        {
                            entryId: entry.entryId,
                            normalizedHint: 'gato',
                            hintForm: 'lemma',
                        },
                    ],
                });
                for (const table of [
                    'knowledge_sentence_exercises',
                    'knowledge_sentence_attempts',
                    'knowledge_sentence_exposures',
                ]) {
                    await expect(
                        restricted.transaction((tx) =>
                            tx.execute(
                                sql.raw(`select * from public.${table}`),
                            ),
                        ),
                    ).rejects.toMatchObject({ cause: { code: '42501' } });
                    await expect(
                        restricted.transaction((tx) =>
                            tx.execute(
                                sql.raw(
                                    `insert into public.${table} default values`,
                                ),
                            ),
                        ),
                    ).rejects.toMatchObject({ cause: { code: '42501' } });
                }
                const publish = (
                    jobId: string,
                    workerId: string,
                    fence: number | string,
                    output: unknown,
                    capability = job.lease.capability,
                ) =>
                    restricted.transaction(async (tx) => {
                        await tx.execute(
                            sql`select public.languon_read_private_sentence_job(${jobId}::uuid,${workerId},${fence}::bigint,${capability ?? 'invalid-capability'})`,
                        );
                        return tx.execute(
                            sql`select public.languon_publish_knowledge_sentence_generation(${jobId}::uuid,${workerId},${fence}::bigint,${JSON.stringify(output)}::jsonb)`,
                        );
                    });
                await expect(
                    restricted.transaction((tx) =>
                        tx.execute(
                            sql`select public.languon_publish_knowledge_sentence_generation(${job.lease.jobId}::uuid,${job.lease.workerId},${job.lease.fencingToken}::bigint,${JSON.stringify(content)}::jsonb)`,
                        ),
                    ),
                ).rejects.toMatchObject({ cause: { code: '23514' } });
                for (const query of [
                    sql`select input_payload,knowledge_source,source_exercise_id from sentence_ai_jobs where id=${job.lease.jobId}::uuid`,
                    sql`select * from knowledge_sentence_worker_leases`,
                    sql`select * from knowledge_sentence_job_sources`,
                    sql`insert into knowledge_sentence_job_sources default values`,
                    sql`update knowledge_sentence_job_sources set actor_id=${owner}::uuid where job_id=${job.lease.jobId}::uuid`,
                    sql`delete from knowledge_sentence_job_sources where job_id=${job.lease.jobId}::uuid`,
                    sql`update sentence_ai_jobs set input_payload='{}'::jsonb where id=${job.lease.jobId}::uuid`,
                    sql`update sentence_ai_jobs set source_kind='dictionary' where id=${job.lease.jobId}::uuid`,
                    sql`update sentence_ai_jobs set result_knowledge_exercise_id=${randomUUID()}::uuid where id=${job.lease.jobId}::uuid`,
                    sql`update sentence_ai_jobs set execution_state='cancelled',completed_at=now(),worker_id=null,lease_deadline=null,heartbeat_at=null where id=${job.lease.jobId}::uuid`,
                ])
                    await expect(
                        restricted.transaction((tx) => tx.execute(query)),
                    ).rejects.toMatchObject({ cause: { code: '42501' } });
                const queue = await restricted.transaction((tx) =>
                    tx.execute(
                        sql`select input_payload,knowledge_source,source_exercise_id,source_note_id,operation_id,session_id,request_fingerprint,authority from sentence_worker_jobs where id=${job.lease.jobId}::uuid`,
                    ),
                );
                expect(queue).toEqual([
                    {
                        input_payload: null,
                        knowledge_source: null,
                        source_exercise_id: null,
                        source_note_id: null,
                        operation_id: null,
                        session_id: null,
                        request_fingerprint: null,
                        authority: { kind: 'owner' },
                    },
                ]);
                const [guessed] = await restricted.transaction((tx) =>
                    tx.execute(
                        sql`select public.languon_read_private_sentence_job(${job.lease.jobId}::uuid,${job.lease.workerId},${job.lease.fencingToken}::bigint,${'0'.repeat(72)}) as value`,
                    ),
                );
                expect(guessed?.value).toBeNull();
                await expect(
                    restricted.transaction(async (tx) => {
                        await tx.execute(
                            sql`select public.languon_read_private_sentence_job(${job.lease.jobId}::uuid,${job.lease.workerId},${job.lease.fencingToken}::bigint,${job.lease.capability ?? 'invalid'})`,
                        );
                        return tx.execute(
                            sql`update sentence_ai_jobs set provider_actual_cost_micros=123456 where id=${job.lease.jobId}::uuid`,
                        );
                    }),
                ).rejects.toMatchObject({ cause: { code: '42501' } });

                await expect(
                    publish(
                        job.lease.jobId,
                        'foreign-worker',
                        job.lease.fencingToken,
                        content,
                    ),
                ).rejects.toMatchObject({ cause: { code: '23514' } });
                await expect(
                    publish(
                        job.lease.jobId,
                        job.lease.workerId,
                        String(BigInt(job.lease.fencingToken) + 1n),
                        content,
                    ),
                ).rejects.toMatchObject({ cause: { code: '23514' } });
                await expect(
                    publish(
                        job.lease.jobId,
                        job.lease.workerId,
                        job.lease.fencingToken,
                        {
                            ...content,
                            targets: [
                                {
                                    ...content.targets[0],
                                    sourceText:
                                        'substituted private vocabulary',
                                },
                            ],
                        },
                    ),
                ).rejects.toMatchObject({ cause: { code: '23514' } });
                const copied = await knowledge.copyShared(
                    reader,
                    source.access.locator,
                    source.access.key,
                    { operationId: randomUUID(), expectedVersion: 1 },
                );
                const copiedVocabulary =
                    copied.body.document.content?.[0]?.attrs?.block;
                if (copiedVocabulary?.type !== 'vocabulary')
                    throw new Error('Expected independently copied source');
                await free.next(
                    {
                        actorId: reader,
                        noteId: copied.id,
                        blockId: copiedVocabulary.id,
                    },
                    request(),
                    context(),
                );
                const foreign = await worker.claimNext(
                    {
                        workerId: 'other-sentence-worker',
                        supportedFormats: ['sentence-generation:v1'],
                        learningExecutionRevision: 1,
                        textAiSelectionRevision: 1,
                        creditSettlementRevision: 1,
                        leaseMs: 60_000,
                        globalConcurrency: 10,
                        learnerConcurrency: 2,
                    },
                    context(),
                );
                if (!foreign || foreign.kind !== 'sentence-generation')
                    throw new Error('Expected second real worker lease');
                expect(
                    await worker.markDispatched(foreign.lease, context()),
                ).toBe('dispatch');
                await expect(
                    publish(
                        foreign.lease.jobId,
                        job.lease.workerId,
                        job.lease.fencingToken,
                        content,
                    ),
                ).rejects.toMatchObject({ cause: { code: '23514' } });
                await expect(
                    publish(
                        foreign.lease.jobId,
                        foreign.lease.workerId,
                        foreign.lease.fencingToken,
                        content,
                        foreign.lease.capability,
                    ),
                ).rejects.toMatchObject({ cause: { code: '23514' } });
                for (const malformed of [
                    {
                        ...content,
                        segments: [
                            {
                                ...content.segments[0],
                                text: { unexpected: 'object' },
                            },
                        ],
                    },
                    {
                        ...content,
                        segments: [{ ...content.segments[0], start: -1 }],
                    },
                    {
                        ...content,
                        hints: [
                            {
                                ...content.hints[0],
                                text: '',
                                kind: 'unsupported',
                            },
                        ],
                    },
                    {
                        ...content,
                        hints: [
                            {
                                ...content.hints[0],
                                extra: 'not a contract field',
                            },
                        ],
                    },
                ])
                    await expect(
                        publish(
                            job.lease.jobId,
                            job.lease.workerId,
                            job.lease.fencingToken,
                            malformed,
                        ),
                    ).rejects.toMatchObject({ cause: { code: '23514' } });
                // A valid typed publisher alone cannot commit history while finances and
                // the job remain active. The deferred constraint rolls back its row.
                await expect(
                    publish(
                        job.lease.jobId,
                        job.lease.workerId,
                        job.lease.fencingToken,
                        content,
                    ),
                ).rejects.toMatchObject({ code: '23514' });
                const [unpublished] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, job.lease.jobId));
                expect(unpublished?.resultKnowledgeExerciseId).toBeNull();
                expect(
                    await worker.completeGeneration(
                        job.lease,
                        {
                            content,
                            usage: { inputTokens: 100, outputTokens: 20 },
                        },
                        context(),
                    ),
                ).toBe('committed');
                const result = await paid.getJob(
                    source,
                    job.lease.jobId,
                    context(),
                );
                expect(result.result?.kind).toBe('exercise');
                await expect(
                    publish(
                        job.lease.jobId,
                        job.lease.workerId,
                        job.lease.fencingToken,
                        content,
                    ),
                ).rejects.toMatchObject({ cause: { code: '23514' } });
                if (result.result?.kind !== 'exercise')
                    throw new Error('Expected private exercise');
                const [terminalGeneration] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, job.lease.jobId));
                expect(terminalGeneration).toMatchObject({
                    inputPayload: null,
                    knowledgeSource: null,
                    sourceExerciseId: null,
                });
                expect(
                    await restricted.transaction((tx) =>
                        tx.execute(
                            sql`select id from sentence_worker_jobs where id=${job.lease.jobId}::uuid`,
                        ),
                    ),
                ).toHaveLength(0);
                const [replayedRead] = await restricted.transaction((tx) =>
                    tx.execute(
                        sql`select public.languon_read_private_sentence_job(${job.lease.jobId}::uuid,${job.lease.workerId},${job.lease.fencingToken}::bigint,${job.lease.capability ?? 'invalid'}) as value`,
                    ),
                );
                expect(replayedRead?.value).toBeNull();

                const checkRequest = {
                    operationId: randomUUID(),
                    sessionId: randomUUID(),
                    answer: '🙂 El gato está durmiendo.',
                    explanationLanguage: 'en' as const,
                    revealedHintIds: [],
                };
                const checkJob = await paid.enqueueCheck(
                    source,
                    result.result.exercise.id,
                    checkRequest,
                    context(),
                );
                const checking = await claim();
                if (!checking || checking.kind !== 'sentence-check')
                    throw new Error('Expected restricted check');
                expect(
                    await worker.markDispatched(checking.lease, context()),
                ).toBe('dispatch');
                const feedback = validateSentenceCheck(checking.input, {
                    proposedPercentage: 99,
                    meaning: 'correct',
                    grammar: 'minor-errors',
                    targets: checking.input.targets.map((target) => ({
                        entryId: target.entryId,
                        status: 'used',
                        explanation: 'A valid alternative.',
                    })),
                    issues: [
                        {
                            kind: 'grammar',
                            severity: 'minor',
                            span: { start: 3, end: 5, quote: 'El' },
                            explanation:
                                'Synthetic grammar feedback with a supplementary-character prefix.',
                            correction: 'El',
                        },
                    ],
                    improvedTranslation: checking.input.answer,
                    explanation: 'Preserves the meaning.',
                });
                await expect(
                    restricted.transaction(async (tx) => {
                        await tx.execute(
                            sql`select public.languon_read_private_sentence_job(${checking.lease.jobId}::uuid,${checking.lease.workerId},${checking.lease.fencingToken}::bigint,${checking.lease.capability ?? 'invalid'})`,
                        );
                        return tx.execute(
                            sql`select public.languon_publish_knowledge_sentence_check(${checking.lease.jobId}::uuid,${checking.lease.workerId},${checking.lease.fencingToken}::bigint,${JSON.stringify({ ...feedback, targets: [{ ...feedback.targets[0], entryId: randomUUID() }] })}::jsonb)`,
                        );
                    }),
                ).rejects.toMatchObject({ cause: { code: '23514' } });
                for (const malformed of [
                    { ...feedback, percentage: 101 },
                    {
                        ...feedback,
                        issues: [
                            {
                                id: 'issue-1',
                                kind: 'grammar',
                                severity: 'minor',
                                span: {
                                    start: 0,
                                    end: 1,
                                    quote: 'wrong passage',
                                },
                                explanation: 'Incorrect offset.',
                                correction: null,
                            },
                        ],
                    },
                    {
                        ...feedback,
                        targets: [
                            {
                                ...feedback.targets[0],
                                explanation: { unexpected: 'object' },
                            },
                        ],
                    },
                    { ...feedback, unexpected: 'not a contract field' },
                ])
                    await expect(
                        restricted.transaction(async (tx) => {
                            await tx.execute(
                                sql`select public.languon_read_private_sentence_job(${checking.lease.jobId}::uuid,${checking.lease.workerId},${checking.lease.fencingToken}::bigint,${checking.lease.capability ?? 'invalid'})`,
                            );
                            return tx.execute(
                                sql`select public.languon_publish_knowledge_sentence_check(${checking.lease.jobId}::uuid,${checking.lease.workerId},${checking.lease.fencingToken}::bigint,${JSON.stringify(malformed)}::jsonb)`,
                            );
                        }),
                    ).rejects.toMatchObject({ cause: { code: '23514' } });
                expect(
                    await worker.completeCheck(
                        checking.lease,
                        {
                            feedback,
                            usage: { inputTokens: 100, outputTokens: 20 },
                        },
                        context(),
                    ),
                ).toBe('committed');
                const checked = await paid.getJob(
                    source,
                    checkJob.id,
                    context(),
                );
                expect(checked.result).toMatchObject({
                    kind: 'attempt',
                    attempt: {
                        answer: checkRequest.answer,
                        explanationLanguage: checkRequest.explanationLanguage,
                        revealedHintIds: checkRequest.revealedHintIds,
                        sessionId: checkRequest.sessionId,
                    },
                });
                const [checkFinancial] = await db
                    .select()
                    .from(actions)
                    .where(eq(actions.id, checkJob.id));
                expect(checkFinancial).toMatchObject({
                    state: 'settled',
                    outcome: 'success',
                    ownerId: reader,
                });
                const [terminalCheck] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, checkJob.id));
                expect(terminalCheck).toMatchObject({
                    inputPayload: null,
                    knowledgeSource: null,
                    sourceExerciseId: null,
                });
                expect(
                    await restricted.transaction((tx) =>
                        tx.execute(
                            sql`select id from sentence_worker_jobs where id=${checkJob.id}::uuid`,
                        ),
                    ),
                ).toHaveLength(0);
                // Shutdown cannot reconstruct the private secret from public worker IDs;
                // the existing bounded lease expiry performs conservative recovery.
                await worker.releaseWorkerLeases(
                    foreign.lease.workerId,
                    context(),
                );
                const [beforeExpiry] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, foreign.lease.jobId));
                expect(beforeExpiry?.executionState).toBe('running');
                await db
                    .update(jobs)
                    .set({ leaseDeadline: new Date(Date.now() - 1000) })
                    .where(eq(jobs.id, foreign.lease.jobId));
                const [expiredRead] = await restricted.transaction((tx) =>
                    tx.execute(
                        sql`select public.languon_read_private_sentence_job(${foreign.lease.jobId}::uuid,${foreign.lease.workerId},${foreign.lease.fencingToken}::bigint,${foreign.lease.capability ?? 'invalid'}) as value`,
                    ),
                );
                expect(expiredRead?.value).toBeNull();
                await expect(
                    restricted.transaction(async (tx) => {
                        await tx.execute(
                            sql`select public.languon_recover_private_sentence_job(${foreign.lease.jobId}::uuid)`,
                        );
                        return tx.execute(
                            sql`update sentence_ai_jobs set provider_actual_cost_micros=123456 where id=${foreign.lease.jobId}::uuid`,
                        );
                    }),
                ).rejects.toMatchObject({ cause: { code: '42501' } });
                expect(await claim()).toBeNull();
                const [recovered] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, foreign.lease.jobId));
                expect(recovered).toMatchObject({
                    executionState: 'failed',
                    failureCategory: 'provider_timeout',
                    inputPayload: null,
                    knowledgeSource: null,
                    sourceExerciseId: null,
                });
                const [recoveryFinancial] = await db
                    .select()
                    .from(actions)
                    .where(eq(actions.id, foreign.lease.jobId));
                expect(recoveryFinancial).toMatchObject({
                    state: 'settled',
                    outcome: 'failure',
                    chargedMilli: 0n,
                });

                await expect(
                    restricted.transaction((tx) =>
                        tx.execute(
                            sql`update knowledge_notes set title='unauthorized' where id=${noteId}::uuid`,
                        ),
                    ),
                ).rejects.toMatchObject({ cause: { code: '42501' } });
            } finally {
                await client.unsafe(`DROP OWNED BY "${role}"`);
                await client.unsafe(`DROP ROLE "${role}"`);
            }
        });
    },
);
