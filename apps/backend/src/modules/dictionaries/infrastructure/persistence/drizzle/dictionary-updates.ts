import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
    DictionaryLanguagePairLockedError,
    DictionaryVersionConflictError,
    InvalidDictionaryRequestError,
} from '../../../application/dictionary-errors';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import { resolveCardMutationAuthorship } from '../../../domain/authorship';
import { hasLearningContentChanged } from '../../../domain/learning-content';
import {
    normalizeCardValues,
    normalizeDictionaryDetails,
} from '../../../domain/limits';
import {
    assertCardSettingsOverrideTransition,
    assertDictionarySettingsTransition,
    resolveCardSettings,
    type DictionarySettings,
} from '../../../domain/settings';
import { normalizeTranslationContext } from '../../../domain/translation-context';
import {
    assertAggregateVersions,
    cardInsertValues,
    domainOverrides,
    insertRevision,
    mergeCardValues,
    mergeOverrides,
} from './dictionary-card-state';
import type { DictionaryPersistenceContext } from './dictionary-context';
import { abort } from './dictionary-cursors';
import {
    acquireGlobalPermit,
    assertOwnerCapacityLocked,
    bumpDictionary,
    cardCount,
    lockCard,
    lockOwned,
    lockOwnerCapacity,
    sourceDuplicate,
} from './dictionary-aggregate-state';
import { readOwned } from './dictionary-queries';
import {
    cardValues,
    mapCard,
    normalizedSource,
    overridesFromRow,
    settingsFromRow,
    wireOverrides,
} from './dictionary-rows';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

export async function updateDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['updateDictionary']>[0],
) {
    return context.database.transaction(async (tx) => {
        const current = await lockOwned(tx, input.ownerId, input.dictionaryId);
        abort(input.context);
        if (
            current.dictionary.version !==
            input.request.expectedDictionaryVersion
        )
            throw new DictionaryVersionConflictError();
        const activeCount = await cardCount(tx, input.dictionaryId);
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
        const translationContext = normalizeTranslationContext(
            input.request.translationContext === undefined
                ? current.dictionary.translationContext
                : input.request.translationContext,
        );

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
                          transcriptionNotation: patch.transcriptionNotation,
                      }),
                ...(patch.transcriptionCustomLabel === undefined
                    ? {}
                    : {
                          customNotationLabel: patch.transcriptionCustomLabel,
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

            // Dictionary locking serializes all content writers. Include
            // archived entries, so restoring one cannot revive stale progress.
            let learningCursor: string | undefined;
            while (true) {
                abort(input.context);
                const cards = await tx
                    .select()
                    .from(dictionaryCardsTable)
                    .where(
                        and(
                            eq(
                                dictionaryCardsTable.dictionaryId,
                                input.dictionaryId,
                            ),
                            learningCursor
                                ? gt(dictionaryCardsTable.id, learningCursor)
                                : undefined,
                        ),
                    )
                    .orderBy(asc(dictionaryCardsTable.id))
                    .limit(500);

                if (cards.length === 0) break;
                const affectedIds = cards
                    .filter((card) =>
                        hasLearningContentChanged({
                            previous: {
                                values: cardValues(card),
                                settings: resolveCardSettings({
                                    dictionary: settingsFromRow(
                                        current.settings,
                                    ),
                                    overrides: overridesFromRow(card),
                                }),
                            },
                            next: {
                                values: cardValues(card),
                                settings: resolveCardSettings({
                                    dictionary: next,
                                    overrides: overridesFromRow(card),
                                }),
                            },
                        }),
                    )
                    .map((card) => card.id);

                if (affectedIds.length > 0) {
                    abort(input.context);
                    await tx
                        .update(dictionaryCardsTable)
                        .set({
                            learningVersion: sql`${dictionaryCardsTable.learningVersion} + 1`,
                        })
                        .where(
                            and(
                                eq(
                                    dictionaryCardsTable.dictionaryId,
                                    input.dictionaryId,
                                ),
                                inArray(dictionaryCardsTable.id, affectedIds),
                            ),
                        );
                }

                learningCursor = cards[cards.length - 1]!.id;
            }

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
                translationContext,
                updatedAt: input.context.now,
                version: current.dictionary.version + 1,
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

export async function updateCard(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['updateCard']>[0],
) {
    return context.database.transaction(async (tx) => {
        await acquireGlobalPermit(tx, 4, 32);
        await lockOwnerCapacity(tx, input.ownerId);
        const current = await lockOwned(tx, input.ownerId, input.dictionaryId);
        assertAggregateVersions(
            current,
            input.request.expectedDictionaryVersion,
            input.request.expectedSettingsVersion,
        );

        const row = await lockCard(tx, input.dictionaryId, input.cardId);
        abort(input.context);
        if (row.version !== input.request.expectedCardVersion)
            throw new DictionaryVersionConflictError();
        const values = normalizeCardValues(
            mergeCardValues(cardValues(row), input.request.values),
        );
        const duplicateSource = await sourceDuplicate(
            tx,
            input.dictionaryId,
            normalizedSource(values.source),
            row.id,
        );
        const overrides = domainOverrides(
            mergeOverrides(wireOverrides(row), input.request.overrides),
        );

        assertCardSettingsOverrideTransition({
            dictionary: settingsFromRow(current.settings),
            next: overrides,
            previous: overridesFromRow(row),
        });

        const translationContext = normalizeTranslationContext(
            input.request.translationContext === undefined
                ? row.translationContext
                : input.request.translationContext,
        );
        const changed =
            JSON.stringify(values) !== JSON.stringify(cardValues(row)) ||
            JSON.stringify(overrides) !==
                JSON.stringify(overridesFromRow(row)) ||
            translationContext !== row.translationContext;

        if (!changed)
            return {
                card: mapCard(row, current.settings),
                dictionaryVersion: current.dictionary.version,
                duplicateSource,
            };
        await assertOwnerCapacityLocked(context, tx, input.ownerId, 0, 0, 1);
        const authorship = resolveCardMutationAuthorship({
            mutationKind: 'manual_edit',
            prior: row.authorship,
            semanticChange: true,
        }).authorship;
        const [updated] = await tx
            .update(dictionaryCardsTable)
            .set({
                ...cardInsertValues(values, overrides, translationContext),
                authorship,
                normalizedSource: normalizedSource(values.source),
                learningVersion:
                    row.learningVersion +
                    Number(
                        hasLearningContentChanged({
                            previous: {
                                values: cardValues(row),
                                settings: resolveCardSettings({
                                    dictionary: settingsFromRow(
                                        current.settings,
                                    ),
                                    overrides: overridesFromRow(row),
                                }),
                            },
                            next: {
                                values,
                                settings: resolveCardSettings({
                                    dictionary: settingsFromRow(
                                        current.settings,
                                    ),
                                    overrides,
                                }),
                            },
                        }),
                    ),
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
        await insertRevision(
            context,
            tx,
            updated,
            current.settings,
            current.dictionary.translationContext,
            input.ownerId,
            'manual_edit',
            input.context.now,
        );

        const dictionaryVersion = await bumpDictionary(
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
