import {
    and,
    asc,
    desc,
    eq,
    gt,
    ilike,
    lt,
    or,
    sql,
    type SQL,
} from 'drizzle-orm';
import {
    DictionaryCardNotFoundError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import type {
    DictionaryPersistenceContext,
    QueryDatabase,
} from './dictionary-context';
import {
    abort,
    decodeCursor,
    encodeCursor,
    escapeLike,
    isCardCursor,
    isDictionaryCursor,
} from './dictionary-cursors';
import { readOwnedState } from './dictionary-aggregate-state';
import { iso, mapCard, mapOwned, mapSummary } from './dictionary-rows';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

export async function listDictionaries(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['listDictionaries']>[0],
) {
    abort(input.context);
    const cursor = decodeCursor(input.query.cursor, isDictionaryCursor);
    const conditions: SQL[] = [
        eq(dictionariesTable.ownerId, input.ownerId),
        eq(dictionariesTable.lifecycle, input.query.lifecycle),
    ];

    if (input.query.search)
        conditions.push(
            ilike(
                dictionariesTable.name,
                `%${escapeLike(input.query.search)}%`,
            ),
        );
    if (cursor) {
        const date = new Date(cursor.updatedAt);
        conditions.push(
            or(
                lt(dictionariesTable.updatedAt, date),
                and(
                    eq(dictionariesTable.updatedAt, date),
                    lt(dictionariesTable.id, cursor.id),
                ),
            )!,
        );
    }

    const rows = await context.database
        .select({
            activeCardCount: sql<number>`cast((select count(*) from ${dictionaryCardsTable} c where c.dictionary_id = ${dictionariesTable.id} and c.lifecycle = 'active') as integer)`,
            allCardCount: sql<number>`cast((select count(*) from ${dictionaryCardsTable} c where c.dictionary_id = ${dictionariesTable.id}) as integer)`,
            dictionary: dictionariesTable,
            settings: dictionarySettingsTable,
        })
        .from(dictionariesTable)
        .innerJoin(
            dictionarySettingsTable,
            eq(dictionarySettingsTable.dictionaryId, dictionariesTable.id),
        )
        .where(and(...conditions))
        .orderBy(desc(dictionariesTable.updatedAt), desc(dictionariesTable.id))
        .limit(input.query.limit + 1);

    abort(input.context);
    const page = rows.slice(0, input.query.limit);
    const last = page.at(-1);

    return {
        data: page.map((row) =>
            mapSummary(
                row.dictionary,
                row.settings,
                row.activeCardCount,
                row.allCardCount > 0,
            ),
        ),
        nextCursor:
            rows.length > input.query.limit && last
                ? encodeCursor({
                      id: last.dictionary.id,
                      updatedAt: iso(last.dictionary.updatedAt),
                  })
                : null,
    };
}

export function readDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['readDictionary']>[0],
) {
    abort(input.context);

    return readOwned(context.database, input.ownerId, input.dictionaryId);
}

export async function listCards(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['listCards']>[0],
) {
    return context.database.transaction(async (tx) => {
        abort(input.context);
        const current = await readOwnedState(
            tx,
            input.ownerId,
            input.dictionaryId,
        );
        const cursor = decodeCursor(input.query.cursor, isCardCursor);
        if (
            cursor &&
            (cursor.dictionaryVersion !== current.dictionary.version ||
                cursor.settingsVersion !== current.settings.version)
        ) {
            throw new DictionaryVersionConflictError();
        }

        const conditions: SQL[] = [
            eq(dictionaryCardsTable.dictionaryId, input.dictionaryId),
            eq(dictionaryCardsTable.lifecycle, input.query.lifecycle),
        ];

        if (input.query.search) {
            conditions.push(
                sql`to_tsvector('simple', coalesce(${dictionaryCardsTable.source}, '') || ' ' || coalesce(${dictionaryCardsTable.translation}, '') || ' ' || coalesce(${dictionaryCardsTable.definition}, '') || ' ' || coalesce(${dictionaryCardsTable.example}, '')) @@ websearch_to_tsquery('simple', ${input.query.search})`,
            );
        }

        if (cursor) {
            const key = BigInt(cursor.sortKey);
            conditions.push(
                or(
                    gt(dictionaryCardsTable.sortKey, key),
                    and(
                        eq(dictionaryCardsTable.sortKey, key),
                        gt(dictionaryCardsTable.id, cursor.id),
                    ),
                )!,
            );
        }

        const rows = await tx
            .select()
            .from(dictionaryCardsTable)
            .where(and(...conditions))
            .orderBy(
                asc(dictionaryCardsTable.sortKey),
                asc(dictionaryCardsTable.id),
            )
            .limit(input.query.limit + 1);
        const page = rows.slice(0, input.query.limit);
        const last = page.at(-1);

        return {
            data: page.map((row) => mapCard(row, current.settings)),
            dictionaryVersion: current.dictionary.version,
            nextCursor:
                rows.length > input.query.limit && last
                    ? encodeCursor({
                          dictionaryVersion: current.dictionary.version,
                          id: last.id,
                          settingsVersion: current.settings.version,
                          sortKey: last.sortKey.toString(),
                      })
                    : null,
            settingsVersion: current.settings.version,
        };
    });
}

export async function readCard(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['readCard']>[0],
) {
    return context.database.transaction(async (tx) => {
        abort(input.context);
        const current = await readOwnedState(
            tx,
            input.ownerId,
            input.dictionaryId,
        );
        const [row] = await tx
            .select()
            .from(dictionaryCardsTable)
            .where(
                and(
                    eq(dictionaryCardsTable.id, input.cardId),
                    eq(dictionaryCardsTable.dictionaryId, input.dictionaryId),
                ),
            )
            .limit(1);

        if (!row) throw new DictionaryCardNotFoundError();

        return {
            card: mapCard(row, current.settings),
            dictionaryVersion: current.dictionary.version,
        };
    });
}

export async function readOwned(
    database: QueryDatabase,
    ownerId: string,
    dictionaryId: string,
) {
    const [row] = await database
        .select({
            activeCardCount: sql<number>`cast((select count(*) from ${dictionaryCardsTable} c where c.dictionary_id = ${dictionariesTable.id} and c.lifecycle = 'active') as integer)`,
            allCardCount: sql<number>`cast((select count(*) from ${dictionaryCardsTable} c where c.dictionary_id = ${dictionariesTable.id}) as integer)`,
            dictionary: dictionariesTable,
            settings: dictionarySettingsTable,
        })
        .from(dictionariesTable)
        .innerJoin(
            dictionarySettingsTable,
            eq(dictionarySettingsTable.dictionaryId, dictionariesTable.id),
        )
        .where(
            and(
                eq(dictionariesTable.id, dictionaryId),
                eq(dictionariesTable.ownerId, ownerId),
            ),
        )
        .limit(1);

    if (!row) throw new DictionaryNotFoundError();

    return mapOwned(
        row.dictionary,
        row.settings,
        row.activeCardCount,
        row.allCardCount > 0,
    );
}

export async function readOwnedStateForExport(
    database: QueryDatabase,
    ownerId: string,
    dictionaryId: string,
) {
    const [row] = await database
        .select({
            dictionary: dictionariesTable,
            settings: dictionarySettingsTable,
        })
        .from(dictionariesTable)
        .innerJoin(
            dictionarySettingsTable,
            eq(dictionarySettingsTable.dictionaryId, dictionariesTable.id),
        )
        .where(
            and(
                eq(dictionariesTable.id, dictionaryId),
                eq(dictionariesTable.ownerId, ownerId),
            ),
        )
        .limit(1);

    if (!row) throw new DictionaryNotFoundError();

    return row;
}
