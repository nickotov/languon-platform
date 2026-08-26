import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { count, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import {
    DictionaryLanguagePairLockedError,
    DictionaryNotFoundError,
    DictionaryRateLimitError,
    DictionaryVersionConflictError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { DictionaryOwnerCapacityError } from '../../../../../src/modules/dictionaries/domain/limits';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionariesTable,
    dictionarySettingsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DictionaryCardCapacityError } from '../../../../../src/modules/dictionaries/domain/ordering';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const now = new Date('2026-08-21T12:00:00.000Z');
const context = () => ({ now, signal: new AbortController().signal });

run('DrizzleDictionaryStore', () => {
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
            {
                createdAt: now,
                id: ownerId,
                status: 'active',
                updatedAt: now,
            },
            {
                createdAt: now,
                id: otherOwnerId,
                status: 'active',
                updatedAt: now,
            },
        ]);
    }, 30_000);

    afterAll(async () => client.end());

    async function createDictionary(
        idempotencyKey = `dictionary-create-${randomUUID()}`,
    ) {
        return store.createDictionary({
            context: context(),
            fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
            idempotencyKey,
            ownerId,
            request: {
                description: 'Typed values',
                name: 'Core words',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            },
        });
    }

    it('persists typed current values and immutable validated revision snapshots with owner isolation', async () => {
        const dictionary = await createDictionary();
        const created = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                overrides: {
                    definitionEnabled: 'enabled',
                    definitionLanguage: 'target',
                    exampleEnabled: 'disabled',
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                    transcriptionCustomLabel: 'Learner notation',
                    transcriptionEnabled: 'disabled',
                    transcriptionNotation: 'custom',
                },
                values: {
                    source: 'plain',
                    translation: 'llano',
                    transcription: '/pleɪn/',
                    definition: 'inactive but preserved',
                    example: 'plain text',
                    exampleTranslation: 'texto sin formato',
                },
            },
        });

        expect(created.card.overrides).toMatchObject({
            exampleEnabled: 'disabled',
            transcriptionNotation: 'custom',
        });
        expect(created.card.effectiveSettings).toMatchObject({
            exampleEnabled: false,
            exampleTranslationEnabled: false,
            transcriptionEnabled: false,
        });
        expect(created.card.values).toMatchObject({
            definition: 'inactive but preserved',
            transcription: '/pleɪn/',
        });
        await expect(
            store.readDictionary({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId: otherOwnerId,
            }),
        ).rejects.toBeInstanceOf(DictionaryNotFoundError);

        const typed = await database
            .select({
                source: dictionaryCardsTable.source,
                definition: dictionaryCardsTable.definition,
                exampleEnabled: dictionaryCardsTable.exampleEnabledOverride,
            })
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, created.card.id));
        expect(typed).toEqual([
            {
                source: 'plain',
                definition: 'inactive but preserved',
                exampleEnabled: 'disabled',
            },
        ]);
        const revisions = await database
            .select()
            .from(dictionaryCardRevisionsTable)
            .where(eq(dictionaryCardRevisionsTable.cardId, created.card.id));
        expect(revisions).toHaveLength(1);
        expect(revisions[0]?.snapshot).toMatchObject({
            schemaVersion: 1,
            cardVersion: 1,
            rawOverrides: { exampleEnabled: 'disabled' },
            effectiveSettings: { exampleEnabled: false },
        });

        const updated = await store.updateCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            cardId: created.card.id,
            request: {
                expectedCardVersion: 1,
                expectedDictionaryVersion: created.dictionaryVersion,
                expectedSettingsVersion: 1,
                values: { translation: 'simple' },
            },
        });
        expect(updated.card.version).toBe(2);
        expect(
            await database
                .select()
                .from(dictionaryCardRevisionsTable)
                .where(
                    eq(dictionaryCardRevisionsTable.cardId, created.card.id),
                ),
        ).toHaveLength(2);
        await expect(
            database
                .update(dictionaryCardRevisionsTable)
                .set({ cardVersion: 1 })
                .where(
                    eq(dictionaryCardRevisionsTable.cardId, created.card.id),
                ),
        ).rejects.toMatchObject({ cause: { code: '23505' } });
    });

    it('exposes the required typed catalog constraints, foreign keys, and indexes without JSON current state', async () => {
        const columns = await database.execute(sql`
            select table_name, column_name, data_type, udt_name, is_nullable
            from information_schema.columns
            where table_schema = 'public'
              and table_name in ('dictionaries', 'dictionary_settings', 'dictionary_cards', 'dictionary_card_revisions')
        `);
        const column = (table: string, name: string) =>
            columns.find(
                (row) => row.table_name === table && row.column_name === name,
            );
        expect(column('dictionary_cards', 'source')).toMatchObject({
            data_type: 'text',
            is_nullable: 'NO',
        });
        expect(column('dictionary_cards', 'translation')).toMatchObject({
            data_type: 'text',
            is_nullable: 'NO',
        });
        expect(
            column('dictionary_cards', 'definition_enabled_override'),
        ).toMatchObject({ udt_name: 'dictionary_enablement' });
        expect(
            column('dictionary_cards', 'definition_language_role_override'),
        ).toMatchObject({ udt_name: 'dictionary_language_role' });
        expect(
            column('dictionary_cards', 'transcription_notation_override'),
        ).toMatchObject({ udt_name: 'dictionary_transcription_notation' });
        expect(
            column('dictionary_settings', 'definition_language_role'),
        ).toMatchObject({
            udt_name: 'dictionary_language_role',
            is_nullable: 'NO',
        });
        expect(
            columns
                .filter((row) =>
                    ['json', 'jsonb'].includes(String(row.data_type)),
                )
                .map((row) => [row.table_name, row.column_name]),
        ).toEqual([['dictionary_card_revisions', 'snapshot']]);

        const constraints = await database.execute(sql`
            select conname, contype
            from pg_constraint
            where conrelid in (
                'dictionaries'::regclass,
                'dictionary_settings'::regclass,
                'dictionary_cards'::regclass,
                'dictionary_card_revisions'::regclass
            )
        `);
        const names = constraints.map((row) => row.conname);
        expect(names).toEqual(
            expect.arrayContaining([
                'dictionary_cards_dictionary_id_dictionaries_id_fk',
                'dictionary_card_revisions_card_dictionary_fk',
                'dictionary_settings_dictionary_id_dictionaries_id_fk',
                'dictionary_cards_id_dictionary_unique',
                'dictionary_cards_required_values_length',
                'dictionary_card_revisions_positive_versions',
            ]),
        );
        const indexes = await database.execute(sql`
            select indexname from pg_indexes
            where schemaname = 'public'
              and tablename in ('dictionaries', 'dictionary_settings', 'dictionary_cards', 'dictionary_card_revisions')
        `);
        expect(indexes.map((row) => row.indexname)).toEqual(
            expect.arrayContaining([
                'dictionaries_owner_lifecycle_updated_idx',
                'dictionaries_share_locator_unique',
                'dictionary_cards_active_order_idx',
                'dictionary_cards_lifecycle_order_idx',
                'dictionary_cards_search_idx',
                'dictionary_card_revisions_card_revision_unique',
            ]),
        );
    });

    it('rejects stale dictionary, settings, and card versions without partial writes', async () => {
        const dictionary = await createDictionary();
        await expect(
            store.updateDictionary({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                request: {
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: 99,
                    settings: { definitionEnabled: true },
                },
            }),
        ).rejects.toBeInstanceOf(DictionaryVersionConflictError);
        await expect(
            store.readDictionary({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            settings: { values: { definitionEnabled: false }, version: 1 },
            version: 1,
        });

        const created = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                values: {
                    source: 'stable',
                    translation: 'estable',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides: {
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                },
            },
        });
        await expect(
            store.updateCard({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                cardId: created.card.id,
                request: {
                    expectedCardVersion: 99,
                    expectedDictionaryVersion: created.dictionaryVersion,
                    expectedSettingsVersion: 1,
                    values: { translation: 'changed' },
                },
            }),
        ).rejects.toBeInstanceOf(DictionaryVersionConflictError);
        await expect(
            store.readCard({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                cardId: created.card.id,
            }),
        ).resolves.toMatchObject({
            card: { values: { translation: 'estable' }, version: 1 },
            dictionaryVersion: created.dictionaryVersion,
        });
    });

    it('reports normalized duplicates across archived cards and reclaims expired idempotency keys', async () => {
        const dictionary = await createDictionary();
        const overrides = {
            transcriptionEnabled: null,
            transcriptionNotation: null,
            transcriptionCustomLabel: null,
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
        } as const;
        const first = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                values: {
                    source: 'Medium',
                    translation: 'medio',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides,
            },
        });
        const archived = await store.archiveCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            cardId: first.card.id,
            request: {
                expectedCardVersion: 1,
                expectedDictionaryVersion: first.dictionaryVersion,
            },
        });
        const second = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: archived.dictionaryVersion,
                expectedSettingsVersion: 1,
                values: {
                    source: 'ＭＥＤＩＵＭ',
                    translation: 'medio artístico',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides,
            },
        });
        expect(second.duplicateSource).toBe(true);

        const key = `dictionary-expiry-${randomUUID()}`;
        const original = await store.createDictionary({
            context: context(),
            fingerprint: `hmac-sha256:v1:${'D'.repeat(43)}`,
            idempotencyKey: key,
            ownerId,
            request: {
                description: null,
                name: 'Before expiry',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            },
        });
        const afterExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
        const replacement = await store.createDictionary({
            context: { now: afterExpiry, signal: context().signal },
            fingerprint: `hmac-sha256:v1:${'E'.repeat(43)}`,
            idempotencyKey: key,
            ownerId,
            request: {
                description: null,
                name: 'After expiry',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        expect(replacement.id).not.toBe(original.id);
        expect(replacement.name).toBe('After expiry');
    });

    it('allows a no-op save but rejects a semantic edit at the retained revision limit', async () => {
        const limitedStore = new DrizzleDictionaryStore(
            database,
            { generate: randomUUID },
            {
                ownerDictionaryCapacity: 100,
                ownerRetainedCardCapacity: 50_000,
                ownerRevisionCapacity: 1,
            },
        );
        const dictionary = await limitedStore.createDictionary({
            context: context(),
            fingerprint: `hmac-sha256:v1:${'G'.repeat(43)}`,
            idempotencyKey: `dictionary-limited-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'Revision boundary',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            },
        });
        const created = await limitedStore.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                values: {
                    source: 'same',
                    translation: 'igual',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides: {
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                },
            },
        });
        const noOp = await limitedStore.updateCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            cardId: created.card.id,
            request: {
                expectedCardVersion: created.card.version,
                expectedDictionaryVersion: created.dictionaryVersion,
                expectedSettingsVersion: dictionary.settings.version,
                values: { translation: 'igual' },
            },
        });
        expect(noOp.card.version).toBe(created.card.version);
        await expect(
            limitedStore.updateCard({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                cardId: created.card.id,
                request: {
                    expectedCardVersion: created.card.version,
                    expectedDictionaryVersion: created.dictionaryVersion,
                    expectedSettingsVersion: dictionary.settings.version,
                    values: { translation: 'distinto' },
                },
            }),
        ).rejects.toMatchObject({
            name: 'DictionaryOwnerCapacityError',
            resource: 'cards',
        });
    });

    it('serializes concurrent owner admission and counts archived dictionaries', async () => {
        const limitedStore = new DrizzleDictionaryStore(
            database,
            { generate: randomUUID },
            {
                ownerDictionaryCapacity: 1,
                ownerRetainedCardCapacity: 50_000,
                ownerRevisionCapacity: 250_000,
            },
        );
        const create = (suffix: string) =>
            limitedStore.createDictionary({
                context: context(),
                fingerprint: `hmac-sha256:v1:${suffix.repeat(43)}`,
                idempotencyKey: `dictionary-concurrent-${suffix}-${randomUUID()}`,
                ownerId,
                request: {
                    description: null,
                    name: `Concurrent ${suffix}`,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
            });
        const results = await Promise.allSettled([create('H'), create('I')]);
        const fulfilled = results.filter(
            (
                result,
            ): result is PromiseFulfilledResult<
                Awaited<ReturnType<typeof create>>
            > => result.status === 'fulfilled',
        );
        const rejected = results.filter(
            (result): result is PromiseRejectedResult =>
                result.status === 'rejected',
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toMatchObject({
            name: 'DictionaryOwnerCapacityError',
            resource: 'dictionaries',
        });

        const created = fulfilled[0]!.value;
        await limitedStore.archiveDictionary({
            context: context(),
            dictionaryId: created.id,
            ownerId,
            request: { expectedDictionaryVersion: created.version },
        });
        await expect(create('J')).rejects.toMatchObject({
            name: 'DictionaryOwnerCapacityError',
            resource: 'dictionaries',
        });
    });

    it('never selects revision JSON as the current-card query source', async () => {
        const dictionary = await createDictionary();
        const created = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                values: {
                    source: 'typed source',
                    translation: 'typed translation',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides: {
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                },
            },
        });
        await database.execute(
            sql`update dictionary_card_revisions set snapshot = '{"malformed":true}'::jsonb where card_id = ${created.card.id}`,
        );
        await expect(
            store.readCard({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                cardId: created.card.id,
            }),
        ).resolves.toMatchObject({
            card: {
                values: {
                    source: 'typed source',
                    translation: 'typed translation',
                },
            },
        });
        await expect(
            store.listCards({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                query: { lifecycle: 'active', limit: 50 },
            }),
        ).resolves.toMatchObject({
            data: [
                {
                    values: {
                        source: 'typed source',
                        translation: 'typed translation',
                    },
                },
            ],
        });
    });

    it('locks the language pair after any card including an archived card', async () => {
        const dictionary = await createDictionary();
        const created = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                values: {
                    source: 'one',
                    translation: 'uno',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides: {
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                },
            },
        });
        const archived = await store.archiveCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            cardId: created.card.id,
            request: {
                expectedCardVersion: 1,
                expectedDictionaryVersion: created.dictionaryVersion,
            },
        });
        await expect(
            store.updateDictionary({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                request: {
                    expectedDictionaryVersion: archived.dictionaryVersion,
                    sourceLanguage: 'fr',
                },
            }),
        ).rejects.toBeInstanceOf(DictionaryLanguagePairLockedError);
    });

    it('appends after the maximum active order when a middle card was archived', async () => {
        const dictionary = await createDictionary();
        const values = (source: string) => ({
            source,
            translation: `${source}-translated`,
            transcription: null,
            definition: null,
            example: null,
            exampleTranslation: null,
        });
        const overrides = {
            transcriptionEnabled: null,
            transcriptionNotation: null,
            transcriptionCustomLabel: null,
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
        } as const;
        const first = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                values: values('first'),
                overrides,
            },
        });
        const middle = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: first.dictionaryVersion,
                expectedSettingsVersion: 1,
                values: values('middle'),
                overrides,
            },
        });
        const last = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: middle.dictionaryVersion,
                expectedSettingsVersion: 1,
                values: values('last'),
                overrides,
            },
        });
        const archived = await store.archiveCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            cardId: middle.card.id,
            request: {
                expectedCardVersion: 1,
                expectedDictionaryVersion: last.dictionaryVersion,
            },
        });
        const appended = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: archived.dictionaryVersion,
                expectedSettingsVersion: 1,
                values: values('appended'),
                overrides,
            },
        });
        const cards = await store.listCards({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            query: { lifecycle: 'active', limit: 50 },
        });
        expect(cards.data.map(({ id }) => id)).toEqual([
            first.card.id,
            last.card.id,
            appended.card.id,
        ]);
        expect(new Set(cards.data.map(({ position }) => position)).size).toBe(
            3,
        );
    });

    it('supports indexed search, retry-safe create, reorder, publication revocation, and independent forks', async () => {
        const key = `dictionary-create-${randomUUID()}`;
        const dictionary = await createDictionary(key);
        const replay = await createDictionary(key);
        expect(replay.id).toBe(dictionary.id);
        const first = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                values: {
                    source: 'orchard apple',
                    translation: 'manzana',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides: {
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                },
            },
        });
        const second = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: first.dictionaryVersion,
                expectedSettingsVersion: 1,
                values: {
                    source: 'river',
                    translation: 'río',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides: {
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                },
            },
        });
        const third = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: second.dictionaryVersion,
                expectedSettingsVersion: 1,
                values: {
                    source: 'mountain',
                    translation: 'montaña',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides: {
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                },
            },
        });
        const search = await store.listCards({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            query: { lifecycle: 'active', limit: 50, search: 'orchard' },
        });
        expect(search.data.map(({ id }) => id)).toEqual([first.card.id]);
        const reordered = await store.reorderCards({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: third.dictionaryVersion,
                orderedCardIds: [second.card.id, first.card.id],
            },
        });
        expect(
            (
                await store.listCards({
                    context: context(),
                    dictionaryId: dictionary.id,
                    ownerId,
                    query: { lifecycle: 'active', limit: 2 },
                })
            ).data.map(({ id }) => id),
        ).toEqual([second.card.id, first.card.id]);
        await expect(
            store.reorderCards({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                request: {
                    expectedDictionaryVersion: reordered.dictionaryVersion,
                    orderedCardIds: [second.card.id, third.card.id],
                },
            }),
        ).rejects.toMatchObject({ name: 'InvalidDictionaryRequestError' });

        const published = await store.rotateShare({
            context: context(),
            digest: `hmac-sha256:v1:${'B'.repeat(43)}`,
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: reordered.dictionaryVersion,
            keyVersion: 1,
            locator: 'abcdefghijklmnopqrstuvwxyz123456',
            ownerId,
        });
        const fork = await store.forkSharedDictionary({
            context: context(),
            fingerprint: `hmac-sha256:v1:${'C'.repeat(43)}`,
            idempotencyKey: `dictionary-fork-${randomUUID()}`,
            ownerId: otherOwnerId,
            request: { name: 'Independent copy' },
            sourceDictionaryId: dictionary.id,
            verifiedShareDigest: `hmac-sha256:v1:${'B'.repeat(43)}`,
        });
        expect(fork).toMatchObject({
            name: 'Independent copy',
            sourceDictionaryId: dictionary.id,
            visibility: 'private',
        });
        expect(fork).not.toHaveProperty('ownerId');
        const forkCards = await store.listCards({
            context: context(),
            dictionaryId: fork.id,
            ownerId: otherOwnerId,
            query: { lifecycle: 'active', limit: 50 },
        });
        expect(forkCards.data.map(({ id }) => id)).not.toEqual([
            second.card.id,
            first.card.id,
            third.card.id,
        ]);
        expect(forkCards.data.map(({ values }) => values.source)).toEqual([
            'river',
            'orchard apple',
            'mountain',
        ]);
        const archived = await store.archiveDictionary({
            context: context(),
            dictionaryId: published.id,
            ownerId,
            request: { expectedDictionaryVersion: published.version },
        });
        expect(archived.visibility).toBe('private');
        expect(
            await store.findSharedCandidate({
                context: context(),
                shareId: 'abcdefghijklmnopqrstuvwxyz123456',
            }),
        ).toBeNull();
        const indexes = await database.execute(
            sql`select indexname from pg_indexes where tablename = 'dictionary_cards'`,
        );
        expect(indexes.map((row) => row.indexname)).toContain(
            'dictionary_cards_search_idx',
        );
        expect(
            await database
                .select()
                .from(dictionarySettingsTable)
                .where(eq(dictionarySettingsTable.dictionaryId, fork.id)),
        ).toHaveLength(1);
    });

    it('rejects owner and public continuation cursors after the aggregate changes', async () => {
        const dictionary = await createDictionary();
        const overrides = {
            transcriptionEnabled: null,
            transcriptionNotation: null,
            transcriptionCustomLabel: null,
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
        } as const;
        const values = (source: string) => ({
            source,
            translation: `${source} translated`,
            transcription: null,
            definition: null,
            example: null,
            exampleTranslation: null,
        });
        const first = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                overrides,
                values: values('first'),
            },
        });
        const second = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: first.dictionaryVersion,
                expectedSettingsVersion: dictionary.settings.version,
                overrides,
                values: values('second'),
            },
        });
        const digest = `hmac-sha256:v1:${'F'.repeat(43)}`;
        const published = await store.rotateShare({
            context: context(),
            digest,
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: second.dictionaryVersion,
            keyVersion: 1,
            locator: 'pagination-snapshot-locator-123',
            ownerId,
        });
        const ownerPage = await store.listCards({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            query: { lifecycle: 'active', limit: 1 },
        });
        const publicPage = await store.readSharedDictionary({
            context: context(),
            dictionaryId: dictionary.id,
            query: { limit: 1 },
            verifiedShareDigest: digest,
        });
        expect(ownerPage.nextCursor).not.toBeNull();
        expect(publicPage.nextCursor).not.toBeNull();

        await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: published.version,
                expectedSettingsVersion: dictionary.settings.version,
                overrides,
                values: values('third'),
            },
        });

        await expect(
            store.listCards({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                query: {
                    cursor: ownerPage.nextCursor!,
                    lifecycle: 'active',
                    limit: 1,
                },
            }),
        ).rejects.toBeInstanceOf(DictionaryVersionConflictError);
        await expect(
            store.readSharedDictionary({
                context: context(),
                dictionaryId: dictionary.id,
                query: { cursor: publicPage.nextCursor!, limit: 1 },
                verifiedShareDigest: digest,
            }),
        ).rejects.toBeInstanceOf(DictionaryVersionConflictError);
    });

    it('keeps the 10,000-card boundary indexed, reorderable, and forkable without oversized responses', async () => {
        const dictionary = await createDictionary();
        await database.execute(sql`
            insert into dictionary_cards (
                id, dictionary_id, authorship, normalized_source, sort_key,
                source, translation, created_at, updated_at
            )
            select
                ('00000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
                ${dictionary.id}::uuid,
                'human'::dictionary_card_authorship,
                'term ' || gs,
                gs * 1024,
                'term ' || gs,
                'translation ' || gs,
                ${now.toISOString()}::timestamptz,
                ${now.toISOString()}::timestamptz
            from generate_series(1, 10000) gs
        `);
        const firstPage = await store.listCards({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            query: { lifecycle: 'active', limit: 100 },
        });
        expect(firstPage.data).toHaveLength(100);
        expect(firstPage.nextCursor).not.toBeNull();
        const plan = await database.execute(sql`
            explain (format json)
            select * from dictionary_cards
            where dictionary_id = ${dictionary.id}::uuid and lifecycle = 'active'
            order by sort_key, id
            limit 101
        `);
        expect(JSON.stringify(plan)).toContain(
            'dictionary_cards_active_order_idx',
        );

        const orderedCardIds = Array.from(
            { length: 10_000 },
            (_, index) =>
                `00000000-0000-4000-8000-${String(10_000 - index).padStart(12, '0')}`,
        );
        const reordered = await store.reorderCards({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: { expectedDictionaryVersion: 1, orderedCardIds },
        });
        await expect(
            store.createCard({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                request: {
                    expectedDictionaryVersion: reordered.dictionaryVersion,
                    expectedSettingsVersion: 1,
                    values: {
                        source: 'overflow',
                        translation: 'desbordamiento',
                        transcription: null,
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                    },
                    overrides: {
                        transcriptionEnabled: null,
                        transcriptionNotation: null,
                        transcriptionCustomLabel: null,
                        definitionEnabled: null,
                        definitionLanguage: null,
                        exampleEnabled: null,
                        exampleLanguage: null,
                        exampleTranslationEnabled: null,
                    },
                },
            }),
        ).rejects.toBeInstanceOf(DictionaryCardCapacityError);

        const published = await store.rotateShare({
            context: context(),
            digest: `hmac-sha256:v1:${'F'.repeat(43)}`,
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: reordered.dictionaryVersion,
            keyVersion: 1,
            locator: 'scaleabcdefghijklmnopqrstuvwxyz12',
            ownerId,
        });
        const publicPage = await store.readSharedDictionary({
            context: context(),
            dictionaryId: dictionary.id,
            query: { limit: 25 },
            verifiedShareDigest: `hmac-sha256:v1:${'F'.repeat(43)}`,
        });
        expect(publicPage.dictionary.cards).toHaveLength(25);
        expect(publicPage.nextCursor).not.toBeNull();
        const fork = await store.forkSharedDictionary({
            context: context(),
            fingerprint: `hmac-sha256:v1:${'G'.repeat(43)}`,
            idempotencyKey: `scale-fork-${randomUUID()}`,
            ownerId: otherOwnerId,
            request: { name: 'Scale copy' },
            sourceDictionaryId: published.id,
            verifiedShareDigest: `hmac-sha256:v1:${'F'.repeat(43)}`,
        });
        await expect(
            store.listCards({
                context: context(),
                dictionaryId: fork.id,
                ownerId: otherOwnerId,
                query: { lifecycle: 'active', limit: 1 },
            }),
        ).resolves.toMatchObject({
            data: [{ values: { source: 'term 10000' } }],
        });
    }, 60_000);

    it('fails closed when all global fork permits are held', async () => {
        const dictionary = await createDictionary();
        const published = await store.rotateShare({
            context: context(),
            digest: `hmac-sha256:v1:${'H'.repeat(43)}`,
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: dictionary.version,
            keyVersion: 1,
            locator: 'concurrencyabcdefghijklmnopq',
            ownerId,
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const ready = Array.from({ length: 4 }, () => {
            let resolve!: () => void;
            const promise = new Promise<void>((done) => {
                resolve = done;
            });
            return { promise, resolve };
        });
        const holderClients = ready.map(() => createTestPostgresClient());
        const holderDatabases = holderClients.map((holderClient) =>
            createDrizzleDatabase(holderClient, databaseSchema),
        );
        const ownerBlockerClient = createTestPostgresClient();
        const ownerBlockerDatabase = createDrizzleDatabase(
            ownerBlockerClient,
            databaseSchema,
        );
        let releaseOwner!: () => void;
        let ownerLocked!: () => void;
        const ownerReleased = new Promise<void>((resolve) => {
            releaseOwner = resolve;
        });
        const ownerReady = new Promise<void>((resolve) => {
            ownerLocked = resolve;
        });
        const ownerBlocker = ownerBlockerDatabase.transaction(async (tx) => {
            await tx.execute(
                sql`select id from users where id = ${otherOwnerId}::uuid for update`,
            );
            ownerLocked();
            await ownerReleased;
        });
        const holders = ready.map((slot, index) =>
            holderDatabases[index]!.transaction(async (tx) => {
                await tx.execute(
                    sql`select pg_advisory_xact_lock(1281979471, ${2000 + index})`,
                );
                slot.resolve();
                await released;
            }),
        );
        await Promise.all([ownerReady, ...ready.map(({ promise }) => promise)]);
        const attempt = store
            .forkSharedDictionary({
                context: context(),
                fingerprint: `hmac-sha256:v1:${'I'.repeat(43)}`,
                idempotencyKey: `blocked-fork-${randomUUID()}`,
                ownerId: otherOwnerId,
                request: {},
                sourceDictionaryId: published.id,
                verifiedShareDigest: `hmac-sha256:v1:${'H'.repeat(43)}`,
            })
            .then(
                () => ({ status: 'resolved' as const }),
                (error: unknown) => ({ error, status: 'rejected' as const }),
            );
        try {
            const outcome = await Promise.race([
                attempt,
                new Promise<{ status: 'timeout' }>((resolve) => {
                    setTimeout(() => resolve({ status: 'timeout' }), 500);
                }),
            ]);
            expect(outcome.status).toBe('rejected');
            if (outcome.status === 'rejected') {
                expect(outcome.error).toBeInstanceOf(DictionaryRateLimitError);
            }
        } finally {
            releaseOwner();
            await ownerBlocker;
            release();
            await Promise.all(holders);
            await Promise.all(holderClients.map((holder) => holder.end()));
            await ownerBlockerClient.end();
            await attempt;
        }
    }, 15_000);

    it('does not commit a card after the caller aborts while waiting for a lock', async () => {
        const dictionary = await createDictionary();
        let release!: () => void;
        let locked!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const lockReady = new Promise<void>((resolve) => {
            locked = resolve;
        });
        const blockerClient = createTestPostgresClient();
        const blockerDatabase = createDrizzleDatabase(
            blockerClient,
            databaseSchema,
        );
        const blocker = blockerDatabase.transaction(async (tx) => {
            await tx.execute(
                sql`select id from dictionaries where id = ${dictionary.id}::uuid for update`,
            );
            locked();
            await released;
        });
        await lockReady;
        const controller = new AbortController();
        const pending = store.createCard({
            context: { now, signal: controller.signal },
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                values: {
                    source: 'cancelled',
                    translation: 'cancelado',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                overrides: {
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 25));
        const rejected = expect(pending).rejects.toMatchObject({
            name: 'AbortError',
        });
        controller.abort();
        release();
        await Promise.all([blocker, rejected]);
        await blockerClient.end();
        await expect(
            store.listCards({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
                query: { lifecycle: 'active', limit: 1 },
            }),
        ).resolves.toMatchObject({ data: [], dictionaryVersion: 1 });
    }, 15_000);

    it('atomically imports ordered human cards and replays the exact persisted result', async () => {
        const idempotencyKey = `dictionary-import-${randomUUID()}`;
        const input = {
            context: context(),
            fingerprint: `hmac-sha256:v1:${'B'.repeat(43)}`,
            idempotencyKey,
            ownerId,
            rows: [
                { rowIndex: 0, source: 'Bank', translation: 'Banco' },
                { rowIndex: 2, source: 'bank', translation: 'Orilla' },
            ],
            target: {
                description: 'Imported rows',
                kind: 'new' as const,
                name: 'Imported',
                sourceLanguage: 'en' as const,
                targetLanguage: 'es' as const,
            },
        };
        const imported = await store.importDictionary(input);
        const replayed = await store.importDictionary({
            ...input,
            context: context(),
        });

        expect(imported).toEqual(replayed);
        expect(imported).toMatchObject({
            mode: 'deterministic',
            dictionary: { activeCardCount: 2, version: 1 },
            warnings: [
                {
                    code: 'duplicate_source',
                    duplicateCardId: null,
                    duplicateRowIndex: 0,
                    rowIndex: 2,
                },
            ],
        });
        const cards = await database
            .select()
            .from(dictionaryCardsTable)
            .where(
                eq(dictionaryCardsTable.dictionaryId, imported.dictionary.id),
            );
        expect(cards).toHaveLength(2);
        expect(cards.map((card) => card.authorship)).toEqual([
            'human',
            'human',
        ]);
        expect(
            await database
                .select()
                .from(dictionaryCardRevisionsTable)
                .where(
                    eq(
                        dictionaryCardRevisionsTable.dictionaryId,
                        imported.dictionary.id,
                    ),
                ),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    authorship: 'human',
                    mutationKind: 'deterministic_import',
                }),
            ]),
        );
    });

    it('commits and exactly replays the maximum duplicate-heavy deterministic import', async () => {
        const input = {
            context: context(),
            fingerprint: `hmac-sha256:v1:${'J'.repeat(43)}`,
            idempotencyKey: `dictionary-import-${randomUUID()}`,
            ownerId,
            rows: Array.from({ length: 10_000 }, (_, rowIndex) => ({
                rowIndex,
                source: 'same',
                translation: 'igual',
            })),
            target: {
                description: null,
                kind: 'new' as const,
                name: 'Maximum duplicate import',
                sourceLanguage: 'en' as const,
                targetLanguage: 'es' as const,
            },
        };

        const imported = await store.importDictionary(input);
        const replayed = await store.importDictionary({
            ...input,
            context: context(),
        });

        expect(JSON.stringify(imported).length).toBeGreaterThan(2_097_152);
        expect(replayed).toEqual(imported);
        expect(imported.cards).toHaveLength(10_000);
        expect(imported.warnings).toHaveLength(9_999);
        const [counts] = await database
            .select({
                cards: count(dictionaryCardsTable.id),
                revisions: count(dictionaryCardRevisionsTable.id),
            })
            .from(dictionaryCardsTable)
            .innerJoin(
                dictionaryCardRevisionsTable,
                eq(
                    dictionaryCardRevisionsTable.cardId,
                    dictionaryCardsTable.id,
                ),
            )
            .where(
                eq(dictionaryCardsTable.dictionaryId, imported.dictionary.id),
            );
        expect(counts).toEqual({ cards: 10_000, revisions: 10_000 });
    }, 60_000);

    it('rejects an over-capacity import without creating a dictionary, card, or revision', async () => {
        const bounded = new DrizzleDictionaryStore(
            database,
            { generate: randomUUID },
            {
                ownerDictionaryCapacity: 100,
                ownerRetainedCardCapacity: 1,
                ownerRevisionCapacity: 1,
            },
        );
        await expect(
            bounded.previewDictionaryImport({
                context: context(),
                ownerId,
                rows: [
                    { rowIndex: 0, source: 'one', translation: 'uno' },
                    { rowIndex: 1, source: 'two', translation: 'dos' },
                ],
                target: {
                    description: null,
                    kind: 'new',
                    name: 'Too large',
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
            }),
        ).resolves.toMatchObject({ remainingRows: 1 });
        await expect(
            bounded.importDictionary({
                context: context(),
                fingerprint: `hmac-sha256:v1:${'C'.repeat(43)}`,
                idempotencyKey: `dictionary-import-${randomUUID()}`,
                ownerId,
                rows: [
                    { rowIndex: 0, source: 'one', translation: 'uno' },
                    { rowIndex: 1, source: 'two', translation: 'dos' },
                ],
                target: {
                    description: null,
                    kind: 'new',
                    name: 'Too large',
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
            }),
        ).rejects.toBeInstanceOf(DictionaryOwnerCapacityError);
        const [dictionaryCount] = await database
            .select({ value: count() })
            .from(dictionariesTable)
            .where(eq(dictionariesTable.ownerId, ownerId));
        expect(dictionaryCount?.value).toBe(0);
        expect(await database.select().from(dictionaryCardsTable)).toHaveLength(
            0,
        );
        expect(
            await database.select().from(dictionaryCardRevisionsTable),
        ).toHaveLength(0);
    });

    it('serializes concurrent existing-target imports so only one expected version commits', async () => {
        const dictionary = await createDictionary();
        const commit = (source: string, fingerprintCharacter: string) =>
            store.importDictionary({
                context: context(),
                fingerprint: `hmac-sha256:v1:${fingerprintCharacter.repeat(43)}`,
                idempotencyKey: `dictionary-import-${randomUUID()}`,
                ownerId,
                rows: [{ rowIndex: 0, source, translation: `${source}-es` }],
                target: {
                    dictionaryId: dictionary.id,
                    expectedDictionaryVersion: 1,
                    expectedSettingsVersion: 1,
                    kind: 'existing' as const,
                },
            });
        const settled = await Promise.allSettled([
            commit('first', 'D'),
            commit('second', 'E'),
        ]);

        expect(
            settled.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const rejected = settled.find((result) => result.status === 'rejected');
        expect(rejected).toMatchObject({
            reason: expect.any(DictionaryVersionConflictError),
        });
        const cards = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.dictionaryId, dictionary.id));
        expect(cards).toHaveLength(1);
        await expect(
            store.readDictionary({
                context: context(),
                dictionaryId: dictionary.id,
                ownerId,
            }),
        ).resolves.toMatchObject({ activeCardCount: 1, version: 2 });
    });

    it('replays an existing-target import after the target is archived', async () => {
        const dictionary = await createDictionary();
        const input = {
            context: context(),
            fingerprint: `hmac-sha256:v1:${'F'.repeat(43)}`,
            idempotencyKey: `dictionary-import-${randomUUID()}`,
            ownerId,
            rows: [{ rowIndex: 0, source: 'bank', translation: 'banco' }],
            target: {
                dictionaryId: dictionary.id,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                kind: 'existing' as const,
            },
        };
        const imported = await store.importDictionary(input);
        await store.archiveDictionary({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: imported.dictionary.version,
            },
        });

        await expect(
            store.authorizeDictionaryImportTarget({
                context: context(),
                ownerId,
                requireExpectedVersions: false,
                target: input.target,
            }),
        ).resolves.toBeUndefined();
        await expect(
            store.importDictionary({ ...input, context: context() }),
        ).resolves.toEqual(imported);
    });

    it('warns for archived retained sources while exporting only active cards in order', async () => {
        const dictionary = await createDictionary();
        const first = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                overrides: {
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                    transcriptionCustomLabel: null,
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                },
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'retained',
                    transcription: null,
                    translation: 'retenido',
                },
            },
        });
        const second = await store.createCard({
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: first.dictionaryVersion,
                expectedSettingsVersion: 1,
                overrides: first.card.overrides,
                values: {
                    ...first.card.values,
                    source: 'active',
                    translation: 'activo',
                },
            },
        });
        const archived = await store.archiveCard({
            cardId: first.card.id,
            context: context(),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedCardVersion: first.card.version,
                expectedDictionaryVersion: second.dictionaryVersion,
            },
        });
        const preview = await store.previewDictionaryImport({
            context: context(),
            ownerId,
            rows: [
                { rowIndex: 0, source: 'RETAINED', translation: 'guardado' },
            ],
            target: {
                dictionaryId: dictionary.id,
                expectedDictionaryVersion: archived.dictionaryVersion,
                expectedSettingsVersion: 1,
                kind: 'existing',
            },
        });
        const exported: string[] = [];
        await store.streamDictionaryExport({
            context: context(),
            dictionaryId: dictionary.id,
            format: 'quizlet-text',
            onCards: async (cards) => {
                exported.push(...cards.map((card) => card.values.source));
            },
            onMetadata: async () => undefined,
            ownerId,
        });

        expect(preview).toMatchObject({ remainingRows: 9_999 });
        expect(preview.warnings).toEqual([
            expect.objectContaining({
                duplicateCardId: first.card.id,
                duplicateRowIndex: null,
            }),
        ]);
        expect(exported).toEqual(['active']);
    });
});
