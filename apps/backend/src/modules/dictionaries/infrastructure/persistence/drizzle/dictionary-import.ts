import type { DictionaryDeterministicImportResponse } from '@languon/contracts';
import { DictionaryDeterministicImportResponseSchema } from '@languon/contracts';
import { eq, sql } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
    InvalidDictionaryRequestError,
} from '../../../application/dictionary-errors';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import {
    dictionaryLimits,
    normalizeCardValues,
    normalizeDictionaryDetails,
    type DictionaryCardValues,
} from '../../../domain/limits';
import {
    assertDictionaryCardCapacity,
    dictionaryCardSortGap,
} from '../../../domain/ordering';
import { defaultDictionarySettings } from '../../../domain/settings';
import { cardInsertValues } from './dictionary-card-state';
import type {
    CardRow,
    DictionaryPersistenceContext,
    DictionaryRow,
    SettingsRow,
    DictionaryTransaction,
} from './dictionary-context';
import { abort } from './dictionary-cursors';
import {
    completeBulkIdempotency,
    reserveBulkIdempotency,
} from './dictionary-idempotency';
import {
    importDuplicateWarnings,
    importExistingSources,
} from './dictionary-import-state';
import {
    acquireGlobalPermit,
    activeCardCount,
    assertOwnerCapacityLocked,
    bumpDictionary,
    lockOwned,
    lockOwnerCapacity,
    nextActiveSortKey,
    readOwnedState,
} from './dictionary-aggregate-state';
import { readOwned, readOwnedStateForExport } from './dictionary-queries';
import type { DictionaryInterchangePair } from '../../../domain/interchange';
import { normalizedSource, revisionSnapshot } from './dictionary-rows';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

export async function authorizeDictionaryImportTarget(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['authorizeDictionaryImportTarget']>[0],
): Promise<void> {
    abort(input.context);
    if (input.target.kind === 'new') return;
    const current = await readOwnedStateForExport(
        context.database,
        input.ownerId,
        input.target.dictionaryId,
    );

    if (
        input.requireExpectedVersions &&
        (current.dictionary.lifecycle !== 'active' ||
            current.dictionary.version !==
                input.target.expectedDictionaryVersion ||
            current.settings.version !== input.target.expectedSettingsVersion)
    )
        throw new DictionaryVersionConflictError();
}

export async function previewDictionaryImport(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['previewDictionaryImport']>[0],
) {
    abort(input.context);
    const target = input.target;

    return context.database.transaction(async (tx) => {
        let dictionaryRemaining: number = dictionaryLimits.cardCapacity;
        let existingSources: Array<{
            cardId: string;
            normalizedSource: string;
        }> = [];

        if (target.kind === 'existing') {
            const current = await readOwnedState(
                tx,
                input.ownerId,
                target.dictionaryId,
            );

            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !==
                    target.expectedDictionaryVersion ||
                current.settings.version !== target.expectedSettingsVersion
            )
                throw new DictionaryVersionConflictError();
            dictionaryRemaining = Math.max(
                0,
                dictionaryLimits.cardCapacity -
                    (await activeCardCount(tx, target.dictionaryId)),
            );

            existingSources = await importExistingSources(
                tx,
                target.dictionaryId,
                input.rows,
            );
        }

        const [ownerCounts] = await tx
            .select({
                cards: sql<number>`(
                        select count(*) from ${dictionaryCardsTable} card
                        inner join ${dictionariesTable} dictionary
                          on dictionary.id = card.dictionary_id
                        where dictionary.owner_id = ${input.ownerId}
                    )`,
                dictionaries: sql<number>`(
                        select count(*) from ${dictionariesTable} dictionary
                        where dictionary.owner_id = ${input.ownerId}
                    )`,
                revisions: sql<number>`(
                        select count(*) from ${dictionaryCardRevisionsTable} revision
                        inner join ${dictionariesTable} dictionary
                          on dictionary.id = revision.dictionary_id
                        where dictionary.owner_id = ${input.ownerId}
                    )`,
            })
            .from(usersTable)
            .where(eq(usersTable.id, input.ownerId))
            .limit(1);

        if (!ownerCounts) throw new DictionaryNotFoundError();
        const dictionarySlotAvailable =
            target.kind === 'existing' ||
            Number(ownerCounts.dictionaries) <
                context.ownerLimits.ownerDictionaryCapacity;
        const remainingRows = dictionarySlotAvailable
            ? Math.max(
                  0,
                  Math.min(
                      dictionaryRemaining,
                      context.ownerLimits.ownerRetainedCardCapacity -
                          Number(ownerCounts.cards),
                      context.ownerLimits.ownerRevisionCapacity -
                          Number(ownerCounts.revisions),
                  ),
              )
            : 0;

        return {
            remainingRows,
            warnings: importDuplicateWarnings(existingSources, input.rows),
        };
    });
}

/** Internal composition seam: prepared content is resolved under the publication transaction. */
export interface PreparedDictionaryImportRow extends DictionaryInterchangePair {
    prepared?: Pick<
        DictionaryCardValues,
        'definition' | 'example' | 'exampleTranslation' | 'transcription'
    >;
}
export interface PreparedDictionaryImport {
    rows: readonly PreparedDictionaryImportRow[];
    sourceLanguage: string;
    targetLanguage: string;
}
export type PrepareDictionaryImport = (
    tx: DictionaryTransaction,
) => Promise<PreparedDictionaryImport>;

export async function importDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['importDictionary']>[0],
    prepare?: PrepareDictionaryImport,
): Promise<DictionaryDeterministicImportResponse> {
    if (!prepare && input.rows.length === 0)
        throw new InvalidDictionaryRequestError();

    return context.database.transaction(async (tx) => {
        abort(input.context);
        await acquireGlobalPermit(tx, 5, 4);
        await lockOwnerCapacity(tx, input.ownerId);
        const replay = await reserveBulkIdempotency(context, tx, input);
        if (replay) return replay;
        const prepared = await prepare?.(tx);
        const rows: readonly PreparedDictionaryImportRow[] =
            prepared?.rows ?? input.rows;

        if (!rows.length) throw new InvalidDictionaryRequestError();

        await assertOwnerCapacityLocked(
            context,
            tx,
            input.ownerId,
            input.target.kind === 'new' ? 1 : 0,
            rows.length,
            rows.length,
        );

        abort(input.context);

        let dictionary: DictionaryRow;
        let settings: SettingsRow;
        if (input.target.kind === 'new') {
            const details = normalizeDictionaryDetails(input.target);
            const dictionaryId = context.ids.generate();
            const [createdDictionary] = await tx
                .insert(dictionariesTable)
                .values({
                    createdAt: input.context.now,
                    description: details.description,
                    id: dictionaryId,
                    name: details.name,
                    ownerId: input.ownerId,
                    sourceLanguageTag: input.target.sourceLanguage,
                    targetLanguageTag: input.target.targetLanguage,
                    updatedAt: input.context.now,
                })
                .returning();
            const [createdSettings] = await tx
                .insert(dictionarySettingsTable)
                .values({
                    createdAt: input.context.now,
                    customNotationLabel:
                        defaultDictionarySettings.customNotationLabel,
                    definitionEnabled:
                        defaultDictionarySettings.definitionEnabled,
                    definitionLanguageRole:
                        defaultDictionarySettings.definitionLanguageRole,
                    dictionaryId,
                    exampleEnabled: defaultDictionarySettings.exampleEnabled,
                    exampleLanguageRole:
                        defaultDictionarySettings.exampleLanguageRole,
                    exampleTranslationEnabled:
                        defaultDictionarySettings.exampleTranslationEnabled,
                    transcriptionEnabled:
                        defaultDictionarySettings.transcriptionEnabled,
                    transcriptionNotation:
                        defaultDictionarySettings.transcriptionNotation,
                    updatedAt: input.context.now,
                })
                .returning();

            if (!createdDictionary || !createdSettings)
                throw new DictionaryVersionConflictError();
            dictionary = createdDictionary;
            settings = createdSettings;
        } else {
            const current = await lockOwned(
                tx,
                input.ownerId,
                input.target.dictionaryId,
            );

            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !==
                    input.target.expectedDictionaryVersion ||
                current.settings.version !==
                    input.target.expectedSettingsVersion
            )
                throw new DictionaryVersionConflictError();
            assertDictionaryCardCapacity(
                (await activeCardCount(tx, current.dictionary.id)) +
                    rows.length,
            );

            dictionary = current.dictionary;
            settings = current.settings;
        }

        const warnings = importDuplicateWarnings(
            await importExistingSources(tx, dictionary.id, input.rows),
            rows,
        );

        if (
            prepared &&
            (dictionary.sourceLanguageTag !== prepared.sourceLanguage ||
                dictionary.targetLanguageTag !== prepared.targetLanguage)
        )
            throw new InvalidDictionaryRequestError();
        const initialSortKey = await nextActiveSortKey(tx, dictionary.id);
        const pending = rows.map((sourceRow, index) => {
            const preparedValues = prepared ? sourceRow.prepared : undefined;
            const values = normalizeCardValues({
                definition: preparedValues?.definition ?? null,
                example: preparedValues?.example ?? null,
                exampleTranslation: preparedValues?.exampleTranslation ?? null,
                source: sourceRow.source,
                transcription: preparedValues?.transcription ?? null,
                translation: sourceRow.translation,
            });

            return {
                id: context.ids.generate(),
                rowIndex: sourceRow.rowIndex,
                sortKey: initialSortKey + BigInt(index) * dictionaryCardSortGap,
                values,
            };
        });
        const insertedCards: CardRow[] = [];
        const importChunkSize = 250;
        for (
            let offset = 0;
            offset < pending.length;
            offset += importChunkSize
        ) {
            abort(input.context);
            const chunk = pending.slice(offset, offset + importChunkSize);
            const inserted = await tx
                .insert(dictionaryCardsTable)
                .values(
                    chunk.map((card) => ({
                        ...cardInsertValues(card.values, {
                            customNotationLabel: null,
                            definitionEnabled: null,
                            definitionLanguageRole: null,
                            exampleEnabled: null,
                            exampleLanguageRole: null,
                            exampleTranslationEnabled: null,
                            transcriptionEnabled: null,
                            transcriptionNotation: null,
                        }),
                        authorship: 'human' as const,
                        createdAt: input.context.now,
                        dictionaryId: dictionary.id,
                        id: card.id,
                        normalizedSource: normalizedSource(card.values.source),
                        sortKey: card.sortKey,
                        updatedAt: input.context.now,
                    })),
                )
                .returning();

            if (inserted.length !== chunk.length)
                throw new DictionaryVersionConflictError();
            insertedCards.push(...inserted);
        }

        const insertedById = new Map(
            insertedCards.map((card) => [card.id, card] as const),
        );
        const orderedCards = pending.map((card) => {
            const inserted = insertedById.get(card.id);
            if (!inserted) throw new DictionaryVersionConflictError();

            return inserted;
        });

        for (
            let offset = 0;
            offset < orderedCards.length;
            offset += importChunkSize
        ) {
            abort(input.context);
            await tx.insert(dictionaryCardRevisionsTable).values(
                orderedCards
                    .slice(offset, offset + importChunkSize)
                    .map((card) => ({
                        actorUserId: input.ownerId,
                        authorship: 'human' as const,
                        cardId: card.id,
                        cardVersion: card.version,
                        createdAt: input.context.now,
                        dictionaryId: dictionary.id,
                        id: context.ids.generate(),
                        mutationKind: 'deterministic_import' as const,
                        revisionNumber: card.version,
                        schemaVersion: 2,
                        settingsVersion: settings.version,
                        snapshot: revisionSnapshot(
                            card,
                            settings,
                            dictionary.translationContext,
                        ),
                    })),
            );
        }

        if (input.target.kind === 'existing') {
            const version = await bumpDictionary(
                tx,
                dictionary,
                input.context.now,
            );

            dictionary = { ...dictionary, version };
        }

        const owned = await readOwned(tx, input.ownerId, dictionary.id);
        const result = DictionaryDeterministicImportResponseSchema.parse({
            cards: orderedCards.map((card, index) => ({
                cardId: card.id,
                cardVersion: card.version,
                position: card.sortKey.toString(),
                rowIndex: pending[index]!.rowIndex,
            })),
            dictionary: owned,
            mode: 'deterministic',
            warnings,
        });

        await completeBulkIdempotency(tx, input, result);

        return result;
    });
}
