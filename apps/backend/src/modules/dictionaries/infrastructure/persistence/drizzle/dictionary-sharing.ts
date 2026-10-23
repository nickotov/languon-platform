import type { PublicDictionary } from '@languon/contracts';
import { and, asc, eq, gt, or, type SQL } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    DictionaryVersionConflictError,
    SharedDictionaryNotFoundError,
} from '../../../application/dictionary-errors';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import type { DictionaryPersistenceContext } from './dictionary-context';
import {
    abort,
    decodeCursor,
    encodeCursor,
    isCardCursor,
} from './dictionary-cursors';
import {
    acquireGlobalPermit,
    activeCardCount,
    cardCount,
    lockOwned,
} from './dictionary-aggregate-state';
import { readOwned } from './dictionary-queries';
import { mapCard, mapSummary, settingsValues } from './dictionary-rows';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

export async function rotateShare(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['rotateShare']>[0],
) {
    return context.database.transaction(async (tx) => {
        const current = await lockOwned(tx, input.ownerId, input.dictionaryId);
        abort(input.context);
        const [owner] = await tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, input.ownerId))
            .limit(1);

        if (
            owner?.status !== 'active' ||
            current.dictionary.version !== input.expectedDictionaryVersion ||
            current.dictionary.lifecycle !== 'active'
        )
            throw new DictionaryVersionConflictError();
        await tx
            .update(dictionariesTable)
            .set({
                shareKeyDigest: input.digest,
                shareKeyRotatedAt: input.context.now,
                shareKeyVersion: input.keyVersion,
                shareLocator: input.locator,
                updatedAt: input.context.now,
                version: current.dictionary.version + 1,
                visibility: 'unlisted',
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

export async function findSharedCandidate(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['findSharedCandidate']>[0],
) {
    abort(input.context);
    const [row] = await context.database
        .select({
            id: dictionariesTable.id,
            shareKeyDigest: dictionariesTable.shareKeyDigest,
            shareKeyVersion: dictionariesTable.shareKeyVersion,
        })
        .from(dictionariesTable)
        .where(
            and(
                eq(dictionariesTable.shareLocator, input.shareId),
                eq(dictionariesTable.lifecycle, 'active'),
                eq(dictionariesTable.visibility, 'unlisted'),
            ),
        )
        .limit(1);

    if (!row?.shareKeyDigest || !row.shareKeyVersion) return null;

    return {
        dictionaryId: row.id,
        shareDigest: row.shareKeyDigest,
        shareVersion: row.shareKeyVersion,
    };
}

export async function readSharedDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['readSharedDictionary']>[0],
) {
    return context.database.transaction(async (tx) => {
        await acquireGlobalPermit(tx, 1, 32);
        abort(input.context);
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
                    eq(dictionariesTable.id, input.dictionaryId),
                    eq(
                        dictionariesTable.shareKeyDigest,
                        input.verifiedShareDigest,
                    ),
                    eq(dictionariesTable.lifecycle, 'active'),
                    eq(dictionariesTable.visibility, 'unlisted'),
                ),
            )
            .limit(1)
            .for('share', { of: dictionariesTable });

        if (!row) throw new SharedDictionaryNotFoundError();

        const cursor = decodeCursor(input.query.cursor, isCardCursor);
        if (
            cursor &&
            (cursor.dictionaryVersion !== row.dictionary.version ||
                cursor.settingsVersion !== row.settings.version)
        ) {
            throw new DictionaryVersionConflictError();
        }

        const conditions: SQL[] = [
            eq(dictionaryCardsTable.dictionaryId, row.dictionary.id),
            eq(dictionaryCardsTable.lifecycle, 'active'),
        ];

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
        const cards = rows.slice(0, input.query.limit);
        const last = cards.at(-1);
        const activeCount = await activeCardCount(tx, row.dictionary.id);
        const allCardCount = await cardCount(tx, row.dictionary.id);
        const summary = mapSummary(
            row.dictionary,
            row.settings,
            activeCount,
            allCardCount > 0,
        );
        const dictionary: PublicDictionary = {
            activeCardCount: summary.activeCardCount,
            archivedAt: summary.archivedAt,
            cards: cards.map((card) => {
                const mapped = mapCard(card, row.settings);

                return {
                    authorship: mapped.authorship,
                    createdAt: mapped.createdAt,
                    effectiveSettings: mapped.effectiveSettings,
                    id: mapped.id,
                    position: mapped.position,
                    updatedAt: mapped.updatedAt,
                    values: mapped.values,
                    version: mapped.version,
                };
            }),
            createdAt: summary.createdAt,
            description: summary.description,
            id: summary.id,
            languagePairLocked: summary.languagePairLocked,
            name: summary.name,
            settings: settingsValues(row.settings),
            sourceLanguage: summary.sourceLanguage,
            targetLanguage: summary.targetLanguage,
            updatedAt: summary.updatedAt,
            version: summary.version,
            visibility: 'unlisted',
        };

        return {
            dictionary,
            nextCursor:
                rows.length > input.query.limit && last
                    ? encodeCursor({
                          dictionaryVersion: row.dictionary.version,
                          id: last.id,
                          settingsVersion: row.settings.version,
                          sortKey: last.sortKey.toString(),
                      })
                    : null,
        };
    });
}
