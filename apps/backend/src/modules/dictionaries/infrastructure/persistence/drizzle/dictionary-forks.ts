import { and, asc, count, eq, gt, or } from 'drizzle-orm';
import {
    DictionaryIdempotencyConflictError,
    DictionaryVersionConflictError,
    SharedDictionaryNotFoundError,
} from '../../../application/dictionary-errors';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import { normalizeDictionaryDetails } from '../../../domain/limits';
import { assertDictionaryCardCapacity } from '../../../domain/ordering';
import { cardInsertValues } from './dictionary-card-state';
import type {
    CardRow,
    DictionaryPersistenceContext,
} from './dictionary-context';
import { abort } from './dictionary-cursors';
import {
    completeIdempotency,
    reserveIdempotency,
} from './dictionary-idempotency';
import {
    acquireGlobalPermit,
    assertOwnerCapacityLocked,
    lockOwnerCapacity,
} from './dictionary-aggregate-state';
import { readOwned } from './dictionary-queries';
import {
    cardValues,
    overridesFromRow,
    revisionSnapshot,
} from './dictionary-rows';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryIdempotencyKeysTable,
    dictionarySettingsTable,
} from './schema';

export async function forkSharedDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['forkSharedDictionary']>[0],
) {
    return context.database.transaction(async (tx) => {
        await acquireGlobalPermit(tx, 2, 4);
        abort(input.context);
        await lockOwnerCapacity(tx, input.ownerId);
        abort(input.context);
        const replay = await reserveIdempotency(context, tx, input, 'fork');
        if (replay) return readOwned(tx, input.ownerId, replay);
        const [source] = await tx
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
                    eq(dictionariesTable.id, input.sourceDictionaryId),
                    eq(dictionariesTable.lifecycle, 'active'),
                    eq(dictionariesTable.visibility, 'unlisted'),
                    eq(
                        dictionariesTable.shareKeyDigest,
                        input.verifiedShareDigest,
                    ),
                ),
            )
            .limit(1)
            .for('update', { of: dictionariesTable });

        if (!source) throw new SharedDictionaryNotFoundError();
        abort(input.context);
        const [sourceCountRow] = await tx
            .select({ value: count() })
            .from(dictionaryCardsTable)
            .where(
                and(
                    eq(dictionaryCardsTable.dictionaryId, source.dictionary.id),
                    eq(dictionaryCardsTable.lifecycle, 'active'),
                ),
            );
        const sourceCardCount = sourceCountRow?.value ?? 0;
        assertDictionaryCardCapacity(sourceCardCount);
        await assertOwnerCapacityLocked(
            context,
            tx,
            input.ownerId,
            1,
            sourceCardCount,
            sourceCardCount,
        );

        const dictionaryId = context.ids.generate();
        const details = normalizeDictionaryDetails({
            description: source.dictionary.description,
            name: input.request.name ?? source.dictionary.name,
        });

        await tx.insert(dictionariesTable).values({
            createdAt: input.context.now,
            description: details.description,
            id: dictionaryId,
            name: details.name,
            ownerId: input.ownerId,
            sourceDictionaryId: source.dictionary.id,
            sourceLanguageTag: source.dictionary.sourceLanguageTag,
            targetLanguageTag: source.dictionary.targetLanguageTag,
            translationContext: null,
            updatedAt: input.context.now,
        });

        const [settings] = await tx
            .insert(dictionarySettingsTable)
            .values({
                createdAt: input.context.now,
                customNotationLabel: source.settings.customNotationLabel,
                definitionEnabled: source.settings.definitionEnabled,
                definitionLanguageRole: source.settings.definitionLanguageRole,
                dictionaryId,
                exampleEnabled: source.settings.exampleEnabled,
                exampleLanguageRole: source.settings.exampleLanguageRole,
                exampleTranslationEnabled:
                    source.settings.exampleTranslationEnabled,
                transcriptionEnabled: source.settings.transcriptionEnabled,
                transcriptionNotation: source.settings.transcriptionNotation,
                updatedAt: input.context.now,
            })
            .returning();

        if (!settings) throw new DictionaryVersionConflictError();
        const forkChunkSize = 100;
        let sourceCursor: { id: string; sortKey: bigint } | null = null;
        while (true) {
            abort(input.context);
            const chunk: CardRow[] = await tx
                .select()
                .from(dictionaryCardsTable)
                .where(
                    and(
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            source.dictionary.id,
                        ),
                        eq(dictionaryCardsTable.lifecycle, 'active'),
                        ...(sourceCursor
                            ? [
                                  or(
                                      gt(
                                          dictionaryCardsTable.sortKey,
                                          sourceCursor.sortKey,
                                      ),
                                      and(
                                          eq(
                                              dictionaryCardsTable.sortKey,
                                              sourceCursor.sortKey,
                                          ),
                                          gt(
                                              dictionaryCardsTable.id,
                                              sourceCursor.id,
                                          ),
                                      ),
                                  )!,
                              ]
                            : []),
                    ),
                )
                .orderBy(
                    asc(dictionaryCardsTable.sortKey),
                    asc(dictionaryCardsTable.id),
                )
                .limit(forkChunkSize)
                .for('share');

            if (chunk.length === 0) break;
            const cards = await tx
                .insert(dictionaryCardsTable)
                .values(
                    chunk.map((sourceCard) => ({
                        ...cardInsertValues(
                            cardValues(sourceCard),
                            overridesFromRow(sourceCard),
                            null,
                        ),
                        authorship: sourceCard.authorship,
                        createdAt: input.context.now,
                        dictionaryId,
                        id: context.ids.generate(),
                        lifecycle: 'active' as const,
                        normalizedSource: sourceCard.normalizedSource,
                        sortKey: sourceCard.sortKey,
                        updatedAt: input.context.now,
                    })),
                )
                .returning();

            if (cards.length !== chunk.length)
                throw new DictionaryVersionConflictError();
            await tx.insert(dictionaryCardRevisionsTable).values(
                cards.map((card) => ({
                    actorUserId: input.ownerId,
                    authorship: card.authorship,
                    cardId: card.id,
                    cardVersion: card.version,
                    createdAt: input.context.now,
                    dictionaryId: card.dictionaryId,
                    id: context.ids.generate(),
                    mutationKind: 'fork' as const,
                    revisionNumber: card.version,
                    schemaVersion: 2,
                    settingsVersion: settings.version,
                    snapshot: revisionSnapshot(card, settings, null),
                })),
            );

            const lastSourceCard: CardRow = chunk.at(-1)!;
            sourceCursor = {
                id: lastSourceCard.id,
                sortKey: lastSourceCard.sortKey,
            };
        }

        await completeIdempotency(
            tx,
            input.ownerId,
            'fork',
            input.idempotencyKey,
            dictionaryId,
            input.context.now,
        );

        return readOwned(tx, input.ownerId, dictionaryId);
    });
}

export async function replayForkDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['replayForkDictionary']>[0],
) {
    return context.database.transaction(async (tx) => {
        abort(input.context);
        const [existing] = await tx
            .select()
            .from(dictionaryIdempotencyKeysTable)
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                    eq(dictionaryIdempotencyKeysTable.operation, 'fork'),
                    eq(
                        dictionaryIdempotencyKeysTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                    gt(
                        dictionaryIdempotencyKeysTable.expiresAt,
                        input.context.now,
                    ),
                ),
            )
            .limit(1);

        if (!existing) return null;
        if (
            existing.requestFingerprint !== input.fingerprint ||
            existing.state !== 'completed' ||
            !existing.resultDictionaryId
        ) {
            throw new DictionaryIdempotencyConflictError();
        }

        return readOwned(tx, input.ownerId, existing.resultDictionaryId);
    });
}
