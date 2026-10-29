import { knowledgeLearnerAttemptsTable } from './learner-schema';
import { DrizzleLearnerStore } from './learner-store';
import { DrizzleKnowledgeExerciseEvaluationStore } from './exercise-evaluation-store';
import {
    KnowledgeNoteContentSchema,
    type KnowledgeExerciseEvaluationJob,
} from '@languon/contracts';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
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
import { and, eq, sql } from 'drizzle-orm';
import {
    RequestKnowledgeBlockFieldActionSchema,
    type RequestKnowledgeBlockFieldAction,
} from '@languon/contracts';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { seedLegacyActionFixture } from '../../../../../../tests/support/legacy-action-fixture';
import {
    fixtureRouteFingerprint,
    seedTextAiRoutingFixture,
    textAiFixtureCredentials,
} from '../../../../../../tests/support/text-ai-routing-fixture';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    aiCreditActionsTable as actions,
    aiCreditActionAttemptsTable as attempts,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { capabilityPolicyRevisionsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import {
    ActionAllowanceConfirmationRequired,
    withActionAllowanceConsent,
} from '../../../../ai-credits/infrastructure/action-allowance-consent';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleTextAiAdmissionParticipant } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import {
    defaultTextAiProviderBudgetPolicy as budget,
    textAiModelCatalog,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textsExecutionObservationId } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { createTextAiProviderRuntime } from '../../../../../infrastructure/text-ai/provider-runtime';
import { createTextsAiProvider } from '../../../../texts/infrastructure/ai/texts-ai-provider';
import { TextsWorkerService } from '../../../../texts/application/texts-worker-service';
import { DrizzleTextsJobStore } from '../../../../texts/infrastructure/persistence/drizzle/drizzle-texts-job-store';
import { textsAiJobsTable as jobs } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-schema';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleKnowledgeBlockFieldStore } from './block-field-store';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { eraseKnowledgeTranslationJobs } from './private-translation-lifecycle';
import { knowledgeNotesTable, knowledgeWorkingBranchesTable } from './schema';

describe.runIf(isDatabaseIntegrationEnabled())(
    'knowledge atomic field actions through production Texts execution',
    () => {
        let client: PostgresClient;
        let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
        let owner: string, noteId: string, branchId: string, now: Date;
        let store: DrizzleTextsJobStore,
            fields: DrizzleKnowledgeBlockFieldStore;
        const context = () => ({
            now: new Date(),
            signal: new AbortController().signal,
        });
        const input = (): RequestKnowledgeBlockFieldAction => ({
            operationId: randomUUID(),
            branchId,
            blockId: randomUUID(),
            action: 'generate',
            field: {
                kind: 'vocabulary',
                entryId: randomUUID(),
                field: 'translation',
                sourceLanguage: 'fr',
                targetLanguage: 'ru',
                sourceText: 'travail',
                currentValue: '',
            },
        });
        const request = async (value = input()) => {
            try {
                return await fields.request(owner, noteId, value, context());
            } catch (error) {
                if (!(error instanceof ActionAllowanceConfirmationRequired))
                    throw error;
                return withActionAllowanceConsent(error.quote.id, () =>
                    fields.request(owner, noteId, value, context()),
                );
            }
        };

        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            now = new Date();
            owner = randomUUID();
            await db.insert(usersTable).values({ id: owner, status: 'active' });
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
            const model = textAiModelCatalog[0]!,
                revisionId = randomUUID();
            await db.insert(dictionaryAiConfigurationRevisionsTable).values({
                id: revisionId,
                version: 1,
                createdByUserId: owner,
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
                    'block-field-test',
                    model.providerId,
                    model.id,
                ),
                workerId: 'block-field-test',
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
                message: 'synthetic',
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 3_600_000),
            });
            await seedLegacyActionFixture(db);
            store = new DrizzleTextsJobStore(db, {
                fingerprintSecret: 'synthetic-field-actions',
                resolveExecution: (tx, userId, format, at) =>
                    new DrizzleTextAiAdmissionParticipant(tx, {
                        routingEnabled: true,
                        routeFingerprint: fixtureRouteFingerprint,
                        credentialConfigured: () => true,
                    }).resolve({
                        userId,
                        format,
                        now: at,
                        legacyBudget: budget,
                        requiredWorkerFormat: format,
                    }),
            });
            fields = new DrizzleKnowledgeBlockFieldStore(
                store.knowledgeActionPersistence(),
            );
            const workspace = await new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                new KnowledgeShareCrypto('synthetic-block-field-source'),
            ).createDraft(owner, { operationId: randomUUID() });
            noteId = workspace.noteId;
            branchId = workspace.preferredBranchId;
        }, 120_000);
        afterEach(() => vi.unstubAllGlobals());
        afterAll(async () => client?.end());

        async function executeWorker(
            jobId: string,
            payload: unknown,
            restricted = false,
            fail = false,
            onProviderRequest?: () => Promise<void>,
        ) {
            let role: string | undefined;
            let workerDatabase = db;
            if (restricted) {
                role = `field_worker_${randomUUID().replaceAll('-', '')}`;
                await client.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
                const grants = await readFile(
                    new URL(
                        '../../../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                        import.meta.url,
                    ),
                    'utf8',
                );
                await client.unsafe(
                    grants
                        .split('\n')
                        .filter((line) => !line.startsWith('\\'))
                        .join('\n')
                        .replaceAll(':"dictionary_worker_role"', `"${role}"`),
                );
                const withRole = async <T>(
                    callback: Parameters<typeof db.transaction<T>>[0],
                ) =>
                    db.transaction(async (tx) => {
                        await tx.execute(sql.raw(`SET LOCAL ROLE "${role}"`));
                        return callback(tx);
                    });
                workerDatabase = new Proxy(db, {
                    get(target, key) {
                        if (key === 'transaction') return withRole;
                        if (key === 'execute')
                            return (query: Parameters<typeof db.execute>[0]) =>
                                withRole((tx) => tx.execute(query));
                        return Reflect.get(target, key);
                    },
                });
                await expect(
                    workerDatabase.execute(
                        sql`update knowledge_notes set title='forged' where id=${noteId}::uuid`,
                    ),
                ).rejects.toMatchObject({ cause: { code: '42501' } });
                await expect(
                    workerDatabase.execute(
                        sql`select result from knowledge_learner_attempts`,
                    ),
                ).rejects.toMatchObject({ cause: { code: '42501' } });
                await expect(
                    workerDatabase.execute(
                        sql`update knowledge_learner_attempts set result='{}'::jsonb where actor_id=${owner}::uuid`,
                    ),
                ).rejects.toMatchObject({ cause: { code: '42501' } });
            }
            const outgoing: Record<string, unknown>[] = [];
            const http: typeof fetch = async (request, init) => {
                const incoming = new Request(request, init),
                    url = new URL(incoming.url);
                if (
                    url.origin !== 'https://api.deepseek.com' ||
                    url.pathname !== '/chat/completions' ||
                    incoming.method !== 'POST'
                )
                    throw new Error('Unexpected provider HTTP request.');
                const body = (await incoming.json()) as Record<string, unknown>;
                outgoing.push(body);
                await onProviderRequest?.();
                if (fail)
                    return Response.json(
                        { error: { message: 'synthetic provider failure' } },
                        { status: 400 },
                    );
                return Response.json({
                    id: 'synthetic-field-answer',
                    object: 'chat.completion',
                    created: 1,
                    model: body.model,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: JSON.stringify(payload),
                            },
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 100,
                        completion_tokens: 20,
                        total_tokens: 120,
                    },
                });
            };
            vi.stubGlobal('fetch', http);
            const completionErrors: string[] = [];
            const productionStore = new DrizzleTextsJobStore(workerDatabase);
            const workerStore = new Proxy(productionStore, {
                get(target, key) {
                    if (key === 'complete')
                        return async (
                            ...args: Parameters<
                                DrizzleTextsJobStore['complete']
                            >
                        ) => {
                            try {
                                return await target.complete(...args);
                            } catch (error) {
                                const cause =
                                    error &&
                                    typeof error === 'object' &&
                                    'cause' in error
                                        ? error.cause
                                        : error;
                                completionErrors.push(
                                    cause instanceof Error
                                        ? cause.message
                                        : String(cause),
                                );
                                throw error;
                            }
                        };
                    const member = Reflect.get(target, key);
                    return typeof member === 'function'
                        ? member.bind(target)
                        : member;
                },
            });
            const worker = new TextsWorkerService({
                store: workerStore,
                provider: createTextsAiProvider({
                    credentials: textAiFixtureCredentials,
                    fetchProvider: http,
                    runtime: createTextAiProviderRuntime(
                        workerDatabase,
                        textAiFixtureCredentials,
                    ),
                }),
                clock: { now: () => new Date() },
                workerId: 'block-field-test',
                leaseMs: 10_000,
                heartbeatMs: 1_000,
                timeoutMs: 10_000,
                globalConcurrency: 10,
                userConcurrency: 5,
                maxAttempts: 2,
                retryDelayMs: 100,
                supportedFormats: ['text-translation:v4'],
            });
            try {
                // Claim-time budget/source finalization can finish a queued job without a provider call.
                await worker.processNext(context().signal);
            } finally {
                if (role) {
                    await client.unsafe(`DROP OWNED BY "${role}"`);
                    await client.unsafe(`DROP ROLE "${role}"`);
                }
            }
            if (completionErrors.length)
                throw new Error(
                    `Completion failed: ${completionErrors.join('; ')}`,
                );
            return { outgoing };
        }
        async function execute(
            jobId: string,
            payload: unknown,
            restricted = false,
            fail = false,
        ) {
            const { outgoing } = await executeWorker(
                jobId,
                payload,
                restricted,
                fail,
            );
            const result = await fields.get(owner, noteId, jobId, context());
            return { outgoing, result };
        }
        async function evaluationFixture(actorId = owner) {
            const crypto = new KnowledgeShareCrypto(
                'synthetic-block-field-source',
            );
            const notes = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            const note = await notes.create(owner, {
                operationId: randomUUID(),
                content: KnowledgeNoteContentSchema.parse({
                    title: 'Private inline practice',
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
                                            id: randomUUID(),
                                            type: 'exercise',
                                            format: 'free-text',
                                            question:
                                                'Translate: I clean the house.',
                                            referenceAnswer:
                                                'Je fais le ménage.',
                                            explanation:
                                                'Faire le ménage means cleaning the house.',
                                        },
                                    },
                                },
                            ],
                        },
                    },
                }),
            });
            noteId = note.id;
            const learners = new DrizzleLearnerStore(db, crypto);
            const share =
                actorId === owner
                    ? undefined
                    : {
                          kind: 'note' as const,
                          ...(await notes.issueShare(owner, noteId)),
                      };
            const state = await learners.read(actorId, noteId, share);
            const target = state.exerciseRevisions[0]!;
            const attempt = await learners.attempt(
                actorId,
                noteId,
                {
                    id: randomUUID(),
                    noteVersion: note.version,
                    exerciseId: target.exerciseId,
                    exerciseRevision: target.revision,
                    answer: {
                        format: 'free-text',
                        text: 'Je nettoie la maison.',
                    },
                },
                share,
            );
            const evaluations = new DrizzleKnowledgeExerciseEvaluationStore(
                store.knowledgeActionPersistence(),
                crypto,
            );
            const requestEvaluation = async (
                operationId = randomUUID(),
            ): Promise<KnowledgeExerciseEvaluationJob> => {
                const input = {
                    operationId,
                    attemptId: attempt.id,
                    replyLanguage: 'en' as const,
                };
                try {
                    return await evaluations.request(
                        actorId,
                        noteId,
                        input,
                        context(),
                        share,
                    );
                } catch (error) {
                    if (!(error instanceof ActionAllowanceConfirmationRequired))
                        throw error;
                    return withActionAllowanceConsent(error.quote.id, () =>
                        evaluations.request(
                            actorId,
                            noteId,
                            input,
                            context(),
                            share,
                        ),
                    );
                }
            };
            return {
                evaluations,
                requestEvaluation,
                learners,
                notes,
                share,
                attempt,
            };
        }

        it.each([false, true])(
            'evaluates a private saved attempt through the real SDK and fenced publication (restricted=%s)',
            async (restricted) => {
                const fixture = await evaluationFixture();
                const operationId = randomUUID();
                const job = await fixture.requestEvaluation(operationId);
                expect((await fixture.requestEvaluation(operationId)).id).toBe(
                    job.id,
                );
                const { outgoing } = await executeWorker(
                    job.id,
                    {
                        status: 'correct',
                        feedback: 'This is also a natural French translation.',
                        validAlternative: true,
                    },
                    restricted,
                );
                const result = await fixture.evaluations.get(
                    owner,
                    noteId,
                    job.id,
                    context(),
                );
                expect(result.status, result.failureCode ?? undefined).toBe(
                    'completed',
                );
                expect(result.attempt?.id).toBe(fixture.attempt.id);
                expect(result.attempt?.evaluation).toMatchObject({
                    status: 'correct',
                    method: 'ai',
                    validAlternative: true,
                });
                expect(outgoing).toHaveLength(1);
                expect(outgoing[0]?.model).toBe('deepseek-flash');
                const [attempt] = await db
                    .select()
                    .from(attempts)
                    .where(eq(attempts.actionId, job.id));
                expect(attempt?.state).toBe('settled');
                expect(outgoing[0]?.max_tokens).toBe(attempt?.outputLimit);
                expect(result.billing?.state).toBe('charged');
                const [saved] = await db
                    .select()
                    .from(knowledgeNotesTable)
                    .where(eq(knowledgeNotesTable.id, noteId));
                expect(JSON.stringify(saved?.body)).not.toContain(
                    'Je nettoie la maison',
                );
                expect(
                    (await fixture.learners.read(owner, noteId)).attempts[0]
                        ?.evaluation,
                ).toMatchObject({ validAlternative: true });
                await expect(
                    store.get(owner, job.id, context()),
                ).rejects.toMatchObject({ code: 'generation_job_not_found' });
            },
            30_000,
        );
        it('isolates shared-reader evaluations and denies reads after access is revoked', async () => {
            const reader = randomUUID();
            await db
                .insert(usersTable)
                .values({ id: reader, status: 'active' });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: reader,
                    amount: 1_000_000_000n,
                    createdAt: now,
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );
            const fixture = await evaluationFixture(reader);
            const job = await fixture.requestEvaluation();
            const { outgoing } = await executeWorker(
                job.id,
                {
                    status: 'correct',
                    feedback: 'Valid alternative.',
                    validAlternative: true,
                },
                true,
            );
            const result = await fixture.evaluations.get(
                reader,
                noteId,
                job.id,
                context(),
                fixture.share,
            );
            expect(result.status, result.failureCode ?? undefined).toBe(
                'completed',
            );
            expect(outgoing).toHaveLength(1);
            await expect(
                fixture.evaluations.get(owner, noteId, job.id, context()),
            ).rejects.toMatchObject({ code: 'generation_job_not_found' });
            expect(
                (await fixture.learners.read(owner, noteId)).attempts,
            ).toHaveLength(0);
            await fixture.notes.revokeShare(owner, noteId);
            await expect(
                fixture.evaluations.get(
                    reader,
                    noteId,
                    job.id,
                    context(),
                    fixture.share,
                ),
            ).rejects.toBeDefined();
        }, 30_000);
        it('cancels queued exercise checking without modifying the saved private answer or charging a provider', async () => {
            const fixture = await evaluationFixture();
            const job = await fixture.requestEvaluation();
            const cancelled = await fixture.evaluations.cancel(
                owner,
                noteId,
                job.id,
                context(),
            );
            expect(cancelled.status).toBe('cancelled');
            expect(cancelled.result).toBeNull();
            expect(
                (await fixture.learners.read(owner, noteId)).attempts[0]
                    ?.evaluation,
            ).toEqual({ status: 'unchecked' });
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(action?.state).not.toBe('active');
            expect(cancelled.billing?.chargedCredits).toBe('0');
        }, 30_000);

        it.each([false, true])(
            'persists usable field suggestion through real SDK and settlement (restricted=%s)',
            async (restricted) => {
                if (!restricted) await seedLegacyActionFixture(db, '200');
                const job = await request();
                const { outgoing, result } = await execute(
                    job.id,
                    {
                        status: 'suggested',
                        proposedValue: 'работа',
                        explanation: 'The French noun means work.',
                    },
                    restricted,
                );
                expect(result.status, result.failureCode ?? undefined).toBe(
                    'completed',
                );
                expect(result.result).toMatchObject({
                    proposedValue: 'работа',
                });
                expect(outgoing).toHaveLength(1);
                expect(outgoing[0]?.model).toBe('deepseek-flash');
                const [attempt] = await db
                    .select()
                    .from(attempts)
                    .where(eq(attempts.actionId, job.id));
                const [row] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, job.id));
                expect(outgoing[0]?.max_tokens).toBe(
                    Math.min(
                        attempt!.outputLimit,
                        row!.selectedExecutionSnapshot.perCallMaxOutputTokens,
                    ),
                );
                if (restricted)
                    expect(Number(outgoing[0]?.max_tokens)).toBeLessThan(8192);
                else expect(outgoing[0]?.max_tokens).toBe(8192);
                expect(attempt?.state).toBe('settled');
                expect(result.billing?.state).toBe('charged');
                const [note] = await db
                    .select()
                    .from(knowledgeNotesTable)
                    .where(eq(knowledgeNotesTable.id, noteId));
                expect(note?.status).toBe('draft');
                expect(JSON.stringify(note?.body)).not.toContain('работа');
                await expect(
                    store.get(owner, job.id, context()),
                ).rejects.toMatchObject({ code: 'generation_job_not_found' });
            },
            30_000,
        );

        it.each(['generate', 'check'] as const)(
            'runs a bilingual-text field %s through the real bounded worker',
            async (action) => {
                const value = input();
                value.action = action;
                value.field = {
                    kind: 'bilingual-text',
                    segmentId: randomUUID(),
                    sourceLanguage: 'fr',
                    targetLanguage: 'ru',
                    sourceText: 'Je fais le ménage.',
                    currentValue: action === 'check' ? 'Я убираюсь.' : '',
                };
                const job = await request(value);
                const prepared =
                    action === 'check'
                        ? {
                              status: 'correct',
                              explanation: 'The meaning is preserved.',
                          }
                        : {
                              status: 'suggested',
                              proposedValue: 'Я убираюсь.',
                              explanation: 'A natural Russian translation.',
                          };
                const { outgoing, result } = await execute(job.id, prepared);
                expect(outgoing).toHaveLength(1);
                expect(result.status, result.failureCode ?? undefined).toBe(
                    'completed',
                );
                expect(result.result).toMatchObject(prepared);
                expect(result.billing?.state).toBe('charged');
            },
            30_000,
        );

        it.each(['material change', 'share revoked'] as const)(
            'rejects dispatched exercise feedback after %s without learner charge or publication',
            async (change) => {
                const actorId =
                    change === 'share revoked' ? randomUUID() : owner;
                if (actorId !== owner) {
                    await db
                        .insert(usersTable)
                        .values({ id: actorId, status: 'active' });
                    await db.transaction((tx) =>
                        new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).issueGrant({
                            ownerId: actorId,
                            amount: 1_000_000_000n,
                            createdAt: now,
                            expiresAt: null,
                            source: 'admin',
                            sourceReference: randomUUID(),
                        }),
                    );
                }
                const fixture = await evaluationFixture(actorId);
                const job = await fixture.requestEvaluation();
                const { outgoing } = await executeWorker(
                    job.id,
                    {
                        status: 'correct',
                        feedback: 'Would otherwise accept this answer.',
                        validAlternative: true,
                    },
                    true,
                    false,
                    async () => {
                        const [dispatched] = await db
                            .select()
                            .from(attempts)
                            .where(eq(attempts.actionId, job.id));
                        expect(dispatched?.state).toBe('dispatched');
                        if (change === 'share revoked') {
                            await fixture.notes.revokeShare(owner, noteId);
                            return;
                        }
                        const saved = await fixture.notes.get(owner, noteId);
                        const updated = {
                            ...saved.body,
                            document: {
                                ...saved.body.document,
                                content: saved.body.document.content?.map(
                                    (node) =>
                                        node.attrs?.block?.type === 'exercise'
                                            ? {
                                                  ...node,
                                                  attrs: {
                                                      ...node.attrs,
                                                      block: {
                                                          ...node.attrs.block,
                                                          question:
                                                              'A different question now.',
                                                      },
                                                  },
                                              }
                                            : node,
                                ),
                            },
                        };
                        await fixture.notes.update(owner, noteId, {
                            operationId: randomUUID(),
                            expectedVersion: saved.version,
                            content: KnowledgeNoteContentSchema.parse({
                                title: saved.title,
                                summary: saved.summary,
                                categories: saved.categories,
                                studiedLanguage: saved.studiedLanguage,
                                explanationLanguage: saved.explanationLanguage,
                                body: updated,
                            }),
                        });
                    },
                );
                expect(outgoing).toHaveLength(1);
                const [raw] = await db
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, job.id));
                expect(raw?.executionState).toBe('failed');
                expect(raw?.resultPayload).toBeNull();
                const [action] = await db
                    .select()
                    .from(actions)
                    .where(eq(actions.id, job.id));
                expect(action?.state).toBe('settled');
                expect(action?.outcome).toBe('failure');
                expect(action?.chargedMilli).toBe(0n);
                const [attempt] = await db
                    .select()
                    .from(knowledgeLearnerAttemptsTable)
                    .where(
                        and(
                            eq(knowledgeLearnerAttemptsTable.actorId, actorId),
                            eq(
                                knowledgeLearnerAttemptsTable.id,
                                fixture.attempt.id,
                            ),
                        ),
                    );
                expect(attempt?.result.evaluation).toEqual({
                    status: 'unchecked',
                });
                await expect(
                    fixture.evaluations.get(
                        actorId,
                        noteId,
                        job.id,
                        context(),
                        fixture.share,
                    ),
                ).rejects.toBeDefined();
            },
            30_000,
        );

        it('supports operator-funded field checks without a customer tariff', async () => {
            await db.insert(capabilityPolicyRevisionsTable).values({
                id: randomUUID(),
                capability: 'text-translation',
                version: 1,
                funding: 'operator',
                createdAt: now,
                reason: 'Synthetic free field checks',
            });
            await seedTextAiRoutingFixture(db, {
                replace: true,
                omittedTariffFlows: ['text-translation'],
            });
            const value = input();
            value.action = 'check';
            value.field.currentValue = 'работа';
            const job = await request(value);
            const { result } = await execute(job.id, {
                status: 'correct',
                explanation: 'This is a valid translation.',
            });
            expect(result.status, result.failureCode ?? undefined).toBe(
                'completed',
            );
            expect(result.billing?.state).toBe('free');
        }, 30_000);

        it('keeps one job for idempotent retries and rejects foreign ownership or field changes', async () => {
            const value = input(),
                first = await request(value);
            expect((await request(value)).id).toBe(first.id);
            await expect(
                request({
                    ...value,
                    field: { ...value.field, sourceText: 'joie' },
                }),
            ).rejects.toMatchObject({ code: 'idempotency_conflict' });
            const other = randomUUID();
            await db.insert(usersTable).values({ id: other, status: 'active' });
            await expect(
                fields.get(other, noteId, first.id, context()),
            ).rejects.toMatchObject({ code: 'generation_job_not_found' });
            await expect(
                fields.request(
                    other,
                    noteId,
                    { ...value, operationId: randomUUID() },
                    context(),
                ),
            ).rejects.toMatchObject({ code: 'access_revoked' });
            expect(
                (await fields.cancel(owner, noteId, first.id, context()))
                    .status,
            ).toBe('cancelled');
        });

        it('rejects invalid generated output and releases the learner hold on technical failure', async () => {
            const job = await request();
            const invalid = {
                status: 'correct',
                explanation: 'Wrong result kind for generation.',
            };
            let { result } = await execute(job.id, invalid);
            // Conclusive structured-output rejection permits one bounded production retry.
            if (result.status === 'queued') {
                const [pending] = await db
                    .select({ nextAttemptAt: jobs.nextAttemptAt })
                    .from(jobs)
                    .where(eq(jobs.id, job.id));
                const waitMs =
                    Math.max(
                        0,
                        (pending?.nextAttemptAt?.getTime() ?? 0) - Date.now(),
                    ) + 25;
                expect(waitMs).toBeLessThan(10_000);
                await new Promise((resolve) => setTimeout(resolve, waitMs));
                ({ result } = await execute(job.id, invalid));
            }
            expect(result.status).toBe('failed');
            expect(result.result).toBeNull();
            expect(result.billing?.chargedCredits).toBe('0');
            const [action] = await db
                .select()
                .from(actions)
                .where(and(eq(actions.id, job.id), eq(actions.ownerId, owner)));
            expect(action?.state).not.toBe('active');
        }, 30_000);

        it('denies a field action after its branch is removed and still cleans it up with the note', async () => {
            const job = await request();
            await db
                .delete(knowledgeWorkingBranchesTable)
                .where(eq(knowledgeWorkingBranchesTable.id, branchId));
            await expect(
                fields.get(owner, noteId, job.id, context()),
            ).rejects.toMatchObject({ code: 'access_revoked' });
            await db.transaction(async (tx) => {
                await eraseKnowledgeTranslationJobs(tx, noteId, new Date());
                await tx
                    .delete(knowledgeNotesTable)
                    .where(eq(knowledgeNotesTable.id, noteId));
            });
            const [raw] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));
            expect(raw?.executionState).toBe('cancelled');
            expect(raw?.inputPayload).toBeNull();
            expect(raw?.resultPayload).toBeNull();
            const [action] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(action?.state).not.toBe('active');
        }, 30_000);

        it('erases source excerpts and cancels outstanding field actions before permanent deletion', async () => {
            const job = await request();
            await db.transaction(async (tx) => {
                await eraseKnowledgeTranslationJobs(tx, noteId, new Date());
                await tx
                    .delete(knowledgeNotesTable)
                    .where(eq(knowledgeNotesTable.id, noteId));
            });
            await expect(
                fields.get(owner, noteId, job.id, context()),
            ).rejects.toMatchObject({ code: 'generation_job_not_found' });
            const [row] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));
            expect(row?.inputPayload).toBeNull();
            expect(row?.resultPayload).toBeNull();
            expect(row?.executionState).toBe('cancelled');
        });
    },
);

describe('atomic field request boundaries', () => {
    const request = {
        operationId: randomUUID(),
        branchId: randomUUID(),
        blockId: randomUUID(),
        action: 'generate',
        field: {
            kind: 'vocabulary',
            entryId: randomUUID(),
            field: 'translation',
            sourceLanguage: 'fr',
            targetLanguage: 'ru',
            sourceText: 'travail',
            currentValue: '',
        },
    };
    it('permits generation of an empty draft field without permitting arbitrary paths', () => {
        expect(
            RequestKnowledgeBlockFieldActionSchema.safeParse(request).success,
        ).toBe(true);
        expect(
            RequestKnowledgeBlockFieldActionSchema.safeParse({
                ...request,
                field: { ...request.field, field: '__proto__' },
            }).success,
        ).toBe(false);
    });
    it('rejects empty checks, invalid Unicode and unexpected mutation data', () => {
        expect(
            RequestKnowledgeBlockFieldActionSchema.safeParse({
                ...request,
                action: 'check',
            }).success,
        ).toBe(false);
        expect(
            RequestKnowledgeBlockFieldActionSchema.safeParse({
                ...request,
                field: { ...request.field, sourceText: '\u0000' },
            }).success,
        ).toBe(false);
        expect(
            RequestKnowledgeBlockFieldActionSchema.safeParse({
                ...request,
                apply: true,
            }).success,
        ).toBe(false);
    });
});
