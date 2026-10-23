import { DictionaryVersionConflictError } from '../../../application/dictionary-errors';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import {
    normalizeCardValues,
    normalizeDictionaryDetails,
} from '../../../domain/limits';
import { assertDictionaryCardCapacity } from '../../../domain/ordering';
import {
    assertCardSettingsOverrideTransition,
    assertDictionarySettingsTransition,
    defaultDictionarySettings,
    type DictionarySettings,
} from '../../../domain/settings';
import { normalizeTranslationContext } from '../../../domain/translation-context';
import {
    assertAggregateVersions,
    cardInsertValues,
    domainOverrides,
    insertRevision,
} from './dictionary-card-state';
import type { DictionaryPersistenceContext } from './dictionary-context';
import { abort } from './dictionary-cursors';
import {
    completeIdempotency,
    reserveIdempotency,
} from './dictionary-idempotency';
import {
    acquireGlobalPermit,
    activeCardCount,
    assertOwnerCapacity,
    assertOwnerCapacityLocked,
    bumpDictionary,
    lockOwned,
    lockOwnerCapacity,
    nextActiveSortKey,
    sourceDuplicate,
} from './dictionary-aggregate-state';
import { readOwned } from './dictionary-queries';
import { mapCard, normalizedSource, settingsFromRow } from './dictionary-rows';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

export async function createDictionary(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['createDictionary']>[0],
) {
    return context.database.transaction(async (tx) => {
        abort(input.context);
        await lockOwnerCapacity(tx, input.ownerId);
        const replay = await reserveIdempotency(context, tx, input, 'create');
        if (replay) return readOwned(tx, input.ownerId, replay);
        await assertOwnerCapacityLocked(context, tx, input.ownerId, 1, 0);
        abort(input.context);
        const details = normalizeDictionaryDetails(input.request);
        const dictionaryId = context.ids.generate();
        const requestedSettings = input.request.settings;
        const settings: DictionarySettings = requestedSettings
            ? {
                  customNotationLabel:
                      requestedSettings.transcriptionCustomLabel,
                  definitionEnabled: requestedSettings.definitionEnabled,
                  definitionLanguageRole: requestedSettings.definitionLanguage,
                  exampleEnabled: requestedSettings.exampleEnabled,
                  exampleLanguageRole: requestedSettings.exampleLanguage,
                  exampleTranslationEnabled:
                      requestedSettings.exampleTranslationEnabled,
                  transcriptionEnabled: requestedSettings.transcriptionEnabled,
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

        await completeIdempotency(
            tx,
            input.ownerId,
            'create',
            input.idempotencyKey,
            dictionaryId,
            input.context.now,
        );

        return readOwned(tx, input.ownerId, dictionaryId);
    });
}

export async function createCard(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['createCard']>[0],
) {
    return context.database.transaction(async (tx) => {
        await acquireGlobalPermit(tx, 4, 32);
        await assertOwnerCapacity(context, tx, input.ownerId, 0, 1, 1);
        const current = await lockOwned(tx, input.ownerId, input.dictionaryId);
        abort(input.context);
        assertAggregateVersions(
            current,
            input.request.expectedDictionaryVersion,
            input.request.expectedSettingsVersion,
        );

        if (current.dictionary.lifecycle !== 'active')
            throw new DictionaryVersionConflictError();
        const activeCount = await activeCardCount(tx, input.dictionaryId);
        assertDictionaryCardCapacity(activeCount + 1);
        const values = normalizeCardValues(input.request.values);
        const translationContext = normalizeTranslationContext(
            input.request.translationContext,
        );
        const duplicateSource = await sourceDuplicate(
            tx,
            input.dictionaryId,
            normalizedSource(values.source),
        );
        const overrides = domainOverrides(input.request.overrides);
        assertCardSettingsOverrideTransition({
            dictionary: settingsFromRow(current.settings),
            next: overrides,
            previous: null,
        });

        const cardId = context.ids.generate();
        const [row] = await tx
            .insert(dictionaryCardsTable)
            .values({
                ...cardInsertValues(values, overrides, translationContext),
                authorship: 'human',
                createdAt: input.context.now,
                dictionaryId: input.dictionaryId,
                id: cardId,
                normalizedSource: normalizedSource(values.source),
                sortKey: await nextActiveSortKey(tx, input.dictionaryId),
                updatedAt: input.context.now,
            })
            .returning();

        if (!row) throw new DictionaryVersionConflictError();
        await insertRevision(
            context,
            tx,
            row,
            current.settings,
            current.dictionary.translationContext,
            input.ownerId,
            'manual_create',
            input.context.now,
        );

        const dictionaryVersion = await bumpDictionary(
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
