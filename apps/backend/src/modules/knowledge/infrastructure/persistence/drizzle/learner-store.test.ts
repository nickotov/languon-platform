import {
    pinKnowledgeExerciseEvaluation,
    authorizeKnowledgeExerciseJobSource,
} from './exercise-evaluation-source';
import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import {
    KnowledgeNoteContentSchema,
    type ExerciseLearningBlock,
    type SubmitWorkbookAttemptRequest,
} from '@languon/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleLearnerStore } from './learner-store';
import { knowledgeNotesTable } from './schema';
import { knowledgeWorkbooksTable } from './workbook-schema';
import {
    knowledgeLearnerAttemptsTable,
    knowledgeLearnerEventsTable,
    knowledgeLearnerCompletionTable,
    knowledgeLearnerCompletionReceiptsTable,
} from './learner-schema';
import type { KnowledgeDatabase } from './knowledge-transaction';
import { DrizzleWorkbookStore } from './workbook-store';

const content = (exercise: ExerciseLearningBlock) =>
    KnowledgeNoteContentSchema.parse({
        title: 'Practice',
        summary: '',
        categories: [],
        studiedLanguage: 'en',
        explanationLanguage: 'en',
        body: {
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    { type: 'learningBlock', attrs: { block: exercise } },
                ],
            },
        },
    });
describe.runIf(isDatabaseIntegrationEnabled())(
    'Workbook private learner PostgreSQL authority and history',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let notes: DrizzleKnowledgeStore;
        let store: DrizzleLearnerStore;
        let workbooks: DrizzleWorkbookStore;
        let author: string;
        let reader: string;
        let other: string;
        let exercise: ExerciseLearningBlock;
        let noteId: string;
        let initialRevision: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const crypto = new KnowledgeShareCrypto(
                'synthetic-workbook-learner-secret',
            );
            notes = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            store = new DrizzleLearnerStore(db, crypto);
            workbooks = new DrizzleWorkbookStore(db, crypto);
        }, 120_000);
        beforeEach(async () => {
            await db.delete(knowledgeWorkbooksTable);
            await db.delete(knowledgeNotesTable);
            author = randomUUID();
            reader = randomUUID();
            other = randomUUID();
            await db.insert(usersTable).values(
                [author, reader, other].map((id) => ({
                    id,
                    status: 'active' as const,
                })),
            );
            const choice = randomUUID();
            exercise = {
                id: randomUUID(),
                type: 'exercise',
                format: 'multiple-choice',
                question: 'Which tense?',
                choices: [
                    { id: choice, text: 'Past' },
                    { id: randomUUID(), text: 'Present' },
                ],
                correctChoiceId: choice,
                referenceAnswer: 'Past',
                explanation: 'A completed event.',
            };
            const note = await notes.create(author, {
                operationId: randomUUID(),
                content: content(exercise),
            });
            noteId = note.id;
            initialRevision = (await store.read(author, noteId))
                .exerciseRevisions[0]!.revision;
        });
        afterAll(async () => client?.end(), 120_000);
        function request(): SubmitWorkbookAttemptRequest {
            return {
                id: randomUUID(),
                noteVersion: 1,
                exerciseId: exercise.id,
                exerciseRevision: initialRevision,
                answer: {
                    format: 'multiple-choice',
                    choiceId:
                        exercise.format === 'multiple-choice'
                            ? exercise.correctChoiceId
                            : randomUUID(),
                },
            };
        }
        async function share() {
            const proof = await notes.issueShare(author, noteId);
            return { kind: 'note' as const, ...proof };
        }
        it('requires live source access and isolates each authenticated learner', async () => {
            await expect(store.read(reader, noteId)).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
            const access = await share();
            await store.attempt(reader, noteId, request(), access);
            expect(
                (await store.read(reader, noteId, access)).attempts,
            ).toHaveLength(1);
            expect(
                (await store.read(other, noteId, access)).attempts,
            ).toHaveLength(0);
            expect((await store.read(author, noteId)).attempts).toHaveLength(0);
            await notes.revokeShare(author, noteId);
            await expect(
                store.read(reader, noteId, access),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('pins only the authenticated learner private answer and verified share digest for AI evaluation', async () => {
            const access = await share();
            const answer = request();
            await store.attempt(reader, noteId, answer, access);
            const crypto = new KnowledgeShareCrypto(
                'synthetic-workbook-learner-secret',
            );
            const pinned = await db.transaction((tx) =>
                pinKnowledgeExerciseEvaluation(
                    tx,
                    crypto,
                    reader,
                    noteId,
                    {
                        operationId: randomUUID(),
                        attemptId: answer.id,
                        replyLanguage: 'ru',
                    },
                    access,
                ),
            );
            expect(pinned.answer).toEqual(answer.answer);
            expect(pinned.exercise.referenceAnswer).toBe('Past');
            expect(pinned.grant?.digest).toBe(crypto.digest(access.key));
            expect(JSON.stringify(pinned)).not.toContain(access.key);
            await expect(
                db.transaction((tx) =>
                    pinKnowledgeExerciseEvaluation(
                        tx,
                        crypto,
                        other,
                        noteId,
                        { operationId: randomUUID(), attemptId: answer.id },
                        access,
                    ),
                ),
            ).rejects.toMatchObject({ code: 'access_revoked' });
            await expect(
                db.transaction((tx) =>
                    authorizeKnowledgeExerciseJobSource(tx, {
                        ownerId: reader,
                        knowledgeExerciseEvaluation: pinned,
                    }),
                ),
            ).resolves.toBeUndefined();
            await notes.revokeShare(author, noteId);
            await expect(
                db.transaction((tx) =>
                    authorizeKnowledgeExerciseJobSource(tx, {
                        ownerId: reader,
                        knowledgeExerciseEvaluation: pinned,
                    }),
                ),
            ).rejects.toBeDefined();
        });
        it('allows explanation-only source updates but refuses AI evaluation after the exercise material changes', async () => {
            const answer = request();
            await store.attempt(author, noteId, answer);
            const pinned = await db.transaction((tx) =>
                pinKnowledgeExerciseEvaluation(
                    tx,
                    new KnowledgeShareCrypto(
                        'synthetic-workbook-learner-secret',
                    ),
                    author,
                    noteId,
                    { operationId: randomUUID(), attemptId: answer.id },
                ),
            );
            await notes.update(author, noteId, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content({
                    ...exercise,
                    explanation: 'A clearer reason.',
                }),
            });
            await expect(
                db.transaction((tx) =>
                    authorizeKnowledgeExerciseJobSource(tx, {
                        ownerId: author,
                        knowledgeExerciseEvaluation: pinned,
                    }),
                ),
            ).resolves.toBeUndefined();
            await notes.update(author, noteId, {
                operationId: randomUUID(),
                expectedVersion: 2,
                content: content({ ...exercise, question: 'Changed question' }),
            });
            await expect(
                db.transaction((tx) =>
                    authorizeKnowledgeExerciseJobSource(tx, {
                        ownerId: author,
                        knowledgeExerciseEvaluation: pinned,
                    }),
                ),
            ).rejects.toBeDefined();
        });
        it('derives correctness and preserves immutable exercise snapshot with idempotent concurrent retry', async () => {
            const access = await share();
            const input = request();
            const [first, retry] = await Promise.all([
                store.attempt(reader, noteId, input, access),
                store.attempt(reader, noteId, input, access),
            ]);
            expect(first).toEqual(retry);
            expect(first.evaluation).toEqual({
                status: 'correct',
                method: 'deterministic',
            });
            const rows = await db
                .select()
                .from(knowledgeLearnerAttemptsTable)
                .where(eq(knowledgeLearnerAttemptsTable.noteId, noteId));
            expect(rows).toHaveLength(1);
            expect(rows[0]!.snapshot).toEqual([exercise]);
            await expect(
                store.attempt(
                    reader,
                    noteId,
                    {
                        ...input,
                        answer: {
                            format: 'multiple-choice',
                            choiceId: randomUUID(),
                        },
                    },
                    access,
                ),
            ).rejects.toMatchObject({ code: 'idempotency_conflict' });
        });
        it('rejects stale revisions but retains old attempts after material edits', async () => {
            const input = request();
            await store.attempt(author, noteId, input);
            const revised = {
                ...exercise,
                question: 'Which tense is used now?',
            };
            await notes.update(author, noteId, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content(revised),
            });
            await expect(
                store.attempt(author, noteId, {
                    ...input,
                    id: randomUUID(),
                    noteVersion: 2,
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            const fresh = await store.attempt(author, noteId, {
                ...input,
                id: randomUUID(),
                noteVersion: 2,
                exerciseRevision: (await store.read(author, noteId))
                    .exerciseRevisions[0]!.revision,
            });
            const state = await store.read(author, noteId);
            expect(state.attempts).toHaveLength(2);
            expect(fresh.exerciseRevision).not.toBe(input.exerciseRevision);
        });
        it('retains semantic identity across explanation-only edits and explicitly completed updates', async () => {
            const input = request();
            await store.attempt(author, noteId, input);
            await store.complete(author, noteId, {
                id: randomUUID(),
                noteVersion: 1,
                completed: true,
            });
            const revised = {
                ...exercise,
                explanation: 'An improved explanation.',
            };
            await notes.update(author, noteId, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content(revised),
            });
            const state = await store.read(author, noteId);
            expect(state.exerciseRevisions[0]!.revision).toBe(
                input.exerciseRevision,
            );
            expect(state.completion!.completedNoteVersion).toBe(1);
            expect(state.updatedSinceCompletion).toBe(true);
        });
        it('records reveals separately from attempts/correctness and handles completion replay', async () => {
            const input = request();
            await store.event(author, noteId, {
                id: randomUUID(),
                noteVersion: 1,
                blockId: exercise.id,
                exerciseRevision: input.exerciseRevision,
                kind: 'answer-revealed',
            });
            const completion = {
                id: randomUUID(),
                noteVersion: 1,
                completed: true,
            };
            const first = await store.complete(author, noteId, completion);
            await store.complete(author, noteId, {
                id: randomUUID(),
                noteVersion: 1,
                completed: false,
            });
            expect(await store.complete(author, noteId, completion)).toEqual(
                first,
            );
            const state = await store.read(author, noteId);
            expect(state.events).toHaveLength(1);
            expect(state.attempts).toHaveLength(0);
            expect(state.completion).toBeNull();
        });
        it('authorizes workbook-derived access and denies removed membership', async () => {
            const workbook = await workbooks.create(author, {
                id: randomUUID(),
                title: 'Workbook',
            });
            await workbooks.setNotes(author, workbook.id, {
                expectedVersion: 1,
                noteIds: [noteId],
                acknowledgeSharedAddition: false,
            });
            const proof = await workbooks.issueShare(
                author,
                workbook.id,
                (await workbooks.get(author, workbook.id)).version,
            );
            const access = { kind: 'workbook' as const, ...proof };
            await store.attempt(reader, noteId, request(), access);
            await workbooks.setNotes(author, workbook.id, {
                expectedVersion: (await workbooks.get(author, workbook.id))
                    .version,
                noteIds: [],
                acknowledgeSharedAddition: false,
            });
            await expect(
                store.read(reader, noteId, access),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('counts only the current learner and current saved workbook members, retaining updated completion', async () => {
            const workbook = await workbooks.create(author, {
                id: randomUUID(),
                title: 'Private progress',
            });
            await workbooks.setNotes(author, workbook.id, {
                expectedVersion: 1,
                noteIds: [noteId],
                acknowledgeSharedAddition: false,
            });
            const proof = await workbooks.issueShare(author, workbook.id, 2);
            const access = { kind: 'workbook' as const, ...proof };
            await store.complete(
                reader,
                noteId,
                { id: randomUUID(), noteVersion: 1, completed: true },
                access,
            );
            expect(
                await store.workbookProgress(reader, workbook.id, access),
            ).toMatchObject({
                totalNotes: 1,
                completedNotes: 1,
                updatedSinceCompletion: 0,
            });
            expect(
                await store.workbookProgress(author, workbook.id),
            ).toMatchObject({
                totalNotes: 1,
                completedNotes: 0,
                updatedSinceCompletion: 0,
            });
            await expect(
                store.workbookProgress(other, workbook.id),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            await notes.update(author, noteId, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content({
                    ...exercise,
                    explanation: 'Updated explanation',
                }),
            });
            expect(
                await store.workbookProgress(reader, workbook.id, access),
            ).toMatchObject({ completedNotes: 1, updatedSinceCompletion: 1 });
            await workbooks.setNotes(author, workbook.id, {
                expectedVersion: 2,
                noteIds: [],
                acknowledgeSharedAddition: false,
            });
            expect(
                await store.workbookProgress(reader, workbook.id, access),
            ).toMatchObject({
                totalNotes: 0,
                completedNotes: 0,
                updatedSinceCompletion: 0,
            });
        });
        it('requires live workbook access for aggregate progress even after completion', async () => {
            const workbook = await workbooks.create(author, {
                id: randomUUID(),
                title: 'Revocable progress',
            });
            await workbooks.setNotes(author, workbook.id, {
                expectedVersion: 1,
                noteIds: [noteId],
                acknowledgeSharedAddition: false,
            });
            const proof = await workbooks.issueShare(author, workbook.id, 2);
            const access = { kind: 'workbook' as const, ...proof };
            await store.complete(
                reader,
                noteId,
                { id: randomUUID(), noteVersion: 1, completed: true },
                access,
            );
            await expect(
                store.workbookProgress(reader, workbook.id, {
                    ...access,
                    kind: 'note',
                }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            await workbooks.revokeShare(author, workbook.id, 2);
            await expect(
                store.workbookProgress(reader, workbook.id, access),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(
                await store.workbookProgress(author, workbook.id),
            ).toMatchObject({ totalNotes: 1, completedNotes: 0 });
        });
        it('permanent source deletion removes all source-bound private state', async () => {
            await store.attempt(author, noteId, request());
            await store.event(author, noteId, {
                id: randomUUID(),
                noteVersion: 1,
                blockId: exercise.id,
                exerciseRevision: initialRevision,
                kind: 'answer-revealed',
            });
            await store.complete(author, noteId, {
                id: randomUUID(),
                noteVersion: 1,
                completed: true,
            });
            await db
                .delete(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, noteId));
            for (const table of [
                knowledgeLearnerAttemptsTable,
                knowledgeLearnerEventsTable,
                knowledgeLearnerCompletionTable,
                knowledgeLearnerCompletionReceiptsTable,
            ])
                expect(
                    await db
                        .select()
                        .from(table)
                        .where(eq(table.noteId, noteId)),
                ).toHaveLength(0);
        });
    },
);
