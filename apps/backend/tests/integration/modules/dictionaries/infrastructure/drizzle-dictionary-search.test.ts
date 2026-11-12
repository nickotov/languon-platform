import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { DictionaryNotFoundError } from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionaryCardPrefixQuery,
    dictionaryCardSearchDocument,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/dictionary-card-search';
import {
    dictionaryCardsTable,
    dictionariesTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const now = new Date('2026-11-12T12:00:00.000Z');
const context = () => ({ now, signal: new AbortController().signal });

function compactPlanFacts(plan: unknown) {
    const serialized = JSON.stringify(plan);

    return {
        actualRows: Array.from(
            serialized.matchAll(/"Actual Rows":(\d+)/g),
            (match) => Number(match[1]),
        ),
        executionMs: Array.from(
            serialized.matchAll(/"Execution Time":([\d.]+)/g),
            (match) => Number(match[1]),
        ),
        nodeTypes: Array.from(
            new Set(
                Array.from(
                    serialized.matchAll(/"Node Type":"([^"]+)"/g),
                    (match) => match[1],
                ),
            ),
        ),
        sharedHitBlocks: Array.from(
            serialized.matchAll(/"Shared Hit Blocks":(\d+)/g),
            (match) => Number(match[1]),
        ),
        usesSearchIndex: serialized.includes('dictionary_cards_search_idx'),
    };
}

run('DrizzleDictionaryStore search', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let store: DrizzleDictionaryStore;
    let ownerId: string;
    let otherOwnerId: string;

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        store = new DrizzleDictionaryStore(database, { generate: randomUUID });
    });

    beforeEach(async () => {
        await database.delete(usersTable);
        ownerId = randomUUID();
        otherOwnerId = randomUUID();
        await database.insert(usersTable).values([
            { createdAt: now, id: ownerId, status: 'active', updatedAt: now },
            {
                createdAt: now,
                id: otherOwnerId,
                status: 'active',
                updatedAt: now,
            },
        ]);
    });

    afterAll(async () => client.end());

    async function createDictionary(forOwnerId = ownerId) {
        return store.createDictionary({
            context: context(),
            fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
            idempotencyKey: `dictionary-search-${randomUUID()}`,
            ownerId: forOwnerId,
            request: {
                description: 'Search fixture',
                name: 'Search fixture',
                sourceLanguage: 'fr',
                targetLanguage: 'en',
            },
        });
    }

    async function insertCard(
        dictionaryId: string,
        sortKey: bigint,
        values: Partial<{
            definition: string | null;
            example: string | null;
            exampleTranslation: string | null;
            lifecycle: 'active' | 'archived';
            source: string;
            translation: string;
        }>,
    ) {
        const source = values.source ?? `source ${sortKey}`;
        const lifecycle = values.lifecycle ?? 'active';
        const id = randomUUID();
        await database.insert(dictionaryCardsTable).values({
            archivedAt: lifecycle === 'archived' ? now : null,
            authorship: 'human',
            createdAt: now,
            definition: values.definition ?? null,
            dictionaryId,
            example: values.example ?? null,
            exampleTranslation: values.exampleTranslation ?? null,
            id,
            lifecycle,
            normalizedSource: source.toLocaleLowerCase(),
            sortKey,
            source,
            translation: values.translation ?? `translation ${sortKey}`,
            updatedAt: now,
        });

        return id;
    }

    async function search(
        dictionaryId: string,
        value: string,
        options: {
            cursor?: string | null;
            lifecycle?: 'active' | 'archived';
            limit?: number;
        } = {},
    ) {
        return store.listCards({
            context: context(),
            dictionaryId,
            ownerId,
            query: {
                lifecycle: options.lifecycle ?? 'active',
                limit: options.limit ?? 50,
                search: value,
                ...(options.cursor ? { cursor: options.cursor } : {}),
            },
        });
    }

    it('matches case-insensitive word prefixes across every indexed field, including Unicode and apostrophes', async () => {
        const dictionary = await createDictionary();
        const source = await insertCard(dictionary.id, 1024n, {
            source: 'Bonjour',
        });
        const translation = await insertCard(dictionary.id, 2048n, {
            translation: 'Soleil',
        });
        const definition = await insertCard(dictionary.id, 3072n, {
            definition: 'A bright éclair.',
        });
        const example = await insertCard(dictionary.id, 4096n, {
            example: "L'enfant arrive.",
        });
        const exampleTranslation = await insertCard(dictionary.id, 5120n, {
            exampleTranslation: 'Good morning, friend.',
        });
        const unicode = await insertCard(dictionary.id, 6144n, {
            source: 'Приветствие',
        });

        await expect(search(dictionary.id, 'bon')).resolves.toMatchObject({
            data: [{ id: source }],
        });

        await expect(search(dictionary.id, 'SOL')).resolves.toMatchObject({
            data: [{ id: translation }],
        });

        await expect(search(dictionary.id, 'écl')).resolves.toMatchObject({
            data: [{ id: definition }],
        });

        await expect(search(dictionary.id, "l'enfant")).resolves.toMatchObject({
            data: [{ id: example }],
        });

        await expect(search(dictionary.id, 'morn')).resolves.toMatchObject({
            data: [{ id: exampleTranslation }],
        });

        await expect(search(dictionary.id, 'ПРИВ')).resolves.toMatchObject({
            data: [{ id: unicode }],
        });
    });

    it('treats punctuation and tsquery-looking input as literal parsed words, requiring every word prefix', async () => {
        const dictionary = await createDictionary();
        const bothWords = await insertCard(dictionary.id, 1024n, {
            source: 'Bonjour suite',
        });

        await insertCard(dictionary.id, 2048n, { source: 'Bonjour seulement' });
        await insertCard(dictionary.id, 3072n, { source: 'Suite seulement' });

        await expect(
            search(dictionary.id, 'bonjour; sui'),
        ).resolves.toMatchObject({
            data: [{ id: bothWords }],
        });

        await expect(
            search(dictionary.id, 'bonjour | absent'),
        ).resolves.toMatchObject({
            data: [],
        });

        await expect(search(dictionary.id, '!!! | &')).resolves.toMatchObject({
            data: [],
        });
    });

    it('preserves owner and lifecycle isolation and pages a new filter independently of prior pages', async () => {
        const dictionary = await createDictionary();
        const otherDictionary = await createDictionary(otherOwnerId);
        const first = await insertCard(dictionary.id, 1024n, {
            source: 'page first',
        });
        const second = await insertCard(dictionary.id, 2048n, {
            source: 'page second',
        });
        const third = await insertCard(dictionary.id, 3072n, {
            source: 'page third',
        });
        const fourth = await insertCard(dictionary.id, 4096n, {
            source: 'page fourth',
        });
        const newlyFiltered = await insertCard(dictionary.id, 5120n, {
            source: 'newfilter result',
        });
        const archived = await insertCard(dictionary.id, 6144n, {
            lifecycle: 'archived',
            source: 'page archived',
        });

        await insertCard(otherDictionary.id, 1024n, { source: 'page private' });

        const firstPage = await search(dictionary.id, 'page', { limit: 2 });
        expect(firstPage.data.map((card) => card.id)).toEqual([first, second]);
        expect(firstPage.nextCursor).not.toBeNull();

        const secondPage = await search(dictionary.id, 'page', {
            cursor: firstPage.nextCursor,
            limit: 2,
        });

        expect(secondPage.data.map((card) => card.id)).toEqual([third, fourth]);

        const newFilterFirstPage = await search(dictionary.id, 'newf', {
            limit: 2,
        });

        expect(newFilterFirstPage.data.map((card) => card.id)).toEqual([
            newlyFiltered,
        ]);

        await expect(
            search(dictionary.id, 'page', { lifecycle: 'archived' }),
        ).resolves.toMatchObject({ data: [{ id: archived }] });

        await expect(search(otherDictionary.id, 'page')).rejects.toBeInstanceOf(
            DictionaryNotFoundError,
        );

        await expect(
            database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, otherDictionary.id)),
        ).resolves.toHaveLength(1);
    });

    it('migrates the retained search index to the exact five-field document', async () => {
        const dictionary = await createDictionary();
        const cardId = await insertCard(dictionary.id, 1024n, {
            exampleTranslation: 'Translated sunrise example.',
            source: 'Migration fixture',
            translation: 'Fixture translation',
        });
        const before = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, cardId));

        await client.unsafe('drop index dictionary_cards_search_idx');
        await client.unsafe(`
            create index dictionary_cards_search_idx on dictionary_cards using gin (
                to_tsvector(
                    'simple',
                    coalesce(source, '') || ' ' || coalesce(translation, '') || ' ' ||
                    coalesce(definition, '') || ' ' || coalesce(example, '')
                )
            )
        `);

        const generatedMigration = await readFile(
            join(getMigrationsFolder(), '0168_faulty_thunderbird.sql'),
            'utf8',
        );

        await client.unsafe(generatedMigration);

        const [index] = await database.execute(sql`
            select pg_get_indexdef('dictionary_cards_search_idx'::regclass) as definition
        `);
        const after = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, cardId));

        expect(index?.definition).toContain('to_tsvector');
        expect(index?.definition).toContain('example_translation');
        expect(after).toEqual(before);
        await expect(search(dictionary.id, 'sunr')).resolves.toMatchObject({
            data: [{ id: cardId }],
        });

        await expect(migrateTestDatabase(client)).resolves.toBeUndefined();
    });

    it('executes representative 10,000-card search plans with other-owner rows', async () => {
        const dictionary = await createDictionary();
        const otherDictionary = await createDictionary(otherOwnerId);

        await database.execute(sql`
            insert into dictionary_cards (
                id, dictionary_id, authorship, normalized_source, sort_key,
                source, translation, created_at, updated_at
            )
            select
                ('10000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
                ${dictionary.id}::uuid,
                'human'::dictionary_card_authorship,
                case
                    when gs <= 9000 then 'commonword card ' || gs
                    when gs = 9001 then 'rareneedle card'
                    else 'neutral word ' || gs
                end,
                gs * 1024,
                case
                    when gs <= 9000 then 'commonword card ' || gs
                    when gs = 9001 then 'rareneedle card'
                    else 'neutral word ' || gs
                end,
                'translation ' || gs,
                ${now.toISOString()}::timestamptz,
                ${now.toISOString()}::timestamptz
            from generate_series(1, 10000) gs
        `);

        await database.execute(sql`
            insert into dictionary_cards (
                id, dictionary_id, authorship, normalized_source, sort_key,
                source, translation, created_at, updated_at
            )
            select
                ('20000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
                ${otherDictionary.id}::uuid,
                'human'::dictionary_card_authorship,
                'rareneedle private ' || gs,
                gs * 1024,
                'rareneedle private ' || gs,
                'translation ' || gs,
                ${now.toISOString()}::timestamptz,
                ${now.toISOString()}::timestamptz
            from generate_series(1, 250) gs
        `);

        await database.execute(sql`analyze ${dictionaryCardsTable}`);

        const explain = async (term: string) =>
            database.execute(sql`
                explain (analyze, buffers, format json)
                select *
                from ${dictionaryCardsTable}
                where ${dictionaryCardsTable.dictionaryId} = ${dictionary.id}::uuid
                  and ${dictionaryCardsTable.lifecycle} = 'active'
                  and ${dictionaryCardSearchDocument(dictionaryCardsTable)} @@ ${dictionaryCardPrefixQuery(term)}
                order by ${dictionaryCardsTable.sortKey}, ${dictionaryCardsTable.id}
                limit 51
            `);

        const plans = {
            common: await explain('commonword'),
            missing: await explain('notpresent'),
            prefixOne: await explain('c'),
            rare: await explain('rareneed'),
        };
        const facts = Object.fromEntries(
            Object.entries(plans).map(([name, plan]) => [
                name,
                compactPlanFacts(plan),
            ]),
        );

        expect(JSON.stringify(plans.rare)).toContain(
            'dictionary_cards_search_idx',
        );

        expect(JSON.stringify(plans.missing)).toContain(
            'dictionary_cards_search_idx',
        );

        expect(
            Object.values(facts).every(
                (plan) =>
                    plan.actualRows.length > 0 && plan.executionMs.length > 0,
            ),
        ).toBe(true);

        const measureStoreSearch = async (term: string) => {
            const startedAt = performance.now();
            const result = await search(dictionary.id, term, { limit: 50 });

            return {
                elapsedMs: performance.now() - startedAt,
                resultCount: result.data.length,
            };
        };
        const storeFacts = {
            common: await measureStoreSearch('commonword'),
            rare: await measureStoreSearch('rareneed'),
        };

        expect(storeFacts.common.resultCount).toBe(50);
        expect(storeFacts.rare.resultCount).toBe(1);
        console.info('dictionary-card search plan facts', {
            facts,
            storeFacts,
        });
    });
});
