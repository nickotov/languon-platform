import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { TextSelectionTarget } from '@languon/contracts';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    dictionariesTable as dictionaries,
    dictionarySettingsTable as settings,
    dictionaryCardsTable as cards,
    dictionaryCardRevisionsTable as revisions,
} from './schema';
import {
    defaultDictionarySettings,
    resolveCardSettings,
    type DictionarySettings,
} from '../../../domain/settings';
import {
    selectionCardOverrides,
    TextSelectionError,
} from '../../../domain/text-selection';
import {
    assertDictionaryOwnerCapacity,
    normalizeDictionaryCardSourceForSearch,
    normalizeCardValues,
} from '../../../domain/limits';
import {
    assertDictionaryCardCapacity,
    dictionaryCardSortGap,
} from '../../../domain/ordering';
import { DictionaryCardRevisionSnapshotSchema } from './revision-snapshot-schema';
import type { z } from 'zod';
import type { DictionaryGenerationCardValuesSchema } from '../../../domain/generation-card-context';
type DictionaryGenerationCardValues = z.infer<
    typeof DictionaryGenerationCardValuesSchema
>;
export type SelectionDatabase = PostgresJsDatabase<typeof databaseSchema>;
export type SelectionTransaction = Parameters<
    Parameters<SelectionDatabase['transaction']>[0]
>[0];
export async function selectionTarget(
    tx: SelectionTransaction,
    ownerId: string,
    target: TextSelectionTarget,
    sourceLanguage: string,
    targetLanguage: string,
    phrase: string,
    confirmDuplicate: boolean,
) {
    if (target.kind === 'new')
        return {
            settings: { ...defaultDictionarySettings },
            translationContext: null,
        };
    const [dictionary] = await tx
        .select()
        .from(dictionaries)
        .where(
            and(
                eq(dictionaries.id, target.dictionaryId),
                eq(dictionaries.ownerId, ownerId),
            ),
        )
        .for('update');

    if (!dictionary || dictionary.lifecycle !== 'active')
        throw new TextSelectionError('not_found');
    const [values] = await tx
        .select()
        .from(settings)
        .where(eq(settings.dictionaryId, dictionary.id))
        .for('update');

    if (
        !values ||
        dictionary.version !== target.expectedDictionaryVersion ||
        values.version !== target.expectedSettingsVersion
    )
        throw new TextSelectionError('stale_content');
    if (
        dictionary.sourceLanguageTag !== sourceLanguage ||
        dictionary.targetLanguageTag !== targetLanguage
    )
        throw new TextSelectionError('language_pair_mismatch');
    if (!confirmDuplicate) {
        const [duplicate] = await tx
            .select({ id: cards.id })
            .from(cards)
            .where(
                and(
                    eq(cards.dictionaryId, dictionary.id),
                    eq(cards.lifecycle, 'active'),
                    eq(
                        cards.normalizedSource,
                        normalizeDictionaryCardSourceForSearch(phrase),
                    ),
                ),
            )
            .limit(1);

        if (duplicate)
            throw new TextSelectionError('duplicate_confirmation_required');
    }

    const resolved: DictionarySettings = {
        customNotationLabel: values.customNotationLabel,
        definitionEnabled: values.definitionEnabled,
        definitionLanguageRole: values.definitionLanguageRole,
        exampleEnabled: values.exampleEnabled,
        exampleLanguageRole: values.exampleLanguageRole,
        exampleTranslationEnabled: values.exampleTranslationEnabled,
        transcriptionEnabled: values.transcriptionEnabled,
        transcriptionNotation: values.transcriptionNotation,
        version: values.version,
    };

    return {
        settings: resolved,
        translationContext: dictionary.translationContext,
    };
}

export async function saveSelectionCard(
    tx: SelectionTransaction,
    input: {
        ownerId: string;
        target: TextSelectionTarget;
        sourceLanguage: string;
        targetLanguage: string;
        values: DictionaryGenerationCardValues;
        confirmDuplicate: boolean;
        now: Date;
    },
) {
    const resolved = await selectionTarget(
        tx,
        input.ownerId,
        input.target,
        input.sourceLanguage,
        input.targetLanguage,
        input.values.source,
        input.confirmDuplicate,
    );
    const counts = await tx.execute(
        sql`select (select count(*) from dictionaries where owner_id=${input.ownerId}::uuid) dictionaries,(select count(*) from dictionary_cards c join dictionaries d on c.dictionary_id=d.id where d.owner_id=${input.ownerId}::uuid) cards,(select count(*) from dictionary_card_revisions r join dictionaries d on r.dictionary_id=d.id where d.owner_id=${input.ownerId}::uuid) revisions`,
    );

    assertDictionaryOwnerCapacity(
        {
            dictionaries: Number(counts[0]?.dictionaries ?? 0),
            cards: Number(counts[0]?.cards ?? 0),
            revisions: Number(counts[0]?.revisions ?? 0),
        },
        {
            dictionaries: input.target.kind === 'new' ? 1 : 0,
            cards: 1,
            revisions: 1,
        },
    );

    const dictionaryId =
        input.target.kind === 'new' ? randomUUID() : input.target.dictionaryId;

    if (input.target.kind === 'new') {
        await tx.insert(dictionaries).values({
            id: dictionaryId,
            ownerId: input.ownerId,
            name: input.target.name,
            sourceLanguageTag: input.sourceLanguage,
            targetLanguageTag: input.targetLanguage,
            createdAt: input.now,
            updatedAt: input.now,
        });

        await tx.insert(settings).values({
            dictionaryId,
            createdAt: input.now,
            updatedAt: input.now,
        });
    }

    const [totals] = await tx
        .select({
            count: sql<number>`count(*) filter(where ${cards.lifecycle}='active')`,
            max: sql<string>`coalesce(max(${cards.sortKey}),0)`,
        })
        .from(cards)
        .where(eq(cards.dictionaryId, dictionaryId));

    assertDictionaryCardCapacity(Number(totals?.count ?? 0) + 1);
    const values = normalizeCardValues(input.values),
        cardId = randomUUID();

    await tx.insert(cards).values({
        ...values,
        id: cardId,
        dictionaryId,
        authorship: 'ai-generated',
        normalizedSource: normalizeDictionaryCardSourceForSearch(values.source),
        sortKey: BigInt(totals?.max ?? '0') + dictionaryCardSortGap,
        definitionEnabledOverride: 'enabled',
        exampleEnabledOverride: 'enabled',
        exampleTranslationEnabledOverride: 'enabled',
        createdAt: input.now,
        updatedAt: input.now,
    });

    const effective = resolveCardSettings({
        dictionary: resolved.settings,
        overrides: selectionCardOverrides,
    });
    const snapshot = DictionaryCardRevisionSnapshotSchema.parse({
        schemaVersion: 2,
        authorship: 'ai-generated',
        cardVersion: 1,
        settingsVersion: resolved.settings.version,
        values,
        rawOverrides: selectionCardOverrides,
        effectiveSettings: effective,
        rawTranslationContext: null,
        effectiveTranslationContext: resolved.translationContext,
    });

    await tx.insert(revisions).values({
        id: randomUUID(),
        actorUserId: input.ownerId,
        authorship: 'ai-generated',
        cardId,
        cardVersion: 1,
        dictionaryId,
        mutationKind: 'ai_create',
        revisionNumber: 1,
        schemaVersion: 2,
        settingsVersion: resolved.settings.version,
        snapshot,
        createdAt: input.now,
    });

    if (input.target.kind === 'existing')
        await tx
            .update(dictionaries)
            .set({
                version: sql`${dictionaries.version}+1`,
                updatedAt: input.now,
            })
            .where(eq(dictionaries.id, dictionaryId));

    return { dictionaryId, cardId };
}
