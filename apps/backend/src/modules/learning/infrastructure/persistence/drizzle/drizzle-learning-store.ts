import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type {
    FlashcardAttemptRequest,
    FlashcardConfiguration,
    FlashcardItemsRequest,
    FlashcardPreferencesPutRequest,
    FlashcardPrepareRequest,
    FlashcardUndoRequest,
    LearningEntriesQuery,
} from '@languon/contracts';
import type { LanguageTag } from '@languon/languages';
import { z } from 'zod';
import {
    and,
    asc,
    desc,
    eq,
    gt,
    ilike,
    inArray,
    isNull,
    or,
    sql,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    authorizeLearningDictionary,
    learningCardSettings,
    type LearningDictionary,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/dictionary-learning-participant';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { DictionaryNotFoundError } from '../../../../dictionaries/application/dictionary-errors';
import type {
    LearningAccess,
    LearningContext,
    LearningStore,
} from '../../../application/ports/learning-store';
import {
    LearningAuthenticationRequiredError,
    LearningConflictError,
    LearningInvalidRequestError,
    LearningUnavailableError,
    LearningEntryUnavailableError,
} from '../../../domain/errors';
import {
    defaultFlashcardConfiguration,
    projectFlashcard,
} from '../../../domain/flashcard-projection';
import {
    flashcardAttemptsTable as attempts,
    flashcardEntryProgressTable as progress,
    flashcardPreferencesTable as preferences,
} from './schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Attempt = typeof attempts.$inferSelect;
const cursorSchema = z
    .object({
        sort: z
            .string()
            .regex(/^\d{1,19}$/)
            .refine((value) => BigInt(value) <= 9223372036854775807n),
        id: z.uuid(),
        dictionaryId: z.uuid(),
        dictionaryVersion: z.number().int().positive(),
        search: z.string().nullable(),
    })
    .strict();
function learner(access: LearningAccess): string {
    if (!access.learnerId) throw new LearningAuthenticationRequiredError();
    return access.learnerId;
}
function present(
    card: typeof cards.$inferSelect,
    owned: LearningDictionary,
    configuration: FlashcardConfiguration,
) {
    return projectFlashcard({
        entryId: card.id,
        learningVersion: card.learningVersion,
        sourceLanguage: owned.dictionary.sourceLanguageTag as LanguageTag,
        targetLanguage: owned.dictionary.targetLanguageTag as LanguageTag,
        values: card,
        settings: learningCardSettings(owned.settings, card),
        configuration,
    });
}
function attemptResult(row: Attempt) {
    return {
        attemptId: row.id,
        entryId: row.entryId,
        learningVersion: row.learningVersion,
        rating: row.rating,
    };
}
function undoResult(row: Attempt) {
    return {
        attemptId: row.id,
        entryId: row.entryId,
        learningVersion: row.learningVersion,
        rating: row.undoRating,
    };
}
function sameAttempt(row: Attempt, input: FlashcardAttemptRequest) {
    return (
        row.entryId === input.entryId &&
        row.sessionId === input.sessionId &&
        row.round === input.round &&
        row.learningVersion === input.expectedLearningVersion &&
        row.rating === input.rating &&
        JSON.stringify(row.configuration.front) ===
            JSON.stringify(input.configuration.front) &&
        JSON.stringify(row.configuration.back) ===
            JSON.stringify(input.configuration.back)
    );
}

export class DrizzleLearningStore implements LearningStore {
    public constructor(private readonly database: Database) {}
    private run<T>(
        access: LearningAccess,
        context: LearningContext,
        work: (tx: Transaction, owned: LearningDictionary) => Promise<T>,
        write = false,
    ): Promise<T> {
        context.signal.throwIfAborted();
        return this.database.transaction(async (tx) => {
            const owned = await authorizeLearningDictionary(tx, access).catch(
                (error) => {
                    if (error instanceof DictionaryNotFoundError)
                        throw new LearningUnavailableError();
                    throw error;
                },
            );
            if (write) {
                // One learner lock covers global operation IDs, session-last and entry-last checks atomically.
                await tx.execute(
                    sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${learner(access)}`}, 0))`,
                );
            }
            context.signal.throwIfAborted();
            const result = await work(tx, owned);
            context.signal.throwIfAborted();
            return result;
        });
    }
    public async listEntries(
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
        return this.run(access, context, async (tx, owned) => {
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
    public async getPreferences(
        access: LearningAccess,
        context: LearningContext,
    ) {
        const learnerId = learner(access);
        return this.run(access, context, async (tx, owned) => {
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
    public async savePreferences(
        access: LearningAccess,
        input: FlashcardPreferencesPutRequest,
        context: LearningContext,
    ) {
        const learnerId = learner(access);
        return this.run(
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
    public async prepare(
        access: LearningAccess,
        input: FlashcardPrepareRequest,
        context: LearningContext,
    ) {
        return this.run(access, context, async (tx, owned) => {
            const entryIds: string[] = [];
            let fallbackCount = 0;
            let selectedTotal = 0;
            let after: { sortKey: bigint; id: string } | undefined;
            for (;;) {
                context.signal.throwIfAborted();
                const rows = await tx
                    .select()
                    .from(cards)
                    .where(
                        and(
                            eq(cards.dictionaryId, owned.dictionary.id),
                            eq(cards.lifecycle, 'active'),
                            input.scope.type === 'manual'
                                ? inArray(cards.id, input.scope.entryIds)
                                : undefined,
                            after
                                ? or(
                                      gt(cards.sortKey, after.sortKey),
                                      and(
                                          eq(cards.sortKey, after.sortKey),
                                          gt(cards.id, after.id),
                                      ),
                                  )
                                : undefined,
                        ),
                    )
                    .orderBy(asc(cards.sortKey), asc(cards.id))
                    .limit(500);
                selectedTotal += rows.length;
                if (selectedTotal > 10_000)
                    throw new LearningInvalidRequestError();
                for (const row of rows) {
                    context.signal.throwIfAborted();
                    const item = present(row, owned, input.configuration);
                    if (!item) continue;
                    entryIds.push(row.id);
                    if (
                        [...item.front, ...item.back].some(
                            (field) => field.fallback,
                        )
                    )
                        fallbackCount++;
                }
                const last = rows.at(-1);
                if (!last || rows.length < 500) break;
                after = { sortKey: last.sortKey, id: last.id };
            }
            const selectedCount =
                input.scope.type === 'manual'
                    ? input.scope.entryIds.length
                    : selectedTotal;
            return {
                entryIds,
                eligibleCount: entryIds.length,
                skippedCount: selectedCount - entryIds.length,
                fallbackCount,
            };
        });
    }
    public async items(
        access: LearningAccess,
        input: FlashcardItemsRequest,
        context: LearningContext,
    ) {
        return this.run(access, context, async (tx, owned) => {
            const rows = await tx
                .select()
                .from(cards)
                .where(
                    and(
                        eq(cards.dictionaryId, owned.dictionary.id),
                        eq(cards.lifecycle, 'active'),
                        inArray(cards.id, input.entryIds),
                    ),
                )
                .limit(25);
            const lookup = new Map(rows.map((row) => [row.id, row]));
            const items = input.entryIds.flatMap((id) => {
                const row = lookup.get(id);
                const item = row
                    ? present(row, owned, input.configuration)
                    : null;
                return item ? [item] : [];
            });
            const available = new Set(items.map((item) => item.entryId));
            return {
                items,
                unavailableEntryIds: input.entryIds.filter(
                    (id) => !available.has(id),
                ),
            };
        });
    }
    public async progress(access: LearningAccess, context: LearningContext) {
        const learnerId = learner(access);
        return this.run(access, context, async (tx, owned) => {
            const [totals] = await tx
                .select({
                    total: sql<number>`count(*)::int`,
                    known: sql<number>`count(*) filter (where ${progress.rating} = 'known' and ${progress.learningVersion} = ${cards.learningVersion})::int`,
                    again: sql<number>`count(*) filter (where ${progress.rating} = 'again' and ${progress.learningVersion} = ${cards.learningVersion})::int`,
                })
                .from(cards)
                .leftJoin(
                    progress,
                    and(
                        eq(progress.entryId, cards.id),
                        eq(progress.learnerId, learnerId),
                    ),
                )
                .where(
                    and(
                        eq(cards.dictionaryId, owned.dictionary.id),
                        eq(cards.lifecycle, 'active'),
                    ),
                );
            const total = totals?.total ?? 0;
            const known = totals?.known ?? 0;
            const again = totals?.again ?? 0;
            return { total, known, again, unstudied: total - known - again };
        });
    }
    public async recordAttempt(
        access: LearningAccess,
        input: FlashcardAttemptRequest,
        context: LearningContext,
    ) {
        const learnerId = learner(access);
        return this.run(
            access,
            context,
            async (tx, owned) => {
                const [card] = await tx
                    .select()
                    .from(cards)
                    .where(
                        and(
                            eq(cards.id, input.entryId),
                            eq(cards.dictionaryId, owned.dictionary.id),
                            eq(cards.lifecycle, 'active'),
                        ),
                    );
                if (!card) throw new LearningEntryUnavailableError();
                const [replay] = await tx
                    .select()
                    .from(attempts)
                    .where(
                        and(
                            eq(attempts.learnerId, learnerId),
                            or(
                                eq(attempts.operationId, input.operationId),
                                eq(attempts.undoOperationId, input.operationId),
                            ),
                        ),
                    );
                if (replay) {
                    if (
                        replay.dictionaryId !== owned.dictionary.id ||
                        replay.operationId !== input.operationId ||
                        !sameAttempt(replay, input)
                    )
                        throw new LearningConflictError('operation_conflict');
                    return attemptResult(replay);
                }
                if (card.learningVersion !== input.expectedLearningVersion)
                    throw new LearningConflictError('stale_content');
                if (!present(card, owned, input.configuration))
                    throw new LearningInvalidRequestError();
                const [row] = await tx
                    .insert(attempts)
                    .values({
                        id: randomUUID(),
                        learnerId,
                        dictionaryId: owned.dictionary.id,
                        entryId: card.id,
                        operationId: input.operationId,
                        sessionId: input.sessionId,
                        round: input.round,
                        learningVersion: card.learningVersion,
                        rating: input.rating,
                        configuration: input.configuration,
                    })
                    .returning();
                if (!row) throw new Error('Attempt insertion failed');
                await tx
                    .insert(progress)
                    .values({
                        learnerId,
                        dictionaryId: owned.dictionary.id,
                        entryId: card.id,
                        learningVersion: card.learningVersion,
                        rating: input.rating,
                        latestAttemptId: row.id,
                    })
                    .onConflictDoUpdate({
                        target: [progress.learnerId, progress.entryId],
                        set: {
                            learningVersion: card.learningVersion,
                            rating: input.rating,
                            latestAttemptId: row.id,
                        },
                    });
                return attemptResult(row);
            },
            true,
        );
    }
    public async undo(
        access: LearningAccess,
        attemptId: string,
        input: FlashcardUndoRequest,
        context: LearningContext,
    ) {
        const learnerId = learner(access);
        return this.run(
            access,
            context,
            async (tx, owned) => {
                const [target] = await tx
                    .select()
                    .from(attempts)
                    .where(
                        and(
                            eq(attempts.id, attemptId),
                            eq(attempts.learnerId, learnerId),
                            eq(attempts.dictionaryId, owned.dictionary.id),
                        ),
                    );
                if (!target) throw new LearningEntryUnavailableError();
                const [card] = await tx
                    .select()
                    .from(cards)
                    .where(
                        and(
                            eq(cards.id, target.entryId),
                            eq(cards.dictionaryId, owned.dictionary.id),
                            eq(cards.lifecycle, 'active'),
                        ),
                    );
                if (!card) throw new LearningEntryUnavailableError();
                if (card.learningVersion !== target.learningVersion)
                    throw new LearningConflictError('stale_content');
                const [reuse] = await tx
                    .select()
                    .from(attempts)
                    .where(
                        and(
                            eq(attempts.learnerId, learnerId),
                            or(
                                eq(attempts.operationId, input.operationId),
                                eq(attempts.undoOperationId, input.operationId),
                            ),
                        ),
                    );
                if (reuse) {
                    if (
                        reuse.id !== target.id ||
                        reuse.undoOperationId !== input.operationId
                    )
                        throw new LearningConflictError('operation_conflict');
                    return undoResult(reuse);
                }
                const [latestSession] = await tx
                    .select()
                    .from(attempts)
                    .where(
                        and(
                            eq(attempts.learnerId, learnerId),
                            eq(attempts.sessionId, target.sessionId),
                        ),
                    )
                    .orderBy(desc(attempts.sequence))
                    .limit(1);
                const [current] = await tx
                    .select()
                    .from(progress)
                    .where(
                        and(
                            eq(progress.learnerId, learnerId),
                            eq(progress.entryId, card.id),
                        ),
                    );
                if (
                    target.voidedAt ||
                    latestSession?.id !== target.id ||
                    current?.latestAttemptId !== target.id
                )
                    throw new LearningConflictError('undo_conflict');
                const [prior] = await tx
                    .select()
                    .from(attempts)
                    .where(
                        and(
                            eq(attempts.learnerId, learnerId),
                            eq(attempts.entryId, card.id),
                            eq(attempts.learningVersion, card.learningVersion),
                            isNull(attempts.voidedAt),
                            sql`${attempts.sequence} < ${target.sequence}`,
                        ),
                    )
                    .orderBy(desc(attempts.sequence))
                    .limit(1);
                const [voided] = await tx
                    .update(attempts)
                    .set({
                        voidedAt: new Date(),
                        undoOperationId: input.operationId,
                        undoRating: prior?.rating ?? null,
                    })
                    .where(eq(attempts.id, target.id))
                    .returning();
                if (!voided) throw new Error('Undo mutation failed');
                const condition = and(
                    eq(progress.learnerId, learnerId),
                    eq(progress.entryId, card.id),
                );
                if (prior)
                    await tx
                        .update(progress)
                        .set({
                            latestAttemptId: prior.id,
                            rating: prior.rating,
                            learningVersion: card.learningVersion,
                        })
                        .where(condition);
                else await tx.delete(progress).where(condition);
                return undoResult(voided);
            },
            true,
        );
    }
}
