import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
    DictionaryVersionConflictError,
    InvalidDictionaryRequestError,
} from '../../../application/dictionary-errors';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import { assertDictionaryCardCapacity } from '../../../domain/ordering';
import type { DictionaryPersistenceContext } from './dictionary-context';
import { abort } from './dictionary-cursors';
import {
    acquireGlobalPermit,
    activeCardCount,
    bumpDictionary,
    cardCount,
    lockCard,
    lockOwned,
    nextActiveSortKey,
} from './dictionary-aggregate-state';
import { readOwned } from './dictionary-queries';
import { mapCard, mapOwned } from './dictionary-rows';
import { dictionariesTable, dictionaryCardsTable } from './schema';

export function archiveDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['archiveDictionary']>[0],
) {
    return dictionaryLifecycle(context, input, 'archived');
}

export function restoreDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['restoreDictionary']>[0],
) {
    return dictionaryLifecycle(context, input, 'active');
}

export function archiveCard(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['archiveCard']>[0],
) {
    return cardLifecycle(context, input, 'archived');
}

export function restoreCard(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['restoreCard']>[0],
) {
    return cardLifecycle(context, input, 'active');
}

export async function dictionaryLifecycle(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['archiveDictionary']>[0],
    lifecycle: 'active' | 'archived',
) {
    return context.database.transaction(async (tx) => {
        const current = await lockOwned(tx, input.ownerId, input.dictionaryId);
        abort(input.context);
        if (
            current.dictionary.version !==
            input.request.expectedDictionaryVersion
        )
            throw new DictionaryVersionConflictError();
        if (current.dictionary.lifecycle === lifecycle)
            return mapOwned(
                current.dictionary,
                current.settings,
                await activeCardCount(tx, input.dictionaryId),
                (await cardCount(tx, input.dictionaryId)) > 0,
            );
        await tx
            .update(dictionariesTable)
            .set({
                archivedAt: lifecycle === 'archived' ? input.context.now : null,
                lifecycle,
                shareKeyDigest: null,
                shareKeyRotatedAt: null,
                shareKeyVersion: null,
                shareLocator: null,
                updatedAt: input.context.now,
                version: current.dictionary.version + 1,
                visibility: 'private',
            })
            .where(
                and(
                    eq(dictionariesTable.id, input.dictionaryId),
                    eq(dictionariesTable.ownerId, input.ownerId),
                    eq(dictionariesTable.version, current.dictionary.version),
                ),
            );

        return readOwned(tx, input.ownerId, input.dictionaryId);
    });
}

export async function cardLifecycle(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['archiveCard']>[0],
    lifecycle: 'active' | 'archived',
) {
    return context.database.transaction(async (tx) => {
        const current = await lockOwned(tx, input.ownerId, input.dictionaryId);
        if (
            current.dictionary.version !==
            input.request.expectedDictionaryVersion
        )
            throw new DictionaryVersionConflictError();
        const row = await lockCard(tx, input.dictionaryId, input.cardId);
        abort(input.context);
        if (row.version !== input.request.expectedCardVersion)
            throw new DictionaryVersionConflictError();
        if (row.lifecycle === lifecycle)
            return {
                card: mapCard(row, current.settings),
                dictionaryVersion: current.dictionary.version,
            };
        if (lifecycle === 'active')
            assertDictionaryCardCapacity(
                (await activeCardCount(tx, input.dictionaryId)) + 1,
            );
        let restoredSortKey = row.sortKey;
        if (lifecycle === 'active') {
            restoredSortKey = await nextActiveSortKey(tx, input.dictionaryId);
        }

        const [updated] = await tx
            .update(dictionaryCardsTable)
            .set({
                archivedAt: lifecycle === 'archived' ? input.context.now : null,
                lifecycle,
                sortKey: restoredSortKey,
                updatedAt: input.context.now,
                version: row.version + 1,
            })
            .where(
                and(
                    eq(dictionaryCardsTable.id, row.id),
                    eq(dictionaryCardsTable.dictionaryId, row.dictionaryId),
                    eq(dictionaryCardsTable.version, row.version),
                ),
            )
            .returning();

        if (!updated) throw new DictionaryVersionConflictError();

        return {
            card: mapCard(updated, current.settings),
            dictionaryVersion: await bumpDictionary(
                tx,
                current.dictionary,
                input.context.now,
            ),
        };
    });
}

export async function reorderCards(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['reorderCards']>[0],
) {
    return context.database.transaction(async (tx) => {
        await acquireGlobalPermit(tx, 3, 8);
        const current = await lockOwned(tx, input.ownerId, input.dictionaryId);
        if (
            current.dictionary.version !==
            input.request.expectedDictionaryVersion
        )
            throw new DictionaryVersionConflictError();
        const cards = await tx
            .select({
                id: dictionaryCardsTable.id,
                sortKey: dictionaryCardsTable.sortKey,
            })
            .from(dictionaryCardsTable)
            .where(
                and(
                    eq(dictionaryCardsTable.dictionaryId, input.dictionaryId),
                    eq(dictionaryCardsTable.lifecycle, 'active'),
                ),
            )
            .orderBy(
                asc(dictionaryCardsTable.sortKey),
                asc(dictionaryCardsTable.id),
            )
            .for('update');

        abort(input.context);
        const indexById = new Map(
            cards.map((card, index) => [card.id, index] as const),
        );
        const indexes = input.request.orderedCardIds.map(
            (id) => indexById.get(id) ?? -1,
        );
        const sortedIndexes = [...indexes].sort((left, right) => left - right);
        if (
            indexes.some((index) => index < 0) ||
            new Set(indexes).size !== indexes.length ||
            sortedIndexes.some(
                (index, offset) =>
                    offset > 0 && index !== sortedIndexes[offset - 1]! + 1,
            )
        )
            throw new InvalidDictionaryRequestError();
        const windowStart = sortedIndexes[0]!;
        const windowKeys = cards
            .slice(
                windowStart,
                windowStart + input.request.orderedCardIds.length,
            )
            .map(({ sortKey }) => sortKey);
        const assignments = input.request.orderedCardIds.map((id, index) => ({
            id,
            sortKey: windowKeys[index]!,
        }));
        const reorderChunkSize = 500;
        for (
            let offset = 0;
            offset < assignments.length;
            offset += reorderChunkSize
        ) {
            abort(input.context);
            const chunk = assignments.slice(offset, offset + reorderChunkSize);
            const cases = chunk.map(
                (assignment) =>
                    sql`when ${assignment.id}::uuid then ${assignment.sortKey}`,
            );

            await tx
                .update(dictionaryCardsTable)
                .set({
                    sortKey: sql`case ${dictionaryCardsTable.id} ${sql.join(cases, sql` `)} else ${dictionaryCardsTable.sortKey} end`,
                    updatedAt: input.context.now,
                })
                .where(
                    and(
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            input.dictionaryId,
                        ),
                        inArray(
                            dictionaryCardsTable.id,
                            chunk.map(({ id }) => id),
                        ),
                    ),
                );
        }

        return {
            dictionaryVersion: await bumpDictionary(
                tx,
                current.dictionary,
                input.context.now,
            ),
        };
    });
}
