import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    SentenceLibraryFiltersSchema,
    SentenceLibraryQuerySchema,
    AdminSentenceLibraryQuerySchema,
    SentenceExerciseSchema,
} from '@languon/contracts';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    sentenceExercisesTable,
    sentenceExerciseEntriesTable,
} from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import { sentenceLibrarySnapshotsTable } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-library-schema';
import { DrizzleSentenceLibraryStore } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-library-store';
import { lockTextAiCapacity } from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import type { SentenceLibraryAdminScope } from '../../../../src/modules/learning/application/ports/sentence-library-store';
import {
    SentenceCapacityUnavailableError,
    SentenceConflictError,
} from '../../../../src/modules/learning/domain/sentence-errors';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const suite = describe.runIf(isDatabaseIntegrationEnabled());
suite('sentence library safety boundaries', () => {
    let client: PostgresClient;
    let db: PostgresJsDatabase<typeof databaseSchema>;
    let library: DrizzleSentenceLibraryStore;
    let owner: string;
    let dictionaryId: string;
    let entryId: string;
    let exerciseId: string;
    const now = new Date('2026-10-06T12:00:00.000Z');
    const context = () => ({ now, signal: new AbortController().signal });
    const access = () => ({
        kind: 'owner' as const,
        learnerId: owner,
        dictionaryId,
    });
    const query = () =>
        SentenceLibraryQuerySchema.parse({ personalArchive: 'all' });
    const adminScope = (): SentenceLibraryAdminScope => ({
        actorId: owner,
        actorSessionId: randomUUID(),
        targetUserId: owner,
        dictionaryId,
        audit: {
            id: randomUUID(),
            correlationId: randomUUID(),
            expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        },
    });
    async function dictionary() {
        const id = randomUUID();
        await db.insert(dictionariesTable).values({
            id,
            ownerId: owner,
            name: 'Synthetic safety dictionary',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'es',
            createdAt: now,
        });
        await db.insert(dictionarySettingsTable).values({ dictionaryId: id });
        return id;
    }
    function exercise(id = exerciseId) {
        return SentenceExerciseSchema.parse({
            id,
            dictionaryId,
            direction: 'source-to-target',
            sourceLanguage: 'en',
            targetLanguage: 'es',
            sourceText: 'Hello.',
            segments: [
                {
                    id: 'segment-1',
                    start: 0,
                    end: 6,
                    text: 'Hello.',
                    target: {
                        entryId,
                        occurrenceId: 'occurrence-1',
                        hintId: 'hint-1',
                    },
                },
            ],
            hints: [{ id: 'hint-1', text: 'hola' }],
            generationPolicyVersion: 1,
            createdAt: now.toISOString(),
        });
    }
    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
    });
    beforeEach(async () => {
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        owner = randomUUID();
        entryId = randomUUID();
        exerciseId = randomUUID();
        await db.insert(usersTable).values({ id: owner, status: 'active' });
        dictionaryId = await dictionary();
        await db.insert(dictionaryCardsTable).values({
            id: entryId,
            dictionaryId,
            source: 'hello',
            normalizedSource: 'hello',
            translation: 'hola',
            authorship: 'human',
            sortKey: 1024n,
        });
        await db.insert(sentenceExercisesTable).values({
            id: exerciseId,
            creatorId: owner,
            dictionaryId,
            direction: 'source-to-target',
            shared: true,
            publicContent: exercise(),
            referenceTranslation: 'Hola.',
            generationPolicyVersion: 1,
            createdAt: now,
        });
        await db
            .insert(sentenceExerciseEntriesTable)
            .values({
                exerciseId,
                dictionaryId,
                entryId,
                learningVersion: 1,
                sourceText: 'hello',
                targetText: 'hola',
            });
        library = new DrizzleSentenceLibraryStore(db, {
            authorizeAdmin: async (tx, scope) => {
                await tx
                    .select({ id: usersTable.id })
                    .from(usersTable)
                    .where(eq(usersTable.id, scope.actorId))
                    .for('update');
            },
            onAdminMutation: async () => {},
        });
    });
    afterAll(async () => {
        await client?.end({ timeout: 5 });
    });

    it('rejects all-matching and selected confirmations after a linked word changes', async () => {
        const item = (await library.list(access(), query(), context()))
            .items[0]!;
        const snapshot = await library.snapshot(
            access(),
            {
                operation: 'archive',
                query: SentenceLibraryFiltersSchema.parse({
                    contentState: 'current',
                }),
            },
            context(),
        );
        await db
            .update(dictionaryCardsTable)
            .set({ learningVersion: 2, translation: 'buenas' })
            .where(eq(dictionaryCardsTable.id, entryId));
        const changed = (await library.list(access(), query(), context()))
            .items[0]!;
        expect(changed.version).not.toBe(item.version);
        expect(changed.contentState).toBe('outdated');
        for (const selection of [
            {
                type: 'selected' as const,
                items: [{ exerciseId, expectedVersion: item.version }],
            },
            {
                type: 'all-matching' as const,
                snapshotToken: snapshot.snapshotToken,
            },
        ]) {
            await expect(
                library.mutate(
                    access(),
                    {
                        operationId: randomUUID(),
                        operation: 'archive',
                        selection,
                    },
                    context(),
                ),
            ).rejects.toBeInstanceOf(SentenceConflictError);
        }
        expect(
            (await library.list(access(), query(), context())).items[0]!
                .personalArchivedAt,
        ).toBeNull();
    });
    it('pins live dictionary languages in selected confirmation versions', async () => {
        const before = (await library.list(access(), query(), context()))
            .items[0]!;
        await db
            .update(dictionariesTable)
            .set({ targetLanguageTag: 'fr' })
            .where(eq(dictionariesTable.id, dictionaryId));
        expect(
            (await library.list(access(), query(), context())).items[0]!
                .contentState,
        ).toBe('outdated');
        await expect(
            library.mutate(
                access(),
                {
                    operationId: randomUUID(),
                    operation: 'archive',
                    selection: {
                        type: 'selected',
                        items: [
                            { exerciseId, expectedVersion: before.version },
                        ],
                    },
                },
                context(),
            ),
        ).rejects.toBeInstanceOf(SentenceConflictError);
    });
    it('locks capacity before target rows during permanent deletion', async () => {
        const item = (await library.list(access(), query(), context()))
            .items[0]!;
        await library.mutate(
            access(),
            {
                operationId: randomUUID(),
                operation: 'archive',
                selection: {
                    type: 'selected',
                    items: [{ exerciseId, expectedVersion: item.version }],
                },
            },
            context(),
        );
        const archived = (
            await library.adminList(
                adminScope(),
                AdminSentenceLibraryQuerySchema.parse({
                    personalArchive: 'all',
                }),
                context(),
            )
        ).items[0]!;
        let held!: () => void;
        let proceed!: () => void;
        const capacityHeld = new Promise<void>((resolve) => {
            held = resolve;
        });
        const proceedPromise = new Promise<void>((resolve) => {
            proceed = resolve;
        });
        const admission = db.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            held();
            await proceedPromise;
            await tx.execute(sql`set local lock_timeout='1000ms'`);
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, owner))
                .for('update');
        });
        await capacityHeld;
        const deletion = library.adminMutate(
            adminScope(),
            {
                operationId: randomUUID(),
                operation: 'delete',
                reason: 'Synthetic safety verification',
                confirmation: 'delete-archived-examples',
                selection: {
                    type: 'selected',
                    items: [{ exerciseId, expectedVersion: archived.version }],
                },
            },
            context(),
        );
        try {
            await vi.waitFor(
                async () => {
                    const rows = await db.execute(
                        sql`select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event='advisory' and query like '%pg_advisory_xact_lock%'`,
                    );
                    expect(Number(rows[0]?.count)).toBeGreaterThan(0);
                },
                { timeout: 5000, interval: 20 },
            );
            proceed();
            await admission;
            expect((await deletion).affectedCount).toBe(1);
        } finally {
            proceed();
            await Promise.allSettled([admission, deletion]);
        }
    });
    it('caps confirmations per dictionary and actor, including concurrent creation', async () => {
        await Promise.all(
            Array.from({ length: 8 }, () =>
                library.snapshot(
                    access(),
                    {
                        operation: 'archive',
                        query: SentenceLibraryFiltersSchema.parse({}),
                    },
                    context(),
                ),
            ),
        );
        let rows = await db
            .select({ id: sentenceLibrarySnapshotsTable.id })
            .from(sentenceLibrarySnapshotsTable)
            .where(eq(sentenceLibrarySnapshotsTable.actorId, owner));
        expect(rows).toHaveLength(5);
        for (let i = 0; i < 5; i++) {
            const id = await dictionary();
            for (let j = 0; j < 5; j++)
                await library.snapshot(
                    { kind: 'owner', learnerId: owner, dictionaryId: id },
                    {
                        operation: 'archive',
                        query: SentenceLibraryFiltersSchema.parse({}),
                    },
                    context(),
                );
        }
        rows = await db
            .select({ id: sentenceLibrarySnapshotsTable.id })
            .from(sentenceLibrarySnapshotsTable)
            .where(eq(sentenceLibrarySnapshotsTable.actorId, owner));
        expect(rows).toHaveLength(25);
    });
    it('prunes at most 100 expired confirmations globally without content reads', async () => {
        const other = randomUUID();
        await db.insert(usersTable).values({ id: other, status: 'active' });
        await db.insert(sentenceLibrarySnapshotsTable).values(
            Array.from({ length: 110 }, () => ({
                id: randomUUID(),
                actorId: other,
                learnerId: other,
                dictionaryId,
                operation: 'archive',
                scope: 'personal',
                items: [],
                expiresAt: new Date(now.getTime() - 1),
            })),
        );
        await library.snapshot(
            access(),
            {
                operation: 'archive',
                query: SentenceLibraryFiltersSchema.parse({}),
            },
            context(),
        );
        const remaining = await db
            .select({ id: sentenceLibrarySnapshotsTable.id })
            .from(sentenceLibrarySnapshotsTable)
            .where(eq(sentenceLibrarySnapshotsTable.actorId, other));
        expect(remaining).toHaveLength(10);
    });
    it('rejects oversized matching sets before creating a confirmation', async () => {
        for (let offset = 0; offset < 10000; offset += 500) {
            await db.insert(sentenceExercisesTable).values(
                Array.from({ length: 500 }, () => {
                    const id = randomUUID();
                    return {
                        id,
                        creatorId: owner,
                        dictionaryId,
                        direction: 'source-to-target' as const,
                        shared: true,
                        publicContent: exercise(id),
                        referenceTranslation: 'Hola.',
                        generationPolicyVersion: 1,
                        createdAt: now,
                    };
                }),
            );
        }
        await expect(
            library.snapshot(
                access(),
                {
                    operation: 'archive',
                    query: SentenceLibraryFiltersSchema.parse({}),
                },
                context(),
            ),
        ).rejects.toBeInstanceOf(SentenceCapacityUnavailableError);
        expect(
            await db
                .select({ id: sentenceLibrarySnapshotsTable.id })
                .from(sentenceLibrarySnapshotsTable),
        ).toHaveLength(0);
    }, 20000);
});
