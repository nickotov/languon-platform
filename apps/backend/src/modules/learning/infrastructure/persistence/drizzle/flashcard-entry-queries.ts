import type {
    FlashcardPreferencesPutRequest,
    LearningEntriesQuery,
} from '@languon/contracts';
import { and, asc, eq, gt, ilike, or } from 'drizzle-orm';
import { Buffer } from 'node:buffer';
import type { z } from 'zod';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type {
    LearningAccess,
    LearningContext,
} from '../../../application/ports/learning-store';
import {
    LearningConflictError,
    LearningInvalidRequestError,
} from '../../../domain/errors';
import { defaultFlashcardConfiguration } from '../../../domain/flashcard-projection';
import {
    cursorSchema,
    learner,
    type FlashcardPersistenceContext,
} from './flashcard-persistence-context';
import { flashcardRun } from './flashcard-transaction';
import { flashcardPreferencesTable as preferences } from './schema';

export async function flashcardListEntries(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    query: LearningEntriesQuery,
    context: LearningContext,
) {
    let cursor: z.infer<typeof cursorSchema> | null = null;
    if (query.cursor) {
        try {
            const parsed: unknown = JSON.parse(
                Buffer.from(query.cursor, 'base64url').toString(),
            );

            cursor = cursorSchema.parse(parsed);
        } catch {
            throw new LearningInvalidRequestError();
        }
    }

    return flashcardRun(persistence, access, context, async (tx, owned) => {
        if (
            cursor &&
            (cursor.dictionaryId !== owned.dictionary.id ||
                cursor.dictionaryVersion !== owned.dictionary.version ||
                cursor.search !== (query.search ?? null))
        )
            throw new LearningInvalidRequestError();
        const search = query.search?.replace(/[\\%_]/g, '\\$&');
        const rows = await tx
            .select({
                entryId: cards.id,
                source: cards.source,
                translation: cards.translation,
                sortKey: cards.sortKey,
            })
            .from(cards)
            .where(
                and(
                    eq(cards.dictionaryId, owned.dictionary.id),
                    eq(cards.lifecycle, 'active'),
                    search
                        ? or(
                              ilike(cards.source, `%${search}%`),
                              ilike(cards.translation, `%${search}%`),
                          )
                        : undefined,
                    cursor
                        ? or(
                              gt(cards.sortKey, BigInt(cursor.sort)),
                              and(
                                  eq(cards.sortKey, BigInt(cursor.sort)),
                                  gt(cards.id, cursor.id),
                              ),
                          )
                        : undefined,
                ),
            )
            .orderBy(asc(cards.sortKey), asc(cards.id))
            .limit(query.limit + 1);
        const page = rows.slice(0, query.limit);
        const last = page.at(-1);

        return {
            entries: page.map(({ sortKey: _sortKey, ...entry }) => entry),
            nextCursor:
                rows.length > query.limit && last
                    ? Buffer.from(
                          JSON.stringify({
                              sort: last.sortKey.toString(),
                              id: last.entryId,
                              dictionaryId: owned.dictionary.id,
                              dictionaryVersion: owned.dictionary.version,
                              search: query.search ?? null,
                          }),
                      ).toString('base64url')
                    : null,
        };
    });
}

export async function flashcardGetPreferences(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    context: LearningContext,
) {
    const learnerId = learner(access);

    return flashcardRun(persistence, access, context, async (tx, owned) => {
        const [row] = await tx
            .select()
            .from(preferences)
            .where(
                and(
                    eq(preferences.learnerId, learnerId),
                    eq(preferences.dictionaryId, owned.dictionary.id),
                ),
            );

        return row
            ? {
                  configuration: row.configuration,
                  shuffle: row.shuffle,
                  version: row.version,
              }
            : {
                  configuration: defaultFlashcardConfiguration,
                  shuffle: true,
                  version: 0,
              };
    });
}

export async function flashcardSavePreferences(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    input: FlashcardPreferencesPutRequest,
    context: LearningContext,
) {
    const learnerId = learner(access);

    return flashcardRun(
        persistence,
        access,
        context,
        async (tx, owned) => {
            const condition = and(
                eq(preferences.learnerId, learnerId),
                eq(preferences.dictionaryId, owned.dictionary.id),
            );
            const [current] = await tx
                .select()
                .from(preferences)
                .where(condition);

            if ((current?.version ?? 0) !== input.expectedVersion)
                throw new LearningConflictError('preferences_conflict');
            const next = {
                configuration: input.configuration,
                shuffle: input.shuffle,
                version: input.expectedVersion + 1,
            };

            if (current)
                await tx.update(preferences).set(next).where(condition);
            else
                await tx.insert(preferences).values({
                    ...next,
                    learnerId,
                    dictionaryId: owned.dictionary.id,
                });

            return next;
        },
        true,
    );
}
