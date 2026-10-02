import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import type { LearningAccess } from '../../../../../src/modules/learning/application/ports/learning-store';
import {
    LearningAuthenticationRequiredError,
    LearningInvalidRequestError,
    LearningUnavailableError,
    LearningEntryUnavailableError,
} from '../../../../../src/modules/learning/domain/errors';
import { DrizzleLearningStore } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-learning-store';
import {
    flashcardAttemptsTable,
    flashcardEntryProgressTable,
    flashcardPreferencesTable,
} from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const configuration = {
    front: ['targetExample' as const],
    back: ['sourceExample' as const],
};
const context = () => ({ signal: new AbortController().signal });

describe('learning schema cascade indexes', () => {
    it.each([
        flashcardPreferencesTable,
        flashcardAttemptsTable,
        flashcardEntryProgressTable,
    ])('indexes every foreign-key lookup in $._.name', (table) => {
        const config = getTableConfig(table);
        const keys = [
            ...config.primaryKeys.map((key) =>
                key.columns.map((column) => column.name),
            ),
            ...config.uniqueConstraints.map((key) =>
                key.columns.map((column) => column.name),
            ),
            ...config.indexes.map((index) =>
                index.config.columns.flatMap((column) =>
                    'name' in column ? [column.name] : [],
                ),
            ),
        ];
        for (const foreignKey of config.foreignKeys) {
            const names = foreignKey
                .reference()
                .columns.map((column) => column.name)
                .sort();
            expect(
                keys.some(
                    (key) =>
                        JSON.stringify(key.slice(0, names.length).sort()) ===
                        JSON.stringify(names),
                ),
                `${config.name} FK ${names.join(',')} must have leading index columns`,
            ).toBe(true);
        }
    });
});

run('DrizzleLearningStore', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let store: DrizzleLearningStore;
    let owner: string;
    let reader: string;
    let dictionaryId: string;
    let entryId: string;
    const keyDigest = `hmac-sha256:v1:${'A'.repeat(43)}`;
    const shareId = 'a'.repeat(24);
    const owned = (): LearningAccess => ({
        kind: 'owner',
        dictionaryId,
        learnerId: owner,
    });
    const shared = (learnerId: string | null = reader): LearningAccess => ({
        kind: 'shared',
        shareId,
        keyDigest,
        learnerId,
    });
    const attempt = (overrides = {}) => ({
        operationId: randomUUID(),
        sessionId: randomUUID(),
        entryId,
        expectedLearningVersion: 1,
        round: 1,
        rating: 'known' as const,
        configuration,
        ...overrides,
    });

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        store = new DrizzleLearningStore(database);
    }, 60_000);
    afterAll(async () => client.end());
    beforeEach(async () => {
        await database.delete(usersTable);
        owner = randomUUID();
        reader = randomUUID();
        dictionaryId = randomUUID();
        entryId = randomUUID();
        await database.insert(usersTable).values([
            { id: owner, status: 'active' },
            { id: reader, status: 'active' },
        ]);
        await database.insert(dictionariesTable).values({
            id: dictionaryId,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            ownerId: owner,
            name: 'Test learning',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'es',
            visibility: 'unlisted',
            shareLocator: shareId,
            shareKeyDigest: keyDigest,
            shareKeyVersion: 1,
            shareKeyRotatedAt: new Date(),
        });
        await database.insert(dictionarySettingsTable).values({ dictionaryId });
        await database.insert(dictionaryCardsTable).values({
            id: entryId,
            dictionaryId,
            source: 'hello',
            normalizedSource: 'hello',
            translation: 'hola',
            authorship: 'human',
            sortKey: 1024n,
        });
    });

    it('projects fallback and preserves explicit manual ordering in dictionary order', async () => {
        const second = randomUUID();
        await database.insert(dictionaryCardsTable).values({
            id: second,
            dictionaryId,
            source: 'goodbye',
            normalizedSource: 'goodbye',
            translation: 'adiós',
            authorship: 'human',
            sortKey: 2048n,
        });
        const prepared = await store.prepare(
            shared(null),
            {
                configuration,
                scope: {
                    type: 'manual',
                    entryIds: [second, entryId, randomUUID()],
                },
            },
            context(),
        );
        expect(prepared).toEqual({
            entryIds: [entryId, second],
            eligibleCount: 2,
            skippedCount: 1,
            fallbackCount: 2,
        });
        const result = await store.items(
            shared(null),
            { configuration, entryIds: [second, entryId] },
            context(),
        );
        expect(result.items.map((item) => item.entryId)).toEqual([
            second,
            entryId,
        ]);
        expect(result.items[0]?.front[0]).toMatchObject({
            text: 'adiós',
            field: 'translation',
            fallback: true,
        });
        expect(await database.select().from(flashcardAttemptsTable)).toEqual(
            [],
        );
        await expect(
            store.progress(shared(null), context()),
        ).rejects.toBeInstanceOf(LearningAuthenticationRequiredError);
    });
    it('lists bounded searchable pages without leaking disabled fields', async () => {
        const second = randomUUID();
        await database.insert(dictionaryCardsTable).values({
            id: second,
            dictionaryId,
            source: 'world',
            normalizedSource: 'world',
            translation: 'mundo',
            authorship: 'human',
            sortKey: 2048n,
        });
        const page = await store.listEntries(
            shared(null),
            { limit: 1 },
            context(),
        );
        expect(page.entries).toEqual([
            { entryId, source: 'hello', translation: 'hola' },
        ]);
        expect(page.nextCursor).toBeTypeOf('string');
        expect(
            (
                await store.listEntries(
                    shared(null),
                    { limit: 1, cursor: page.nextCursor! },
                    context(),
                )
            ).entries[0]?.entryId,
        ).toBe(second);
        expect(
            (
                await store.listEntries(
                    shared(null),
                    { limit: 25, search: 'mundo' },
                    context(),
                )
            ).entries,
        ).toHaveLength(1);
        await expect(
            store.listEntries(
                shared(null),
                { limit: 25, search: 'changed', cursor: page.nextCursor! },
                context(),
            ),
        ).rejects.toBeInstanceOf(LearningInvalidRequestError);
        await expect(
            store.listEntries(
                shared(null),
                {
                    limit: 25,
                    cursor: Buffer.from(
                        JSON.stringify({
                            sort: '9999999999999999999999999',
                            id: 'bad',
                        }),
                    ).toString('base64url'),
                },
                context(),
            ),
        ).rejects.toBeInstanceOf(LearningInvalidRequestError);
    });
    it('persists independent preferences and rejects a concurrent optimistic write', async () => {
        expect((await store.getPreferences(shared(), context())).version).toBe(
            0,
        );
        const writes = await Promise.allSettled(
            [true, false].map((shuffle) =>
                store.savePreferences(
                    shared(),
                    { configuration, shuffle, expectedVersion: 0 },
                    context(),
                ),
            ),
        );
        expect(
            writes.filter((value) => value.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            writes.filter((value) => value.status === 'rejected'),
        ).toHaveLength(1);
        expect((await store.getPreferences(shared(), context())).version).toBe(
            1,
        );
        expect((await store.getPreferences(owned(), context())).version).toBe(
            0,
        );
    });
    it('serializes exact operation replay and rejects global reuse across attempt and undo', async () => {
        const request = attempt();
        const results = await Promise.all([
            store.recordAttempt(shared(), request, context()),
            store.recordAttempt(shared(), request, context()),
        ]);
        expect(results[0]).toEqual(results[1]);
        expect(
            await database.select().from(flashcardAttemptsTable),
        ).toHaveLength(1);
        await expect(
            store.recordAttempt(shared(), { ...request, round: 2 }, context()),
        ).rejects.toMatchObject({ reason: 'operation_conflict' });
        await expect(
            store.undo(
                shared(),
                results[0]!.attemptId,
                { operationId: request.operationId },
                context(),
            ),
        ).rejects.toMatchObject({ reason: 'operation_conflict' });
        const undoId = randomUUID();
        const undone = await store.undo(
            shared(),
            results[0]!.attemptId,
            { operationId: undoId },
            context(),
        );
        expect(undone.rating).toBeNull();
        expect(
            await store.undo(
                shared(),
                results[0]!.attemptId,
                { operationId: undoId },
                context(),
            ),
        ).toEqual(undone);
        await expect(
            store.recordAttempt(
                shared(),
                attempt({ operationId: undoId }),
                context(),
            ),
        ).rejects.toMatchObject({ reason: 'operation_conflict' });
    });
    it('restores prior same-version progress across sessions and never undoes newer competing state', async () => {
        const first = await store.recordAttempt(
            shared(),
            attempt({ rating: 'again' }),
            context(),
        );
        const second = await store.recordAttempt(
            shared(),
            attempt(),
            context(),
        );
        await expect(
            store.undo(
                shared(),
                first.attemptId,
                { operationId: randomUUID() },
                context(),
            ),
        ).rejects.toMatchObject({ reason: 'undo_conflict' });
        expect(
            (
                await store.undo(
                    shared(),
                    second.attemptId,
                    { operationId: randomUUID() },
                    context(),
                )
            ).rating,
        ).toBe('again');
        expect(await store.progress(shared(), context())).toEqual({
            total: 1,
            known: 0,
            again: 1,
            unstudied: 0,
        });
        expect(
            await database.select().from(flashcardAttemptsTable),
        ).toHaveLength(2);
        expect(await store.progress(owned(), context())).toEqual({
            total: 1,
            known: 0,
            again: 0,
            unstudied: 1,
        });
    });
    it('rejects an older session result even for different entries', async () => {
        const second = randomUUID();
        await database.insert(dictionaryCardsTable).values({
            id: second,
            dictionaryId,
            source: 'bye',
            normalizedSource: 'bye',
            translation: 'adiós',
            authorship: 'human',
            sortKey: 2048n,
        });
        const sessionId = randomUUID();
        const first = await store.recordAttempt(
            shared(),
            attempt({ sessionId }),
            context(),
        );
        await store.recordAttempt(
            shared(),
            attempt({ sessionId, entryId: second }),
            context(),
        );
        await expect(
            store.undo(
                shared(),
                first.attemptId,
                { operationId: randomUUID() },
                context(),
            ),
        ).rejects.toMatchObject({ reason: 'undo_conflict' });
    });
    it('invalidates stale results, excludes archive and restores current-version history only', async () => {
        const result = await store.recordAttempt(
            shared(),
            attempt(),
            context(),
        );
        await database
            .update(dictionaryCardsTable)
            .set({ learningVersion: 2 })
            .where(eq(dictionaryCardsTable.id, entryId));
        expect((await store.progress(shared(), context())).unstudied).toBe(1);
        await expect(
            store.recordAttempt(shared(), attempt(), context()),
        ).rejects.toMatchObject({ reason: 'stale_content' });
        await expect(
            store.undo(
                shared(),
                result.attemptId,
                { operationId: randomUUID() },
                context(),
            ),
        ).rejects.toMatchObject({ reason: 'stale_content' });
        const fresh = await store.recordAttempt(
            shared(),
            attempt({ expectedLearningVersion: 2 }),
            context(),
        );
        expect(
            (
                await store.undo(
                    shared(),
                    fresh.attemptId,
                    { operationId: randomUUID() },
                    context(),
                )
            ).rating,
        ).toBeNull();
        await database
            .update(dictionaryCardsTable)
            .set({ lifecycle: 'archived', archivedAt: new Date() })
            .where(eq(dictionaryCardsTable.id, entryId));
        expect((await store.progress(shared(), context())).total).toBe(0);
    });
    it.each(['archive', 'delete'] as const)(
        'distinguishes %s entry loss from revoked dictionary access without changing remaining state',
        async (removal) => {
            const second = randomUUID();
            await database.insert(dictionaryCardsTable).values({
                id: second,
                dictionaryId,
                source: 'world',
                normalizedSource: 'world',
                translation: 'mundo',
                authorship: 'human',
                sortKey: 2048n,
            });
            const recorded = await store.recordAttempt(
                shared(),
                attempt(),
                context(),
            );
            await store.recordAttempt(
                shared(),
                attempt({ entryId: second }),
                context(),
            );
            const prepared = await store.items(
                shared(),
                { configuration, entryIds: [entryId] },
                context(),
            );
            expect(prepared.items).toHaveLength(1);
            if (removal === 'archive')
                await database
                    .update(dictionaryCardsTable)
                    .set({ lifecycle: 'archived', archivedAt: new Date() })
                    .where(eq(dictionaryCardsTable.id, entryId));
            else
                await database
                    .delete(dictionaryCardsTable)
                    .where(eq(dictionaryCardsTable.id, entryId));
            const stateBefore = await database
                .select()
                .from(flashcardEntryProgressTable);
            const attemptsBefore = await database
                .select()
                .from(flashcardAttemptsTable);
            await expect(
                store.recordAttempt(shared(), attempt(), context()),
            ).rejects.toBeInstanceOf(LearningEntryUnavailableError);
            await expect(
                store.undo(
                    shared(),
                    recorded.attemptId,
                    { operationId: randomUUID() },
                    context(),
                ),
            ).rejects.toBeInstanceOf(LearningEntryUnavailableError);
            expect(
                await database.select().from(flashcardEntryProgressTable),
            ).toEqual(stateBefore);
            expect(
                await database.select().from(flashcardAttemptsTable),
            ).toEqual(attemptsBefore);
            expect(
                (await store.listEntries(shared(), { limit: 25 }, context()))
                    .entries,
            ).toEqual([
                { entryId: second, source: 'world', translation: 'mundo' },
            ]);
            expect(await store.progress(shared(), context())).toEqual({
                total: 1,
                known: 1,
                again: 0,
                unstudied: 0,
            });
            await database
                .update(dictionariesTable)
                .set({
                    visibility: 'private',
                    shareLocator: null,
                    shareKeyDigest: null,
                    shareKeyVersion: null,
                    shareKeyRotatedAt: null,
                })
                .where(eq(dictionariesTable.id, dictionaryId));
            await expect(
                store.recordAttempt(
                    shared(),
                    attempt({ entryId: second }),
                    context(),
                ),
            ).rejects.toBeInstanceOf(LearningUnavailableError);
        },
    );
    it('rechecks sharing and active users before idempotent replay or undo', async () => {
        const request = attempt();
        const result = await store.recordAttempt(shared(), request, context());
        await database
            .update(usersTable)
            .set({ status: 'disabled' })
            .where(eq(usersTable.id, reader));
        await expect(
            store.recordAttempt(shared(), request, context()),
        ).rejects.toBeInstanceOf(LearningUnavailableError);
        await database
            .update(usersTable)
            .set({ status: 'active' })
            .where(eq(usersTable.id, reader));
        await database
            .update(dictionariesTable)
            .set({ shareKeyDigest: `hmac-sha256:v1:${'B'.repeat(43)}` })
            .where(eq(dictionariesTable.id, dictionaryId));
        await expect(
            store.undo(
                shared(),
                result.attemptId,
                { operationId: randomUUID() },
                context(),
            ),
        ).rejects.toBeInstanceOf(LearningUnavailableError);
        await database
            .update(usersTable)
            .set({ status: 'disabled' })
            .where(eq(usersTable.id, owner));
        await expect(
            store.items(
                shared(null),
                { configuration, entryIds: [entryId] },
                context(),
            ),
        ).rejects.toBeInstanceOf(LearningUnavailableError);
    });
    it('waits for in-transaction content edits then rejects stale rating rather than racing', async () => {
        let release!: () => void;
        let locked!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const ready = new Promise<void>((resolve) => {
            locked = resolve;
        });
        const edit = database.transaction(async (tx) => {
            await tx
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, owner))
                .for('update');
            await tx
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, dictionaryId))
                .for('update');
            locked();
            await gate;
            await tx
                .update(dictionaryCardsTable)
                .set({ learningVersion: 2 })
                .where(eq(dictionaryCardsTable.id, entryId));
        });
        await ready;
        const rating = store.recordAttempt(shared(), attempt(), context());
        release();
        await edit;
        await expect(rating).rejects.toMatchObject({ reason: 'stale_content' });
        expect(await database.select().from(flashcardAttemptsTable)).toEqual(
            [],
        );
    });
    it('cascades permanent entry deletion across learners and rejects crossed dictionary references', async () => {
        await store.recordAttempt(shared(), attempt(), context());
        await store.recordAttempt(owned(), attempt(), context());
        await expect(
            database.insert(flashcardAttemptsTable).values({
                id: randomUUID(),
                learnerId: reader,
                dictionaryId: randomUUID(),
                entryId,
                operationId: randomUUID(),
                sessionId: randomUUID(),
                round: 1,
                learningVersion: 1,
                rating: 'known',
                configuration,
            }),
        ).rejects.toThrow();
        await database
            .delete(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, entryId));
        expect(await database.select().from(flashcardAttemptsTable)).toEqual(
            [],
        );
        expect(
            await database.select().from(flashcardEntryProgressTable),
        ).toEqual([]);
    });
    it('uses both progress FK indexes with 200 entries and 25 learners', async () => {
        await database
            .delete(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, entryId));
        const learnerIds = Array.from({ length: 25 }, () => randomUUID());
        const entryIds = Array.from({ length: 200 }, () => randomUUID());
        await database
            .insert(usersTable)
            .values(
                learnerIds.map((id) => ({ id, status: 'active' as const })),
            );
        await database.insert(dictionaryCardsTable).values(
            entryIds.map((id, index) => ({
                id,
                dictionaryId,
                source: `word ${index}`,
                normalizedSource: `word ${index}`,
                translation: 'palabra',
                authorship: 'human' as const,
                sortKey: BigInt(index + 1) * 1024n,
            })),
        );
        const seeded = learnerIds.flatMap((learnerId) =>
            entryIds.map((entryId) => ({
                id: randomUUID(),
                learnerId,
                dictionaryId,
                entryId,
                operationId: randomUUID(),
                sessionId: randomUUID(),
                round: 1,
                learningVersion: 1,
                rating: 'known' as const,
                configuration,
            })),
        );
        for (let offset = 0; offset < seeded.length; offset += 500) {
            const batch = seeded.slice(offset, offset + 500);
            await database.insert(flashcardAttemptsTable).values(batch);
            await database.insert(flashcardEntryProgressTable).values(
                batch.map((row) => ({
                    learnerId: row.learnerId,
                    dictionaryId,
                    entryId: row.entryId,
                    learningVersion: 1,
                    rating: 'known' as const,
                    latestAttemptId: row.id,
                })),
            );
        }
        await database.execute(sql`analyze flashcard_entry_progress`);
        const entryLookup = await database.execute(
            sql`explain (analyze, format json) select 1 from flashcard_entry_progress where dictionary_id = ${dictionaryId} and entry_id = ${entryIds[0]!}`,
        );
        expect(JSON.stringify(entryLookup)).toContain(
            'flashcard_progress_dictionary_entry_idx',
        );
        const attemptLookup = await database.execute(
            sql`explain (analyze, format json) select 1 from flashcard_entry_progress where latest_attempt_id = ${seeded[0]!.id}`,
        );
        expect(JSON.stringify(attemptLookup)).toContain(
            'flashcard_progress_latest_attempt_idx',
        );
        const definitions = await database.execute(
            sql`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'flashcard_entry_progress'`,
        );
        expect(JSON.stringify(definitions)).toContain(
            'flashcard_progress_dictionary_entry_idx',
        );
        expect(JSON.stringify(definitions)).toContain(
            'flashcard_progress_latest_attempt_idx',
        );
        expect(
            (await database.select().from(flashcardEntryProgressTable)).length,
        ).toBe(5_000);
    }, 60_000);
    it('prepares a 10,000-entry ID-only manifest with indexed bounded content batch', async () => {
        await database
            .delete(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, entryId));
        for (let offset = 0; offset < 10_000; offset += 500) {
            await database.insert(dictionaryCardsTable).values(
                Array.from({ length: 500 }, (_, index) => ({
                    id: randomUUID(),
                    dictionaryId,
                    source: `word ${offset + index}`,
                    normalizedSource: `word ${offset + index}`,
                    translation: 'palabra',
                    authorship: 'human' as const,
                    sortKey: BigInt(offset + index + 1) * 1024n,
                })),
            );
        }
        const result = await store.prepare(
            shared(null),
            { configuration, scope: { type: 'all' } },
            context(),
        );
        expect(result.entryIds).toHaveLength(10_000);
        expect(result.eligibleCount).toBe(10_000);
        expect(JSON.stringify(result)).not.toContain('palabra');
        expect(
            (
                await store.items(
                    shared(null),
                    { configuration, entryIds: result.entryIds.slice(0, 25) },
                    context(),
                )
            ).items,
        ).toHaveLength(25);
        const plan = await database.execute(
            sql`explain (format json) select id from dictionary_cards where dictionary_id = ${dictionaryId} and lifecycle = 'active' order by sort_key, id limit 25`,
        );
        expect(JSON.stringify(plan)).toContain(
            'dictionary_cards_active_order_idx',
        );
    }, 30_000);
});
