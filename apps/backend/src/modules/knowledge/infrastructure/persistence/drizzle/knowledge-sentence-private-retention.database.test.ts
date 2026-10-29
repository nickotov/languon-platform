import type { VocabularyPracticeActor } from '../../../application/vocabulary-practice-store';
import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { KnowledgeNoteContentSchema } from '@languon/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import { dictionaryAiConfigurationRevisionsTable as configurations } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { sentenceAiJobsTable as jobs } from '../../../../learning/infrastructure/persistence/drizzle/sentence-schema';
import { DrizzleSentenceWorkerStore } from '../../../../learning/infrastructure/persistence/drizzle/drizzle-sentence-worker-store';
import { validateSentenceGeneration } from '../../../../learning/domain/sentence-content';
import { DrizzleAccountPurgeStore } from '../../../../users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { accountDeletionRequestsTable } from '../../../../users/infrastructure/persistence/drizzle/account-deletion-schema';
import type { KnowledgeDatabase } from './knowledge-transaction';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { DrizzleKnowledgeSentencePaid } from './knowledge-sentence-paid';
import { DrizzleKnowledgeSentenceFreeStore } from './knowledge-sentence-free-store';
import { eraseKnowledgeSentenceJobs } from './knowledge-sentence-cleanup';
import { knowledgeSentenceJobSourcesTable as sources } from './knowledge-sentence-job-source-schema';

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
describe.runIf(isDatabaseIntegrationEnabled())(
    'app-only private sentence source retention',
    () => {
        let client: PostgresClient,
            db: KnowledgeDatabase,
            knowledge: DrizzleKnowledgeStore,
            paid: DrizzleKnowledgeSentencePaid,
            free: DrizzleKnowledgeSentenceFreeStore,
            worker: DrizzleSentenceWorkerStore;
        let owner: string,
            reader: string,
            other: string,
            noteId: string,
            blockId: string;
        let source: {
            actorId: string;
            noteId: string;
            blockId: string;
            access: { kind: 'note'; locator: string; key: string };
        };
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            owner = randomUUID();
            reader = randomUUID();
            other = randomUUID();
            blockId = randomUUID();
            await db.insert(usersTable).values(
                [owner, reader, other].map((id) => ({
                    id,
                    status: 'active' as const,
                })),
            );
            await db.insert(aiCreditAccountsTable).values(
                [reader, other].map((userId) => ({
                    userId,
                    mode: 'unlimited' as const,
                })),
            );
            const crypto = new KnowledgeShareCrypto(
                'synthetic-sentence-private-retention',
            );
            knowledge = new DrizzleKnowledgeStore(
                db,
                {
                    beforeNoteDeletion: (tx, { noteId, now }) =>
                        eraseKnowledgeSentenceJobs(tx, noteId, now),
                },
                crypto,
            );
            const note = await knowledge.create(owner, {
                operationId: randomUUID(),
                content: KnowledgeNoteContentSchema.parse({
                    title: 'Private source',
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
            source = {
                actorId: reader,
                noteId,
                blockId,
                access: {
                    kind: 'note',
                    ...(await knowledge.issueShare(owner, noteId)),
                },
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
            paid = new DrizzleKnowledgeSentencePaid(db, crypto, {
                resolveExecution: async () => ({
                    snapshot: { ...snapshot },
                    revisionId,
                    selectionVersion: 1,
                    budget: snapshot.aggregateBudget,
                }),
            });
            free = new DrizzleKnowledgeSentenceFreeStore(db, crypto, (tx) =>
                paid.admission(tx),
            );
            worker = new DrizzleSentenceWorkerStore(db);
        }, 120_000);
        afterAll(async () => client?.end());
        async function submit(actorSource: VocabularyPracticeActor = source) {
            const result = await free.next(actorSource, request(), context());
            if (result.kind !== 'job')
                throw new Error('Expected admitted private action');
            return result.job;
        }
        async function claim() {
            const result = await worker.claimNext(
                {
                    workerId: 'sentence-retention-fixture',
                    supportedFormats: [
                        'sentence-generation:v1',
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
            if (!result) throw new Error('Expected private worker claim');
            return result;
        }
        async function assertRedacted(jobId: string, state: string) {
            const [row] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, jobId));
            expect(row).toMatchObject({
                executionState: state,
                inputPayload: null,
                knowledgeSource: null,
                sourceExerciseId: null,
            });
            const [link] = await db
                .select()
                .from(sources)
                .where(eq(sources.jobId, jobId));
            expect(link).toMatchObject({ actorId: reader, noteId, blockId });
            expect(link!.binding.sourceSnapshot.type).toBe('vocabulary');
            expect(link!.inputPayload).not.toBeNull();
            return row!;
        }
        it('retains live-authorized app history after completed, failed and cancelled parent bodies are physically scrubbed', async () => {
            const failed = await submit();
            const failureLease = await claim();
            expect(
                await worker.fail(
                    failureLease.lease,
                    { code: 'provider_timeout', retryAt: null },
                    context(),
                ),
            ).toBe('committed');
            await assertRedacted(failed.id, 'failed');
            expect(
                (await paid.getJob(source, failed.id, context())).state,
            ).toBe('failed');
            const cancelled = await submit();
            expect(
                (await paid.cancelJob(source, cancelled.id, context())).state,
            ).toBe('cancelled');
            await assertRedacted(cancelled.id, 'cancelled');
            expect(
                (await paid.getJob(source, cancelled.id, context())).state,
            ).toBe('cancelled');
            const completed = await submit();
            const claimed = await claim();
            if (claimed.kind !== 'sentence-generation')
                throw new Error('Expected generation');
            expect(await worker.markDispatched(claimed.lease, context())).toBe(
                'dispatch',
            );
            const target = claimed.input.candidates[0]!;
            const content = validateSentenceGeneration(claimed.input, {
                sourceText: 'The cat sleeps.',
                referenceTranslation: 'El gato duerme.',
                segments: [
                    { text: 'The ', entryId: null },
                    { text: 'cat', entryId: target.entryId },
                    { text: ' sleeps.', entryId: null },
                ],
                targets: [
                    {
                        entryId: target.entryId,
                        normalizedHint: 'gato',
                        hintForm: 'lemma',
                    },
                ],
            });
            expect(
                await worker.completeGeneration(
                    claimed.lease,
                    { content, usage: { inputTokens: 100, outputTokens: 20 } },
                    context(),
                ),
            ).toBe('committed');
            await assertRedacted(completed.id, 'completed');
            expect(
                (await paid.getJob(source, completed.id, context())).result
                    ?.kind,
            ).toBe('exercise');
            await expect(
                paid.getJob(
                    { ...source, actorId: other },
                    completed.id,
                    context(),
                ),
            ).rejects.toThrow();
            await knowledge.revokeShare(owner, noteId);
            await expect(
                paid.getJob(source, completed.id, context()),
            ).rejects.toThrow();
            expect(
                await db
                    .select()
                    .from(sources)
                    .where(eq(sources.noteId, noteId)),
            ).toHaveLength(3);
        });
        it('deletes source-bound links on permanent note deletion while an independently copied note keeps its own private job', async () => {
            const original = await submit();
            const copy = await knowledge.copyShared(
                other,
                source.access.locator,
                source.access.key,
                { operationId: randomUUID(), expectedVersion: 1 },
            );
            const copiedBlock = copy.body.document.content?.[0]?.attrs?.block;
            if (copiedBlock?.type !== 'vocabulary')
                throw new Error('Expected copied vocabulary');
            const independent = await submit({
                actorId: other,
                noteId: copy.id,
                blockId: copiedBlock.id,
            });
            await knowledge.delete(owner, noteId, {
                operationId: randomUUID(),
                expectedVersion: 1,
            });
            expect(
                await db
                    .select()
                    .from(sources)
                    .where(eq(sources.jobId, original.id)),
            ).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(sources)
                    .where(eq(sources.jobId, independent.id)),
            ).toHaveLength(1);
            expect(
                (
                    await paid.getJob(
                        {
                            actorId: other,
                            noteId: copy.id,
                            blockId: copiedBlock.id,
                        },
                        independent.id,
                        context(),
                    )
                ).state,
            ).toBe('queued');
            const [parent] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, original.id));
            expect(parent).toMatchObject({
                executionState: 'cancelled',
                inputPayload: null,
                knowledgeSource: null,
                sourceExerciseId: null,
            });
        });
        it('erases a purged actor private source on a foreign note and preserves another actor independent material', async () => {
            const original = await submit();
            const copy = await knowledge.copyShared(
                other,
                source.access.locator,
                source.access.key,
                { operationId: randomUUID(), expectedVersion: 1 },
            );
            const copiedBlock = copy.body.document.content?.[0]?.attrs?.block;
            if (copiedBlock?.type !== 'vocabulary')
                throw new Error('Expected copied vocabulary');
            const independent = await submit({
                actorId: other,
                noteId: copy.id,
                blockId: copiedBlock.id,
            });
            const now = new Date();
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, reader));
            await db.insert(accountDeletionRequestsTable).values({
                userId: reader,
                state: 'pending',
                scheduledAt: new Date(now.getTime() - 120_000),
                purgeAt: new Date(now.getTime() - 60_000),
                nextAttemptAt: new Date(now.getTime() - 60_000),
                updatedAt: now,
            });
            const purgeStore = new DrizzleAccountPurgeStore(db);
            const workerId = 'sentence-retention-purge';
            const claim = await purgeStore.claimDue({ now, workerId });
            if (!claim) throw new Error('Expected purge claim');
            expect(
                await purgeStore.finish({
                    ...claim,
                    now: new Date(),
                    workerId,
                }),
            ).toBe(true);
            expect(
                await db
                    .select()
                    .from(sources)
                    .where(eq(sources.jobId, original.id)),
            ).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(sources)
                    .where(eq(sources.jobId, independent.id)),
            ).toHaveLength(1);
            expect((await knowledge.get(owner, noteId)).id).toBe(noteId);
            expect(
                (
                    await paid.getJob(
                        {
                            actorId: other,
                            noteId: copy.id,
                            blockId: copiedBlock.id,
                        },
                        independent.id,
                        context(),
                    )
                ).state,
            ).toBe('queued');
        });
    },
);
