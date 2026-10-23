import { and, count, eq, ne, sql, type SQL } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    DictionaryCardNotFoundError,
    DictionaryNotFoundError,
    DictionaryRateLimitError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import { assertDictionaryOwnerCapacity } from '../../../domain/limits';
import { dictionaryCardSortGap } from '../../../domain/ordering';
import type {
    DictionaryPersistenceContext,
    DictionaryRow,
    DictionaryTransaction,
    QueryDatabase,
} from './dictionary-context';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

export async function lockOwned(
    tx: DictionaryTransaction,
    ownerId: string,
    dictionaryId: string,
) {
    const [row] = await tx
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
        .limit(1)
        .for('update', { of: dictionariesTable });

    if (!row) throw new DictionaryNotFoundError();
    await tx
        .select({ dictionaryId: dictionarySettingsTable.dictionaryId })
        .from(dictionarySettingsTable)
        .where(eq(dictionarySettingsTable.dictionaryId, dictionaryId))
        .limit(1)
        .for('update');

    return row;
}

export async function readOwnedState(
    tx: DictionaryTransaction,
    ownerId: string,
    dictionaryId: string,
) {
    const [row] = await tx
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
        .limit(1)
        .for('share', { of: dictionariesTable });

    if (!row) throw new DictionaryNotFoundError();

    return row;
}

export async function readSettings(
    database: QueryDatabase,
    dictionaryId: string,
) {
    const [settings] = await database
        .select()
        .from(dictionarySettingsTable)
        .where(eq(dictionarySettingsTable.dictionaryId, dictionaryId))
        .limit(1);

    if (!settings) throw new DictionaryNotFoundError();

    return settings;
}

export async function lockCard(
    tx: DictionaryTransaction,
    dictionaryId: string,
    cardId: string,
) {
    const [row] = await tx
        .select()
        .from(dictionaryCardsTable)
        .where(
            and(
                eq(dictionaryCardsTable.id, cardId),
                eq(dictionaryCardsTable.dictionaryId, dictionaryId),
            ),
        )
        .limit(1)
        .for('update');

    if (!row) throw new DictionaryCardNotFoundError();

    return row;
}

export async function activeCardCount(
    database: QueryDatabase,
    dictionaryId: string,
): Promise<number> {
    const [row] = await database
        .select({ value: count() })
        .from(dictionaryCardsTable)
        .where(
            and(
                eq(dictionaryCardsTable.dictionaryId, dictionaryId),
                eq(dictionaryCardsTable.lifecycle, 'active'),
            ),
        );

    return row?.value ?? 0;
}

export async function acquireGlobalPermit(
    tx: DictionaryTransaction,
    operation: number,
    capacity: number,
): Promise<void> {
    for (let slot = 0; slot < capacity; slot += 1) {
        const [row] = await tx.execute(
            sql`select pg_try_advisory_xact_lock(1281979471, ${operation * 1000 + slot}) as acquired`,
        );

        if (row?.acquired === true) return;
    }

    throw new DictionaryRateLimitError(5);
}

export async function acquireOwnerPermit(
    tx: DictionaryTransaction,
    ownerId: string,
    operation: number,
): Promise<void> {
    const [row] = await tx.execute(
        sql`select pg_try_advisory_xact_lock(hashtext(${ownerId}), ${operation}) as acquired`,
    );

    if (row?.acquired !== true) throw new DictionaryRateLimitError(5);
}

export async function lockOwnerCapacity(
    tx: DictionaryTransaction,
    ownerId: string,
): Promise<void> {
    const [owner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, ownerId))
        .limit(1)
        .for('update');

    if (!owner) throw new DictionaryNotFoundError();
}

export async function assertOwnerCapacity(
    context: DictionaryPersistenceContext,
    tx: DictionaryTransaction,
    ownerId: string,
    additionalDictionaries: number,
    additionalCards: number,
    additionalRevisions = 0,
): Promise<void> {
    await lockOwnerCapacity(tx, ownerId);
    await assertOwnerCapacityLocked(
        context,
        tx,
        ownerId,
        additionalDictionaries,
        additionalCards,
        additionalRevisions,
    );
}

export async function assertOwnerCapacityLocked(
    context: DictionaryPersistenceContext,
    tx: DictionaryTransaction,
    ownerId: string,
    additionalDictionaries: number,
    additionalCards: number,
    additionalRevisions = 0,
): Promise<void> {
    const [dictionaryCountRow] = await tx
        .select({ value: count() })
        .from(dictionariesTable)
        .where(eq(dictionariesTable.ownerId, ownerId));
    const [cardCountRow] = await tx
        .select({ value: count() })
        .from(dictionaryCardsTable)
        .innerJoin(
            dictionariesTable,
            eq(dictionaryCardsTable.dictionaryId, dictionariesTable.id),
        )
        .where(eq(dictionariesTable.ownerId, ownerId));
    const [revisionCountRow] = await tx
        .select({ value: count() })
        .from(dictionaryCardRevisionsTable)
        .innerJoin(
            dictionariesTable,
            eq(dictionaryCardRevisionsTable.dictionaryId, dictionariesTable.id),
        )
        .where(eq(dictionariesTable.ownerId, ownerId));

    assertDictionaryOwnerCapacity(
        {
            cards: cardCountRow?.value ?? 0,
            dictionaries: dictionaryCountRow?.value ?? 0,
            revisions: revisionCountRow?.value ?? 0,
        },
        {
            cards: additionalCards,
            dictionaries: additionalDictionaries,
            revisions: additionalRevisions,
        },
        context.ownerLimits,
    );
}

export async function nextActiveSortKey(
    database: QueryDatabase,
    dictionaryId: string,
): Promise<bigint> {
    const [maximum] = await database
        .select({
            value: sql<
                string | null
            >`max(${dictionaryCardsTable.sortKey})::text`,
        })
        .from(dictionaryCardsTable)
        .where(
            and(
                eq(dictionaryCardsTable.dictionaryId, dictionaryId),
                eq(dictionaryCardsTable.lifecycle, 'active'),
            ),
        );

    return BigInt(maximum?.value ?? 0) + dictionaryCardSortGap;
}

export async function cardCount(
    database: QueryDatabase,
    dictionaryId: string,
): Promise<number> {
    const [row] = await database
        .select({ value: count() })
        .from(dictionaryCardsTable)
        .where(eq(dictionaryCardsTable.dictionaryId, dictionaryId));

    return row?.value ?? 0;
}

export async function sourceDuplicate(
    database: QueryDatabase,
    dictionaryId: string,
    source: string,
    excludeCardId?: string,
): Promise<boolean> {
    const conditions: SQL[] = [
        eq(dictionaryCardsTable.dictionaryId, dictionaryId),
        eq(dictionaryCardsTable.normalizedSource, source),
    ];

    if (excludeCardId)
        conditions.push(ne(dictionaryCardsTable.id, excludeCardId));
    const [match] = await database
        .select({ id: dictionaryCardsTable.id })
        .from(dictionaryCardsTable)
        .where(and(...conditions))
        .limit(1);

    return Boolean(match);
}

export async function bumpDictionary(
    tx: DictionaryTransaction,
    row: DictionaryRow,
    now: Date,
): Promise<number> {
    const [updated] = await tx
        .update(dictionariesTable)
        .set({ updatedAt: now, version: row.version + 1 })
        .where(
            and(
                eq(dictionariesTable.id, row.id),
                eq(dictionariesTable.ownerId, row.ownerId),
                eq(dictionariesTable.version, row.version),
            ),
        )
        .returning({ version: dictionariesTable.version });

    if (!updated) throw new DictionaryVersionConflictError();

    return updated.version;
}
