import { Buffer } from 'node:buffer';

import type {
    DictionaryCard,
    DictionaryCardOverrides,
    DictionaryCardValues,
    DictionaryDeterministicImportResponse,
    DictionaryImportRowWarning,
    DictionarySettingsValues,
    DictionarySummary,
    OwnedDictionary,
    PublicDictionary,
} from '@languon/contracts';
import { DictionaryDeterministicImportResponseSchema } from '@languon/contracts';
import {
    and,
    asc,
    count,
    desc,
    eq,
    gt,
    ilike,
    inArray,
    lt,
    lte,
    ne,
    or,
    sql,
    type SQL,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    DictionaryCardNotFoundError,
    DictionaryIdempotencyConflictError,
    DictionaryLanguagePairLockedError,
    DictionaryNotFoundError,
    DictionaryRateLimitError,
    DictionaryVersionConflictError,
    InvalidDictionaryRequestError,
    SharedDictionaryNotFoundError,
} from '../../../application/dictionary-errors';
import type {
    DictionaryOperationContext,
    DictionaryStore,
} from '../../../application/ports/dictionary-store';
import type { DictionaryInterchangePair } from '../../../domain/interchange';
import {
    assertDictionaryOwnerCapacity,
    normalizeCardValues,
    normalizeDictionaryCardSourceForSearch,
    normalizeDictionaryDetails,
    dictionaryLimits,
    type DictionaryOwnerLimits,
} from '../../../domain/limits';
import {
    assertDictionaryCardCapacity,
    dictionaryCardSortGap,
} from '../../../domain/ordering';
import {
    assertCardSettingsOverrideTransition,
    assertDictionarySettingsTransition,
    defaultDictionarySettings,
    resolveCardSettings,
    type CardSettingsOverrides,
    type DictionarySettings,
} from '../../../domain/settings';
import { resolveCardMutationAuthorship } from '../../../domain/authorship';
import { DictionaryCardRevisionSnapshotSchema } from './revision-snapshot-schema';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryIdempotencyKeysTable,
    dictionarySettingsTable,
} from './schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

type DictionaryDatabase = PostgresJsDatabase<typeof databaseSchema>;
type DictionaryTransaction = Parameters<
    Parameters<DictionaryDatabase['transaction']>[0]
>[0];
type QueryDatabase = DictionaryDatabase | DictionaryTransaction;

export interface DictionaryIdGenerator {
    generate(): string;
}

const idempotencyLifetimeMs = 24 * 60 * 60 * 1_000;
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DictionaryRow = typeof dictionariesTable.$inferSelect;
type SettingsRow = typeof dictionarySettingsTable.$inferSelect;
type CardRow = typeof dictionaryCardsTable.$inferSelect;

function abort(context: DictionaryOperationContext): void {
    context.signal.throwIfAborted();
}

function iso(value: Date): string {
    return value.toISOString();
}

function encodeCursor(value: unknown): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor<T>(
    cursor: string | undefined,
    guard: (value: unknown) => value is T,
): T | null {
    if (!cursor) return null;
    try {
        const value: unknown = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8'),
        );
        if (guard(value)) return value;
    } catch {
        // Invalid cursors are deliberately handled as a stable request error.
    }
    throw new InvalidDictionaryRequestError();
}

function isDictionaryCursor(
    value: unknown,
): value is { id: string; updatedAt: string } {
    if (!value || typeof value !== 'object') return false;
    const cursor = value as Record<string, unknown>;
    return (
        typeof cursor.id === 'string' &&
        uuidPattern.test(cursor.id) &&
        typeof cursor.updatedAt === 'string' &&
        !Number.isNaN(Date.parse(cursor.updatedAt))
    );
}

function isCardCursor(value: unknown): value is {
    dictionaryVersion: number;
    id: string;
    settingsVersion: number;
    sortKey: string;
} {
    return Boolean(
        value &&
        typeof value === 'object' &&
        typeof (value as Record<string, unknown>).id === 'string' &&
        uuidPattern.test(String((value as Record<string, unknown>).id)) &&
        Number.isSafeInteger(
            (value as Record<string, unknown>).dictionaryVersion,
        ) &&
        Number((value as Record<string, unknown>).dictionaryVersion) > 0 &&
        Number.isSafeInteger(
            (value as Record<string, unknown>).settingsVersion,
        ) &&
        Number((value as Record<string, unknown>).settingsVersion) > 0 &&
        /^\d+$/.test(String((value as Record<string, unknown>).sortKey)),
    );
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function normalizedSource(value: string): string {
    return normalizeDictionaryCardSourceForSearch(value);
}

function settingsFromRow(row: SettingsRow): DictionarySettings {
    return {
        customNotationLabel: row.customNotationLabel,
        definitionEnabled: row.definitionEnabled,
        definitionLanguageRole: row.definitionLanguageRole,
        exampleEnabled: row.exampleEnabled,
        exampleLanguageRole: row.exampleLanguageRole,
        exampleTranslationEnabled: row.exampleTranslationEnabled,
        transcriptionEnabled: row.transcriptionEnabled,
        transcriptionNotation: row.transcriptionNotation,
        version: row.version,
    };
}

function settingsValues(row: SettingsRow): DictionarySettingsValues {
    return {
        definitionEnabled: row.definitionEnabled,
        definitionLanguage: row.definitionLanguageRole,
        exampleEnabled: row.exampleEnabled,
        exampleLanguage: row.exampleLanguageRole,
        exampleTranslationEnabled: row.exampleTranslationEnabled,
        transcriptionCustomLabel: row.customNotationLabel,
        transcriptionEnabled: row.transcriptionEnabled,
        transcriptionNotation: row.transcriptionNotation,
    };
}

function overridesFromRow(row: CardRow): CardSettingsOverrides {
    return {
        customNotationLabel: row.customNotationLabelOverride,
        definitionEnabled: row.definitionEnabledOverride,
        definitionLanguageRole: row.definitionLanguageRoleOverride,
        exampleEnabled: row.exampleEnabledOverride,
        exampleLanguageRole: row.exampleLanguageRoleOverride,
        exampleTranslationEnabled: row.exampleTranslationEnabledOverride,
        transcriptionEnabled: row.transcriptionEnabledOverride,
        transcriptionNotation: row.transcriptionNotationOverride,
    };
}

function wireOverrides(row: CardRow): DictionaryCardOverrides {
    return {
        definitionEnabled: row.definitionEnabledOverride,
        definitionLanguage: row.definitionLanguageRoleOverride,
        exampleEnabled: row.exampleEnabledOverride,
        exampleLanguage: row.exampleLanguageRoleOverride,
        exampleTranslationEnabled: row.exampleTranslationEnabledOverride,
        transcriptionCustomLabel: row.customNotationLabelOverride,
        transcriptionEnabled: row.transcriptionEnabledOverride,
        transcriptionNotation: row.transcriptionNotationOverride,
    };
}

function cardValues(row: CardRow): DictionaryCardValues {
    return {
        definition: row.definition,
        example: row.example,
        exampleTranslation: row.exampleTranslation,
        source: row.source,
        transcription: row.transcription,
        translation: row.translation,
    };
}

function mapCard(row: CardRow, settings: SettingsRow): DictionaryCard {
    const effective = resolveCardSettings({
        dictionary: settingsFromRow(settings),
        overrides: overridesFromRow(row),
    });
    return {
        archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
        authorship: row.authorship,
        createdAt: iso(row.createdAt),
        dictionaryId: row.dictionaryId,
        effectiveSettings: {
            definitionEnabled: effective.definitionEnabled,
            definitionLanguage: effective.definitionLanguageRole,
            exampleEnabled: effective.exampleEnabled,
            exampleLanguage: effective.exampleLanguageRole,
            exampleTranslationEnabled: effective.exampleTranslationEnabled,
            exampleTranslationLanguage:
                effective.exampleTranslationLanguageRole,
            transcriptionCustomLabel: effective.customNotationLabel,
            transcriptionEnabled: effective.transcriptionEnabled,
            transcriptionNotation: effective.transcriptionNotation,
        },
        id: row.id,
        lifecycle: row.lifecycle,
        overrides: wireOverrides(row),
        position: row.sortKey.toString(),
        settingsVersion: settings.version,
        updatedAt: iso(row.updatedAt),
        values: cardValues(row),
        version: row.version,
    };
}

function mapSummary(
    row: DictionaryRow,
    settings: SettingsRow,
    activeCardCount: number,
    languagePairLocked: boolean,
): DictionarySummary {
    return {
        activeCardCount,
        archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
        createdAt: iso(row.createdAt),
        description: row.description,
        id: row.id,
        lifecycle: row.lifecycle,
        languagePairLocked,
        name: row.name,
        settingsVersion: settings.version,
        sourceLanguage:
            row.sourceLanguageTag as DictionarySummary['sourceLanguage'],
        targetLanguage:
            row.targetLanguageTag as DictionarySummary['targetLanguage'],
        updatedAt: iso(row.updatedAt),
        version: row.version,
        visibility: row.visibility,
    };
}

function mapOwned(
    row: DictionaryRow,
    settings: SettingsRow,
    activeCardCount: number,
    languagePairLocked: boolean,
): OwnedDictionary {
    return {
        ...mapSummary(row, settings, activeCardCount, languagePairLocked),
        settings: {
            updatedAt: iso(settings.updatedAt),
            values: settingsValues(settings),
            version: settings.version,
        },
        sourceDictionaryId: row.sourceDictionaryId,
    };
}

function revisionSnapshot(row: CardRow, settings: SettingsRow) {
    const effective = resolveCardSettings({
        dictionary: settingsFromRow(settings),
        overrides: overridesFromRow(row),
    });
    return DictionaryCardRevisionSnapshotSchema.parse({
        authorship: row.authorship,
        cardVersion: row.version,
        effectiveSettings: effective,
        rawOverrides: overridesFromRow(row),
        schemaVersion: 1,
        settingsVersion: settings.version,
        values: cardValues(row),
    });
}

export class DrizzleDictionaryStore implements DictionaryStore {
    public constructor(
        private readonly database: DictionaryDatabase,
        private readonly ids: DictionaryIdGenerator,
        private readonly ownerLimits: DictionaryOwnerLimits = dictionaryLimits,
    ) {}

    public async listDictionaries(
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
        const rows = await this.database
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
            .orderBy(
                desc(dictionariesTable.updatedAt),
                desc(dictionariesTable.id),
            )
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

    public async authorizeDictionaryImportTarget(
        input: Parameters<
            DictionaryStore['authorizeDictionaryImportTarget']
        >[0],
    ): Promise<void> {
        abort(input.context);
        if (input.target.kind === 'new') return;
        const current = await this.readOwnedStateForExport(
            this.database,
            input.ownerId,
            input.target.dictionaryId,
        );
        if (
            input.requireExpectedVersions &&
            (current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !==
                    input.target.expectedDictionaryVersion ||
                current.settings.version !==
                    input.target.expectedSettingsVersion)
        )
            throw new DictionaryVersionConflictError();
    }

    public async createDictionary(
        input: Parameters<DictionaryStore['createDictionary']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            await this.lockOwnerCapacity(tx, input.ownerId);
            const replay = await this.reserveIdempotency(tx, input, 'create');
            if (replay) return this.readOwned(tx, input.ownerId, replay);
            await this.assertOwnerCapacityLocked(tx, input.ownerId, 1, 0);
            abort(input.context);
            const details = normalizeDictionaryDetails(input.request);
            const dictionaryId = this.ids.generate();
            const requestedSettings = input.request.settings;
            const settings: DictionarySettings = requestedSettings
                ? {
                      customNotationLabel:
                          requestedSettings.transcriptionCustomLabel,
                      definitionEnabled: requestedSettings.definitionEnabled,
                      definitionLanguageRole:
                          requestedSettings.definitionLanguage,
                      exampleEnabled: requestedSettings.exampleEnabled,
                      exampleLanguageRole: requestedSettings.exampleLanguage,
                      exampleTranslationEnabled:
                          requestedSettings.exampleTranslationEnabled,
                      transcriptionEnabled:
                          requestedSettings.transcriptionEnabled,
                      transcriptionNotation:
                          requestedSettings.transcriptionNotation,
                      version: 1,
                  }
                : { ...defaultDictionarySettings };
            assertDictionarySettingsTransition({
                next: settings,
                previous: {
                    ...defaultDictionarySettings,
                    exampleEnabled: false,
                    exampleTranslationEnabled: false,
                },
            });
            await tx.insert(dictionariesTable).values({
                createdAt: input.context.now,
                description: details.description,
                id: dictionaryId,
                name: details.name,
                ownerId: input.ownerId,
                sourceLanguageTag: input.request.sourceLanguage,
                targetLanguageTag: input.request.targetLanguage,
                updatedAt: input.context.now,
            });
            await tx.insert(dictionarySettingsTable).values({
                createdAt: input.context.now,
                customNotationLabel: settings.customNotationLabel,
                definitionEnabled: settings.definitionEnabled,
                definitionLanguageRole: settings.definitionLanguageRole,
                dictionaryId,
                exampleEnabled: settings.exampleEnabled,
                exampleLanguageRole: settings.exampleLanguageRole,
                exampleTranslationEnabled: settings.exampleTranslationEnabled,
                transcriptionEnabled: settings.transcriptionEnabled,
                transcriptionNotation: settings.transcriptionNotation,
                updatedAt: input.context.now,
            });
            await this.completeIdempotency(
                tx,
                input.ownerId,
                'create',
                input.idempotencyKey,
                dictionaryId,
                input.context.now,
            );
            return this.readOwned(tx, input.ownerId, dictionaryId);
        });
    }

    public readDictionary(
        input: Parameters<DictionaryStore['readDictionary']>[0],
    ) {
        abort(input.context);
        return this.readOwned(this.database, input.ownerId, input.dictionaryId);
    }

    public async previewDictionaryImport(
        input: Parameters<DictionaryStore['previewDictionaryImport']>[0],
    ) {
        abort(input.context);
        const target = input.target;
        return this.database.transaction(async (tx) => {
            let dictionaryRemaining: number = dictionaryLimits.cardCapacity;
            let existingSources: Array<{
                cardId: string;
                normalizedSource: string;
            }> = [];
            if (target.kind === 'existing') {
                const current = await this.readOwnedState(
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
                        (await this.activeCardCount(tx, target.dictionaryId)),
                );
                existingSources = await this.importExistingSources(
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
                    this.ownerLimits.ownerDictionaryCapacity;
            const remainingRows = dictionarySlotAvailable
                ? Math.max(
                      0,
                      Math.min(
                          dictionaryRemaining,
                          this.ownerLimits.ownerRetainedCardCapacity -
                              Number(ownerCounts.cards),
                          this.ownerLimits.ownerRevisionCapacity -
                              Number(ownerCounts.revisions),
                      ),
                  )
                : 0;
            return {
                remainingRows,
                warnings: this.importDuplicateWarnings(
                    existingSources,
                    input.rows,
                ),
            };
        });
    }

    public async importDictionary(
        input: Parameters<DictionaryStore['importDictionary']>[0],
    ): Promise<DictionaryDeterministicImportResponse> {
        if (input.rows.length === 0) throw new InvalidDictionaryRequestError();
        return this.database.transaction(async (tx) => {
            abort(input.context);
            await this.acquireGlobalPermit(tx, 5, 4);
            await this.lockOwnerCapacity(tx, input.ownerId);
            const replay = await this.reserveBulkIdempotency(tx, input);
            if (replay) return replay;

            await this.assertOwnerCapacityLocked(
                tx,
                input.ownerId,
                input.target.kind === 'new' ? 1 : 0,
                input.rows.length,
                input.rows.length,
            );
            abort(input.context);

            let dictionary: DictionaryRow;
            let settings: SettingsRow;
            if (input.target.kind === 'new') {
                const details = normalizeDictionaryDetails(input.target);
                const dictionaryId = this.ids.generate();
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
                        exampleEnabled:
                            defaultDictionarySettings.exampleEnabled,
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
                const current = await this.lockOwned(
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
                    (await this.activeCardCount(tx, current.dictionary.id)) +
                        input.rows.length,
                );
                dictionary = current.dictionary;
                settings = current.settings;
            }

            const warnings = this.importDuplicateWarnings(
                await this.importExistingSources(tx, dictionary.id, input.rows),
                input.rows,
            );
            const initialSortKey = await this.nextActiveSortKey(
                tx,
                dictionary.id,
            );
            const pending = input.rows.map((sourceRow, index) => {
                const values = normalizeCardValues({
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: sourceRow.source,
                    transcription: null,
                    translation: sourceRow.translation,
                });
                return {
                    id: this.ids.generate(),
                    rowIndex: sourceRow.rowIndex,
                    sortKey:
                        initialSortKey + BigInt(index) * dictionaryCardSortGap,
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
                            ...this.cardInsertValues(card.values, {
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
                            normalizedSource: normalizedSource(
                                card.values.source,
                            ),
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
                            id: this.ids.generate(),
                            mutationKind: 'deterministic_import' as const,
                            revisionNumber: card.version,
                            schemaVersion: 1,
                            settingsVersion: settings.version,
                            snapshot: revisionSnapshot(card, settings),
                        })),
                );
            }
            if (input.target.kind === 'existing') {
                const version = await this.bumpDictionary(
                    tx,
                    dictionary,
                    input.context.now,
                );
                dictionary = { ...dictionary, version };
            }
            const owned = await this.readOwned(
                tx,
                input.ownerId,
                dictionary.id,
            );
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
            await this.completeBulkIdempotency(tx, input, result);
            return result;
        });
    }

    public async updateDictionary(
        input: Parameters<DictionaryStore['updateDictionary']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            const current = await this.lockOwned(
                tx,
                input.ownerId,
                input.dictionaryId,
            );
            abort(input.context);
            if (
                current.dictionary.version !==
                input.request.expectedDictionaryVersion
            )
                throw new DictionaryVersionConflictError();
            const activeCount = await this.cardCount(tx, input.dictionaryId);
            const source =
                input.request.sourceLanguage ??
                current.dictionary.sourceLanguageTag;
            const target =
                input.request.targetLanguage ??
                current.dictionary.targetLanguageTag;
            if (
                activeCount > 0 &&
                (source !== current.dictionary.sourceLanguageTag ||
                    target !== current.dictionary.targetLanguageTag)
            )
                throw new DictionaryLanguagePairLockedError();
            if (source === target) throw new InvalidDictionaryRequestError();
            const details = normalizeDictionaryDetails({
                description:
                    input.request.description === undefined
                        ? current.dictionary.description
                        : input.request.description,
                name: input.request.name ?? current.dictionary.name,
            });
            if (input.request.settings) {
                if (
                    current.settings.version !==
                    input.request.expectedSettingsVersion
                )
                    throw new DictionaryVersionConflictError();
                const patch = input.request.settings;
                const next: DictionarySettings = {
                    ...settingsFromRow(current.settings),
                    ...(patch.transcriptionEnabled === undefined
                        ? {}
                        : { transcriptionEnabled: patch.transcriptionEnabled }),
                    ...(patch.transcriptionNotation === undefined
                        ? {}
                        : {
                              transcriptionNotation:
                                  patch.transcriptionNotation,
                          }),
                    ...(patch.transcriptionCustomLabel === undefined
                        ? {}
                        : {
                              customNotationLabel:
                                  patch.transcriptionCustomLabel,
                          }),
                    ...(patch.definitionEnabled === undefined
                        ? {}
                        : { definitionEnabled: patch.definitionEnabled }),
                    ...(patch.definitionLanguage === undefined
                        ? {}
                        : { definitionLanguageRole: patch.definitionLanguage }),
                    ...(patch.exampleEnabled === undefined
                        ? {}
                        : { exampleEnabled: patch.exampleEnabled }),
                    ...(patch.exampleLanguage === undefined
                        ? {}
                        : { exampleLanguageRole: patch.exampleLanguage }),
                    ...(patch.exampleTranslationEnabled === undefined
                        ? {}
                        : {
                              exampleTranslationEnabled:
                                  patch.exampleTranslationEnabled,
                          }),
                    version: current.settings.version + 1,
                };
                assertDictionarySettingsTransition({
                    next,
                    previous: settingsFromRow(current.settings),
                });
                const settingsPatch: Partial<
                    typeof dictionarySettingsTable.$inferInsert
                > = {
                    customNotationLabel: next.customNotationLabel,
                    definitionEnabled: next.definitionEnabled,
                    definitionLanguageRole: next.definitionLanguageRole,
                    exampleEnabled: next.exampleEnabled,
                    exampleLanguageRole: next.exampleLanguageRole,
                    exampleTranslationEnabled: next.exampleTranslationEnabled,
                    transcriptionEnabled: next.transcriptionEnabled,
                    transcriptionNotation: next.transcriptionNotation,
                    updatedAt: input.context.now,
                    version: next.version,
                };
                await tx
                    .update(dictionarySettingsTable)
                    .set(settingsPatch)
                    .where(
                        and(
                            eq(
                                dictionarySettingsTable.dictionaryId,
                                input.dictionaryId,
                            ),
                            eq(
                                dictionarySettingsTable.version,
                                current.settings.version,
                            ),
                        ),
                    );
            }
            const makePrivate = input.request.visibility === 'private';
            await tx
                .update(dictionariesTable)
                .set({
                    description: details.description,
                    name: details.name,
                    ...(makePrivate
                        ? {
                              shareKeyDigest: null,
                              shareKeyRotatedAt: null,
                              shareKeyVersion: null,
                              shareLocator: null,
                              visibility: 'private' as const,
                          }
                        : {}),
                    sourceLanguageTag: source,
                    targetLanguageTag: target,
                    updatedAt: input.context.now,
                    version: current.dictionary.version + 1,
                })
                .where(
                    and(
                        eq(dictionariesTable.id, input.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                        eq(
                            dictionariesTable.version,
                            current.dictionary.version,
                        ),
                    ),
                );
            return this.readOwned(tx, input.ownerId, input.dictionaryId);
        });
    }

    public archiveDictionary(
        input: Parameters<DictionaryStore['archiveDictionary']>[0],
    ) {
        return this.dictionaryLifecycle(input, 'archived');
    }

    public restoreDictionary(
        input: Parameters<DictionaryStore['restoreDictionary']>[0],
    ) {
        return this.dictionaryLifecycle(input, 'active');
    }

    public async listCards(input: Parameters<DictionaryStore['listCards']>[0]) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            const current = await this.readOwnedState(
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

    public async streamDictionaryExport(
        input: Parameters<DictionaryStore['streamDictionaryExport']>[0],
    ): Promise<void> {
        await this.database.transaction(
            async (tx) => {
                abort(input.context);
                await this.acquireGlobalPermit(tx, 6, 8);
                await this.acquireOwnerPermit(tx, input.ownerId, 6);
                const current = await this.readOwnedStateForExport(
                    tx,
                    input.ownerId,
                    input.dictionaryId,
                );
                await input.onMetadata({
                    dictionary: {
                        description: current.dictionary.description,
                        name: current.dictionary.name,
                        settings: settingsValues(current.settings),
                        sourceLanguage: current.dictionary
                            .sourceLanguageTag as OwnedDictionary['sourceLanguage'],
                        targetLanguage: current.dictionary
                            .targetLanguageTag as OwnedDictionary['targetLanguage'],
                    },
                    format: input.format,
                });

                const exportPageSize = 100;
                let cursor: { id: string; sortKey: bigint } | null = null;
                while (true) {
                    abort(input.context);
                    const rows: CardRow[] = await tx
                        .select()
                        .from(dictionaryCardsTable)
                        .where(
                            and(
                                eq(
                                    dictionaryCardsTable.dictionaryId,
                                    input.dictionaryId,
                                ),
                                eq(dictionaryCardsTable.lifecycle, 'active'),
                                ...(cursor
                                    ? [
                                          or(
                                              gt(
                                                  dictionaryCardsTable.sortKey,
                                                  cursor.sortKey,
                                              ),
                                              and(
                                                  eq(
                                                      dictionaryCardsTable.sortKey,
                                                      cursor.sortKey,
                                                  ),
                                                  gt(
                                                      dictionaryCardsTable.id,
                                                      cursor.id,
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
                        .limit(exportPageSize);
                    if (rows.length === 0) break;
                    await input.onCards(
                        rows.map((row) => mapCard(row, current.settings)),
                    );
                    const last = rows.at(-1)!;
                    cursor = { id: last.id, sortKey: last.sortKey };
                }
            },
            { accessMode: 'read only', isolationLevel: 'repeatable read' },
        );
    }

    public async createCard(
        input: Parameters<DictionaryStore['createCard']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            await this.acquireGlobalPermit(tx, 4, 32);
            await this.assertOwnerCapacity(tx, input.ownerId, 0, 1, 1);
            const current = await this.lockOwned(
                tx,
                input.ownerId,
                input.dictionaryId,
            );
            abort(input.context);
            this.assertAggregateVersions(
                current,
                input.request.expectedDictionaryVersion,
                input.request.expectedSettingsVersion,
            );
            if (current.dictionary.lifecycle !== 'active')
                throw new DictionaryVersionConflictError();
            const activeCount = await this.activeCardCount(
                tx,
                input.dictionaryId,
            );
            assertDictionaryCardCapacity(activeCount + 1);
            const values = normalizeCardValues(input.request.values);
            const duplicateSource = await this.sourceDuplicate(
                tx,
                input.dictionaryId,
                normalizedSource(values.source),
            );
            const overrides = this.domainOverrides(input.request.overrides);
            assertCardSettingsOverrideTransition({
                dictionary: settingsFromRow(current.settings),
                next: overrides,
                previous: null,
            });
            const cardId = this.ids.generate();
            const [row] = await tx
                .insert(dictionaryCardsTable)
                .values({
                    ...this.cardInsertValues(values, overrides),
                    authorship: 'human',
                    createdAt: input.context.now,
                    dictionaryId: input.dictionaryId,
                    id: cardId,
                    normalizedSource: normalizedSource(values.source),
                    sortKey: await this.nextActiveSortKey(
                        tx,
                        input.dictionaryId,
                    ),
                    updatedAt: input.context.now,
                })
                .returning();
            if (!row) throw new DictionaryVersionConflictError();
            await this.insertRevision(
                tx,
                row,
                current.settings,
                input.ownerId,
                'manual_create',
                input.context.now,
            );
            const dictionaryVersion = await this.bumpDictionary(
                tx,
                current.dictionary,
                input.context.now,
            );
            return {
                card: mapCard(row, current.settings),
                dictionaryVersion,
                duplicateSource,
            };
        });
    }

    public async readCard(input: Parameters<DictionaryStore['readCard']>[0]) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            const current = await this.readOwnedState(
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
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            input.dictionaryId,
                        ),
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

    public async updateCard(
        input: Parameters<DictionaryStore['updateCard']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            await this.acquireGlobalPermit(tx, 4, 32);
            await this.lockOwnerCapacity(tx, input.ownerId);
            const current = await this.lockOwned(
                tx,
                input.ownerId,
                input.dictionaryId,
            );
            this.assertAggregateVersions(
                current,
                input.request.expectedDictionaryVersion,
                input.request.expectedSettingsVersion,
            );
            const row = await this.lockCard(
                tx,
                input.dictionaryId,
                input.cardId,
            );
            abort(input.context);
            if (row.version !== input.request.expectedCardVersion)
                throw new DictionaryVersionConflictError();
            const values = normalizeCardValues(
                this.mergeCardValues(cardValues(row), input.request.values),
            );
            const duplicateSource = await this.sourceDuplicate(
                tx,
                input.dictionaryId,
                normalizedSource(values.source),
                row.id,
            );
            const overrides = this.domainOverrides(
                this.mergeOverrides(
                    wireOverrides(row),
                    input.request.overrides,
                ),
            );
            assertCardSettingsOverrideTransition({
                dictionary: settingsFromRow(current.settings),
                next: overrides,
                previous: overridesFromRow(row),
            });
            const changed =
                JSON.stringify(values) !== JSON.stringify(cardValues(row)) ||
                JSON.stringify(overrides) !==
                    JSON.stringify(overridesFromRow(row));
            if (!changed)
                return {
                    card: mapCard(row, current.settings),
                    dictionaryVersion: current.dictionary.version,
                    duplicateSource,
                };
            await this.assertOwnerCapacityLocked(tx, input.ownerId, 0, 0, 1);
            const authorship = resolveCardMutationAuthorship({
                mutationKind: 'manual_edit',
                prior: row.authorship,
                semanticChange: true,
            }).authorship;
            const [updated] = await tx
                .update(dictionaryCardsTable)
                .set({
                    ...this.cardInsertValues(values, overrides),
                    authorship,
                    normalizedSource: normalizedSource(values.source),
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
            await this.insertRevision(
                tx,
                updated,
                current.settings,
                input.ownerId,
                'manual_edit',
                input.context.now,
            );
            const dictionaryVersion = await this.bumpDictionary(
                tx,
                current.dictionary,
                input.context.now,
            );
            return {
                card: mapCard(updated, current.settings),
                dictionaryVersion,
                duplicateSource,
            };
        });
    }

    public archiveCard(input: Parameters<DictionaryStore['archiveCard']>[0]) {
        return this.cardLifecycle(input, 'archived');
    }

    public restoreCard(input: Parameters<DictionaryStore['restoreCard']>[0]) {
        return this.cardLifecycle(input, 'active');
    }

    public async reorderCards(
        input: Parameters<DictionaryStore['reorderCards']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            await this.acquireGlobalPermit(tx, 3, 8);
            const current = await this.lockOwned(
                tx,
                input.ownerId,
                input.dictionaryId,
            );
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
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            input.dictionaryId,
                        ),
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
            const sortedIndexes = [...indexes].sort(
                (left, right) => left - right,
            );
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
            const assignments = input.request.orderedCardIds.map(
                (id, index) => ({ id, sortKey: windowKeys[index]! }),
            );
            const reorderChunkSize = 500;
            for (
                let offset = 0;
                offset < assignments.length;
                offset += reorderChunkSize
            ) {
                abort(input.context);
                const chunk = assignments.slice(
                    offset,
                    offset + reorderChunkSize,
                );
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
                dictionaryVersion: await this.bumpDictionary(
                    tx,
                    current.dictionary,
                    input.context.now,
                ),
            };
        });
    }

    public async rotateShare(
        input: Parameters<DictionaryStore['rotateShare']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            const current = await this.lockOwned(
                tx,
                input.ownerId,
                input.dictionaryId,
            );
            abort(input.context);
            if (
                current.dictionary.version !==
                    input.expectedDictionaryVersion ||
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
                        eq(
                            dictionariesTable.version,
                            current.dictionary.version,
                        ),
                    ),
                );
            return this.readOwned(tx, input.ownerId, input.dictionaryId);
        });
    }

    public async findSharedCandidate(
        input: Parameters<DictionaryStore['findSharedCandidate']>[0],
    ) {
        abort(input.context);
        const [row] = await this.database
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

    public async readSharedDictionary(
        input: Parameters<DictionaryStore['readSharedDictionary']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            await this.acquireGlobalPermit(tx, 1, 32);
            abort(input.context);
            const [row] = await tx
                .select({
                    dictionary: dictionariesTable,
                    settings: dictionarySettingsTable,
                })
                .from(dictionariesTable)
                .innerJoin(
                    dictionarySettingsTable,
                    eq(
                        dictionarySettingsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
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
            const activeCount = await this.activeCardCount(
                tx,
                row.dictionary.id,
            );
            const allCardCount = await this.cardCount(tx, row.dictionary.id);
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

    public async forkSharedDictionary(
        input: Parameters<DictionaryStore['forkSharedDictionary']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            await this.acquireGlobalPermit(tx, 2, 4);
            abort(input.context);
            await this.lockOwnerCapacity(tx, input.ownerId);
            abort(input.context);
            const replay = await this.reserveIdempotency(tx, input, 'fork');
            if (replay) return this.readOwned(tx, input.ownerId, replay);
            const [source] = await tx
                .select({
                    dictionary: dictionariesTable,
                    settings: dictionarySettingsTable,
                })
                .from(dictionariesTable)
                .innerJoin(
                    dictionarySettingsTable,
                    eq(
                        dictionarySettingsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
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
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            source.dictionary.id,
                        ),
                        eq(dictionaryCardsTable.lifecycle, 'active'),
                    ),
                );
            const sourceCardCount = sourceCountRow?.value ?? 0;
            assertDictionaryCardCapacity(sourceCardCount);
            await this.assertOwnerCapacityLocked(
                tx,
                input.ownerId,
                1,
                sourceCardCount,
                sourceCardCount,
            );
            const dictionaryId = this.ids.generate();
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
                updatedAt: input.context.now,
            });
            const [settings] = await tx
                .insert(dictionarySettingsTable)
                .values({
                    createdAt: input.context.now,
                    customNotationLabel: source.settings.customNotationLabel,
                    definitionEnabled: source.settings.definitionEnabled,
                    definitionLanguageRole:
                        source.settings.definitionLanguageRole,
                    dictionaryId,
                    exampleEnabled: source.settings.exampleEnabled,
                    exampleLanguageRole: source.settings.exampleLanguageRole,
                    exampleTranslationEnabled:
                        source.settings.exampleTranslationEnabled,
                    transcriptionEnabled: source.settings.transcriptionEnabled,
                    transcriptionNotation:
                        source.settings.transcriptionNotation,
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
                            ...this.cardInsertValues(
                                cardValues(sourceCard),
                                overridesFromRow(sourceCard),
                            ),
                            authorship: sourceCard.authorship,
                            createdAt: input.context.now,
                            dictionaryId,
                            id: this.ids.generate(),
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
                        id: this.ids.generate(),
                        mutationKind: 'fork' as const,
                        revisionNumber: card.version,
                        schemaVersion: 1,
                        settingsVersion: settings.version,
                        snapshot: revisionSnapshot(card, settings),
                    })),
                );
                const lastSourceCard: CardRow = chunk.at(-1)!;
                sourceCursor = {
                    id: lastSourceCard.id,
                    sortKey: lastSourceCard.sortKey,
                };
            }
            await this.completeIdempotency(
                tx,
                input.ownerId,
                'fork',
                input.idempotencyKey,
                dictionaryId,
                input.context.now,
            );
            return this.readOwned(tx, input.ownerId, dictionaryId);
        });
    }

    public async replayForkDictionary(
        input: Parameters<DictionaryStore['replayForkDictionary']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            const [existing] = await tx
                .select()
                .from(dictionaryIdempotencyKeysTable)
                .where(
                    and(
                        eq(
                            dictionaryIdempotencyKeysTable.ownerId,
                            input.ownerId,
                        ),
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
            return this.readOwned(
                tx,
                input.ownerId,
                existing.resultDictionaryId,
            );
        });
    }

    private async dictionaryLifecycle(
        input: Parameters<DictionaryStore['archiveDictionary']>[0],
        lifecycle: 'active' | 'archived',
    ) {
        return this.database.transaction(async (tx) => {
            const current = await this.lockOwned(
                tx,
                input.ownerId,
                input.dictionaryId,
            );
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
                    await this.activeCardCount(tx, input.dictionaryId),
                    (await this.cardCount(tx, input.dictionaryId)) > 0,
                );
            await tx
                .update(dictionariesTable)
                .set({
                    archivedAt:
                        lifecycle === 'archived' ? input.context.now : null,
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
                        eq(
                            dictionariesTable.version,
                            current.dictionary.version,
                        ),
                    ),
                );
            return this.readOwned(tx, input.ownerId, input.dictionaryId);
        });
    }

    private async cardLifecycle(
        input: Parameters<DictionaryStore['archiveCard']>[0],
        lifecycle: 'active' | 'archived',
    ) {
        return this.database.transaction(async (tx) => {
            const current = await this.lockOwned(
                tx,
                input.ownerId,
                input.dictionaryId,
            );
            if (
                current.dictionary.version !==
                input.request.expectedDictionaryVersion
            )
                throw new DictionaryVersionConflictError();
            const row = await this.lockCard(
                tx,
                input.dictionaryId,
                input.cardId,
            );
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
                    (await this.activeCardCount(tx, input.dictionaryId)) + 1,
                );
            let restoredSortKey = row.sortKey;
            if (lifecycle === 'active') {
                restoredSortKey = await this.nextActiveSortKey(
                    tx,
                    input.dictionaryId,
                );
            }
            const [updated] = await tx
                .update(dictionaryCardsTable)
                .set({
                    archivedAt:
                        lifecycle === 'archived' ? input.context.now : null,
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
                dictionaryVersion: await this.bumpDictionary(
                    tx,
                    current.dictionary,
                    input.context.now,
                ),
            };
        });
    }

    private async lockOwned(
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

    private async readOwnedState(
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

    private async readOwnedStateForExport(
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

    private async readOwned(
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

    private async readSettings(database: QueryDatabase, dictionaryId: string) {
        const [settings] = await database
            .select()
            .from(dictionarySettingsTable)
            .where(eq(dictionarySettingsTable.dictionaryId, dictionaryId))
            .limit(1);
        if (!settings) throw new DictionaryNotFoundError();
        return settings;
    }

    private async lockCard(
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

    private async activeCardCount(
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

    private async acquireGlobalPermit(
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

    private async acquireOwnerPermit(
        tx: DictionaryTransaction,
        ownerId: string,
        operation: number,
    ): Promise<void> {
        const [row] = await tx.execute(
            sql`select pg_try_advisory_xact_lock(hashtext(${ownerId}), ${operation}) as acquired`,
        );
        if (row?.acquired !== true) throw new DictionaryRateLimitError(5);
    }

    private async lockOwnerCapacity(
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

    private async assertOwnerCapacity(
        tx: DictionaryTransaction,
        ownerId: string,
        additionalDictionaries: number,
        additionalCards: number,
        additionalRevisions = 0,
    ): Promise<void> {
        await this.lockOwnerCapacity(tx, ownerId);
        await this.assertOwnerCapacityLocked(
            tx,
            ownerId,
            additionalDictionaries,
            additionalCards,
            additionalRevisions,
        );
    }

    private async assertOwnerCapacityLocked(
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
                eq(
                    dictionaryCardRevisionsTable.dictionaryId,
                    dictionariesTable.id,
                ),
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
            this.ownerLimits,
        );
    }

    private async nextActiveSortKey(
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

    private async cardCount(
        database: QueryDatabase,
        dictionaryId: string,
    ): Promise<number> {
        const [row] = await database
            .select({ value: count() })
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.dictionaryId, dictionaryId));
        return row?.value ?? 0;
    }

    private async sourceDuplicate(
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

    private async importExistingSources(
        database: QueryDatabase,
        dictionaryId: string,
        rows: readonly DictionaryInterchangePair[],
    ): Promise<Array<{ cardId: string; normalizedSource: string }>> {
        const sources = [
            ...new Set(rows.map((row) => normalizedSource(row.source))),
        ];
        const matches: Array<{
            cardId: string;
            normalizedSource: string;
        }> = [];
        const lookupChunkSize = 500;
        for (
            let offset = 0;
            offset < sources.length;
            offset += lookupChunkSize
        ) {
            const chunk = sources.slice(offset, offset + lookupChunkSize);
            if (chunk.length === 0) continue;
            const found = await database
                .select({
                    cardId: dictionaryCardsTable.id,
                    normalizedSource: dictionaryCardsTable.normalizedSource,
                })
                .from(dictionaryCardsTable)
                .where(
                    and(
                        eq(dictionaryCardsTable.dictionaryId, dictionaryId),
                        inArray(dictionaryCardsTable.normalizedSource, chunk),
                    ),
                )
                .orderBy(
                    asc(dictionaryCardsTable.createdAt),
                    asc(dictionaryCardsTable.id),
                );
            matches.push(...found);
        }
        return matches;
    }

    private importDuplicateWarnings(
        existingSources: readonly {
            cardId: string;
            normalizedSource: string;
        }[],
        rows: readonly DictionaryInterchangePair[],
    ): DictionaryImportRowWarning[] {
        const firstExisting = new Map<string, string>();
        for (const existing of existingSources) {
            if (!firstExisting.has(existing.normalizedSource))
                firstExisting.set(existing.normalizedSource, existing.cardId);
        }
        const firstImported = new Map<string, number>();
        const warnings: DictionaryImportRowWarning[] = [];
        for (const row of rows) {
            const key = normalizedSource(row.source);
            const duplicateCardId = firstExisting.get(key) ?? null;
            const duplicateRowIndex = firstImported.get(key) ?? null;
            if (duplicateCardId !== null) {
                warnings.push({
                    code: 'duplicate_source',
                    duplicateCardId,
                    duplicateRowIndex: null,
                    message:
                        'A matching source already exists in this dictionary.',
                    rowIndex: row.rowIndex,
                });
            } else if (duplicateRowIndex !== null) {
                warnings.push({
                    code: 'duplicate_source',
                    duplicateCardId: null,
                    duplicateRowIndex,
                    message:
                        'A matching source appears earlier in this import.',
                    rowIndex: row.rowIndex,
                });
            }
            if (!firstImported.has(key)) firstImported.set(key, row.rowIndex);
        }
        return warnings;
    }

    private assertAggregateVersions(
        current: { dictionary: DictionaryRow; settings: SettingsRow },
        dictionaryVersion: number,
        settingsVersion: number,
    ) {
        if (
            current.dictionary.version !== dictionaryVersion ||
            current.settings.version !== settingsVersion
        )
            throw new DictionaryVersionConflictError();
    }

    private domainOverrides(
        overrides: DictionaryCardOverrides,
    ): CardSettingsOverrides {
        return {
            customNotationLabel: overrides.transcriptionCustomLabel,
            definitionEnabled: overrides.definitionEnabled,
            definitionLanguageRole: overrides.definitionLanguage,
            exampleEnabled: overrides.exampleEnabled,
            exampleLanguageRole: overrides.exampleLanguage,
            exampleTranslationEnabled: overrides.exampleTranslationEnabled,
            transcriptionEnabled: overrides.transcriptionEnabled,
            transcriptionNotation: overrides.transcriptionNotation,
        };
    }

    private mergeCardValues(
        current: DictionaryCardValues,
        patch: Parameters<
            DictionaryStore['updateCard']
        >[0]['request']['values'],
    ): DictionaryCardValues {
        if (!patch) return current;
        return {
            definition:
                patch.definition === undefined
                    ? current.definition
                    : patch.definition,
            example:
                patch.example === undefined ? current.example : patch.example,
            exampleTranslation:
                patch.exampleTranslation === undefined
                    ? current.exampleTranslation
                    : patch.exampleTranslation,
            source: patch.source ?? current.source,
            transcription:
                patch.transcription === undefined
                    ? current.transcription
                    : patch.transcription,
            translation: patch.translation ?? current.translation,
        };
    }

    private mergeOverrides(
        current: DictionaryCardOverrides,
        patch: Parameters<
            DictionaryStore['updateCard']
        >[0]['request']['overrides'],
    ): DictionaryCardOverrides {
        if (!patch) return current;
        return {
            definitionEnabled:
                patch.definitionEnabled === undefined
                    ? current.definitionEnabled
                    : patch.definitionEnabled,
            definitionLanguage:
                patch.definitionLanguage === undefined
                    ? current.definitionLanguage
                    : patch.definitionLanguage,
            exampleEnabled:
                patch.exampleEnabled === undefined
                    ? current.exampleEnabled
                    : patch.exampleEnabled,
            exampleLanguage:
                patch.exampleLanguage === undefined
                    ? current.exampleLanguage
                    : patch.exampleLanguage,
            exampleTranslationEnabled:
                patch.exampleTranslationEnabled === undefined
                    ? current.exampleTranslationEnabled
                    : patch.exampleTranslationEnabled,
            transcriptionCustomLabel:
                patch.transcriptionCustomLabel === undefined
                    ? current.transcriptionCustomLabel
                    : patch.transcriptionCustomLabel,
            transcriptionEnabled:
                patch.transcriptionEnabled === undefined
                    ? current.transcriptionEnabled
                    : patch.transcriptionEnabled,
            transcriptionNotation:
                patch.transcriptionNotation === undefined
                    ? current.transcriptionNotation
                    : patch.transcriptionNotation,
        };
    }

    private cardInsertValues(
        values: DictionaryCardValues,
        overrides: CardSettingsOverrides,
    ) {
        return {
            customNotationLabelOverride: overrides.customNotationLabel,
            definition: values.definition,
            definitionEnabledOverride: overrides.definitionEnabled,
            definitionLanguageRoleOverride: overrides.definitionLanguageRole,
            example: values.example,
            exampleEnabledOverride: overrides.exampleEnabled,
            exampleLanguageRoleOverride: overrides.exampleLanguageRole,
            exampleTranslation: values.exampleTranslation,
            exampleTranslationEnabledOverride:
                overrides.exampleTranslationEnabled,
            source: values.source,
            transcription: values.transcription,
            transcriptionEnabledOverride: overrides.transcriptionEnabled,
            transcriptionNotationOverride: overrides.transcriptionNotation,
            translation: values.translation,
        };
    }

    private async bumpDictionary(
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

    private async insertRevision(
        tx: DictionaryTransaction,
        row: CardRow,
        settings: SettingsRow,
        actorUserId: string,
        mutationKind: 'fork' | 'manual_create' | 'manual_edit',
        now: Date,
    ) {
        const snapshot = revisionSnapshot(row, settings);
        await tx.insert(dictionaryCardRevisionsTable).values({
            actorUserId,
            authorship: row.authorship,
            cardId: row.id,
            cardVersion: row.version,
            createdAt: now,
            dictionaryId: row.dictionaryId,
            id: this.ids.generate(),
            mutationKind,
            revisionNumber: row.version,
            schemaVersion: 1,
            settingsVersion: settings.version,
            snapshot,
        });
    }

    private async reserveIdempotency(
        tx: DictionaryTransaction,
        input: {
            context: DictionaryOperationContext;
            fingerprint: string;
            idempotencyKey: string;
            ownerId: string;
        },
        operation: 'create' | 'fork',
    ): Promise<string | null> {
        await tx
            .delete(dictionaryIdempotencyKeysTable)
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                    eq(dictionaryIdempotencyKeysTable.operation, operation),
                    eq(
                        dictionaryIdempotencyKeysTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                    lte(
                        dictionaryIdempotencyKeysTable.expiresAt,
                        input.context.now,
                    ),
                ),
            );
        await tx.execute(sql`
            delete from ${dictionaryIdempotencyKeysTable}
            where ${dictionaryIdempotencyKeysTable.id} in (
                select ${dictionaryIdempotencyKeysTable.id}
                from ${dictionaryIdempotencyKeysTable}
                where ${dictionaryIdempotencyKeysTable.expiresAt} <= ${input.context.now.toISOString()}::timestamptz
                order by ${dictionaryIdempotencyKeysTable.expiresAt}
                limit 100
                for update skip locked
            )
        `);
        const [inserted] = await tx
            .insert(dictionaryIdempotencyKeysTable)
            .values({
                createdAt: input.context.now,
                expiresAt: new Date(
                    input.context.now.getTime() + idempotencyLifetimeMs,
                ),
                id: this.ids.generate(),
                idempotencyKey: input.idempotencyKey,
                operation,
                ownerId: input.ownerId,
                requestFingerprint: input.fingerprint,
                updatedAt: input.context.now,
            })
            .onConflictDoNothing({
                target: [
                    dictionaryIdempotencyKeysTable.ownerId,
                    dictionaryIdempotencyKeysTable.operation,
                    dictionaryIdempotencyKeysTable.idempotencyKey,
                ],
            })
            .returning({ id: dictionaryIdempotencyKeysTable.id });
        if (inserted) return null;
        const [existing] = await tx
            .select()
            .from(dictionaryIdempotencyKeysTable)
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                    eq(dictionaryIdempotencyKeysTable.operation, operation),
                    eq(
                        dictionaryIdempotencyKeysTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                ),
            )
            .limit(1)
            .for('update');
        if (
            !existing ||
            existing.requestFingerprint !== input.fingerprint ||
            existing.state !== 'completed' ||
            !existing.resultDictionaryId
        )
            throw new DictionaryIdempotencyConflictError();
        return existing.resultDictionaryId;
    }

    private async completeIdempotency(
        tx: DictionaryTransaction,
        ownerId: string,
        operation: 'create' | 'fork',
        key: string,
        dictionaryId: string,
        now: Date,
    ) {
        await tx
            .update(dictionaryIdempotencyKeysTable)
            .set({
                completedAt: now,
                resultDictionaryId: dictionaryId,
                state: 'completed',
                updatedAt: now,
            })
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.ownerId, ownerId),
                    eq(dictionaryIdempotencyKeysTable.operation, operation),
                    eq(dictionaryIdempotencyKeysTable.idempotencyKey, key),
                    eq(dictionaryIdempotencyKeysTable.state, 'in_progress'),
                ),
            );
    }

    private async reserveBulkIdempotency(
        tx: DictionaryTransaction,
        input: Pick<
            Parameters<DictionaryStore['importDictionary']>[0],
            'context' | 'fingerprint' | 'idempotencyKey' | 'ownerId'
        >,
    ): Promise<DictionaryDeterministicImportResponse | null> {
        await tx
            .delete(dictionaryIdempotencyKeysTable)
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                    eq(dictionaryIdempotencyKeysTable.operation, 'bulk_commit'),
                    eq(
                        dictionaryIdempotencyKeysTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                    lte(
                        dictionaryIdempotencyKeysTable.expiresAt,
                        input.context.now,
                    ),
                ),
            );
        await tx.execute(sql`
            delete from ${dictionaryIdempotencyKeysTable}
            where ${dictionaryIdempotencyKeysTable.id} in (
                select ${dictionaryIdempotencyKeysTable.id}
                from ${dictionaryIdempotencyKeysTable}
                where ${dictionaryIdempotencyKeysTable.expiresAt} <= ${input.context.now.toISOString()}::timestamptz
                order by ${dictionaryIdempotencyKeysTable.expiresAt}
                limit 100
                for update skip locked
            )
        `);
        const [inserted] = await tx
            .insert(dictionaryIdempotencyKeysTable)
            .values({
                createdAt: input.context.now,
                expiresAt: new Date(
                    input.context.now.getTime() + idempotencyLifetimeMs,
                ),
                id: this.ids.generate(),
                idempotencyKey: input.idempotencyKey,
                operation: 'bulk_commit',
                ownerId: input.ownerId,
                requestFingerprint: input.fingerprint,
                updatedAt: input.context.now,
            })
            .onConflictDoNothing({
                target: [
                    dictionaryIdempotencyKeysTable.ownerId,
                    dictionaryIdempotencyKeysTable.operation,
                    dictionaryIdempotencyKeysTable.idempotencyKey,
                ],
            })
            .returning({ id: dictionaryIdempotencyKeysTable.id });
        if (inserted) return null;
        const [existing] = await tx
            .select()
            .from(dictionaryIdempotencyKeysTable)
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                    eq(dictionaryIdempotencyKeysTable.operation, 'bulk_commit'),
                    eq(
                        dictionaryIdempotencyKeysTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                ),
            )
            .limit(1)
            .for('update');
        if (
            !existing ||
            existing.requestFingerprint !== input.fingerprint ||
            existing.state !== 'completed' ||
            !existing.resultPayload
        )
            throw new DictionaryIdempotencyConflictError();
        const parsed = DictionaryDeterministicImportResponseSchema.safeParse(
            existing.resultPayload,
        );
        if (!parsed.success) throw new DictionaryIdempotencyConflictError();
        return parsed.data;
    }

    private async completeBulkIdempotency(
        tx: DictionaryTransaction,
        input: Pick<
            Parameters<DictionaryStore['importDictionary']>[0],
            'context' | 'idempotencyKey' | 'ownerId'
        >,
        result: DictionaryDeterministicImportResponse,
    ): Promise<void> {
        const updated = await tx
            .update(dictionaryIdempotencyKeysTable)
            .set({
                completedAt: input.context.now,
                resultDictionaryId: result.dictionary.id,
                resultPayload: result,
                state: 'completed',
                updatedAt: input.context.now,
            })
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                    eq(dictionaryIdempotencyKeysTable.operation, 'bulk_commit'),
                    eq(
                        dictionaryIdempotencyKeysTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                    eq(dictionaryIdempotencyKeysTable.state, 'in_progress'),
                ),
            )
            .returning({ id: dictionaryIdempotencyKeysTable.id });
        if (updated.length !== 1)
            throw new DictionaryIdempotencyConflictError();
    }
}
