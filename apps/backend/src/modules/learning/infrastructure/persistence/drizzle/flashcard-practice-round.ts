import type {
    FlashcardItemsRequest,
    FlashcardPrepareRequest,
} from '@languon/contracts';
import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type {
    LearningAccess,
    LearningContext,
} from '../../../application/ports/learning-store';
import { LearningInvalidRequestError } from '../../../domain/errors';
import {
    learner,
    present,
    type FlashcardPersistenceContext,
} from './flashcard-persistence-context';
import { flashcardRun } from './flashcard-transaction';
import { flashcardEntryProgressTable as progress } from './schema';

export async function flashcardPrepare(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    input: FlashcardPrepareRequest,
    context: LearningContext,
) {
    return flashcardRun(persistence, access, context, async (tx, owned) => {
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
            if (selectedTotal > 10_000) throw new LearningInvalidRequestError();
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

export async function flashcardItems(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    input: FlashcardItemsRequest,
    context: LearningContext,
) {
    return flashcardRun(persistence, access, context, async (tx, owned) => {
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
            const item = row ? present(row, owned, input.configuration) : null;

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

export async function flashcardProgress(
    persistence: FlashcardPersistenceContext,
    access: LearningAccess,
    context: LearningContext,
) {
    const learnerId = learner(access);

    return flashcardRun(persistence, access, context, async (tx, owned) => {
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
