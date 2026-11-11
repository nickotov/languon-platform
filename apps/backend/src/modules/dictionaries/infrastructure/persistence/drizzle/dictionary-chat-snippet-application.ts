import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type {
    ApplyDictionaryChatSnippetRequest,
    ApplyDictionaryChatSnippetResponse,
    DictionaryCardValues,
} from '@languon/contracts';
import { DictionaryVersionConflictError } from '../../../application/dictionary-errors';
import { dictionaryLimits, normalizeCardValues } from '../../../domain/limits';
import {
    assertDictionaryCardCapacity,
    dictionaryCardSortGap,
} from '../../../domain/ordering';
import { assertCardSettingsOverrideTransition } from '../../../domain/settings';
import {
    assertAggregateVersions,
    cardInsertValues,
} from './dictionary-card-state';
import {
    assertOwnerCapacityLocked,
    bumpDictionary,
    lockOwned,
} from './dictionary-aggregate-state';
import {
    normalizedSource,
    revisionSnapshot,
    settingsFromRow,
} from './dictionary-rows';
import type { DictionaryTransaction } from './dictionary-context';
import {
    dictionaryCardRevisionsTable as revisions,
    dictionaryCardsTable as cards,
} from './schema';

/** Caller holds the active owner fence before resolving/locking the target dictionary. */
export async function applyDictionaryChatCards(
    tx: DictionaryTransaction,
    input: {
        ownerId: string;
        dictionaryId: string;
        values: DictionaryCardValues[];
        request: ApplyDictionaryChatSnippetRequest;
        now: Date;
    },
): Promise<ApplyDictionaryChatSnippetResponse> {
    const current = await lockOwned(tx, input.ownerId, input.dictionaryId);
    assertAggregateVersions(
        current,
        input.request.expectedDictionaryVersion,
        input.request.expectedSettingsVersion,
    );

    if (current.dictionary.lifecycle !== 'active') {
        throw new DictionaryVersionConflictError();
    }

    const values = input.values.map(normalizeCardValues);
    const overrides = {
        customNotationLabel: null,
        definitionEnabled: null,
        definitionLanguageRole: null,
        exampleEnabled: null,
        exampleLanguageRole: null,
        exampleTranslationEnabled: null,
        transcriptionEnabled: null,
        transcriptionNotation: null,
    };

    assertCardSettingsOverrideTransition({
        dictionary: settingsFromRow(current.settings),
        next: overrides,
        previous: null,
    });

    const active = await tx
        .select()
        .from(cards)
        .where(
            and(
                eq(cards.dictionaryId, input.dictionaryId),
                eq(cards.lifecycle, 'active'),
            ),
        )
        .orderBy(asc(cards.sortKey), asc(cards.id));
    const replacing = input.request.mode === 'replace';
    assertDictionaryCardCapacity(
        (replacing ? 0 : active.length) + values.length,
    );

    await assertOwnerCapacityLocked(
        { ownerLimits: dictionaryLimits },
        tx,
        input.ownerId,
        0,
        values.length,
        values.length,
    );

    const seen = new Set(
        replacing ? [] : active.map((card) => card.normalizedSource),
    );
    let duplicateCount = 0;
    for (const value of values) {
        const source = normalizedSource(value.source);
        if (seen.has(source)) {
            duplicateCount += 1;
        }

        seen.add(source);
    }

    if (replacing && active.length) {
        // Archival keeps learningVersion/progress and immutable revisions untouched.
        await tx
            .update(cards)
            .set({
                lifecycle: 'archived',
                archivedAt: input.now,
                updatedAt: input.now,
                version: sql`${cards.version} + 1`,
            })
            .where(
                and(
                    eq(cards.dictionaryId, input.dictionaryId),
                    eq(cards.lifecycle, 'active'),
                ),
            );
    }

    if (input.request.mode === 'prepend' && active.length) {
        // Positive sparse keys cannot always fit a prefix. Shift only order keys;
        // content versions/progress remain unchanged under the dictionary lock.
        const offset = BigInt(values.length) * dictionaryCardSortGap;
        await tx
            .update(cards)
            .set({ sortKey: sql`${cards.sortKey} + ${offset}` })
            .where(
                and(
                    eq(cards.dictionaryId, input.dictionaryId),
                    eq(cards.lifecycle, 'active'),
                ),
            );
    }

    const maximum =
        input.request.mode === 'append' ? (active.at(-1)?.sortKey ?? 0n) : 0n;
    const inserts = values.map((value, index) => ({
        ...cardInsertValues(value, overrides),
        authorship: 'ai-generated' as const,
        id: randomUUID(),
        dictionaryId: input.dictionaryId,
        normalizedSource: normalizedSource(value.source),
        createdAt: input.now,
        updatedAt: input.now,
        sortKey: maximum + BigInt(index + 1) * dictionaryCardSortGap,
    }));
    const inserted = await tx.insert(cards).values(inserts).returning();
    const byId = new Map(inserted.map((card) => [card.id, card]));
    const ordered = inserts.map((insert) => byId.get(insert.id)!);
    await tx.insert(revisions).values(
        ordered.map((card) => ({
            id: randomUUID(),
            actorUserId: input.ownerId,
            authorship: card.authorship,
            cardId: card.id,
            dictionaryId: card.dictionaryId,
            cardVersion: card.version,
            revisionNumber: card.version,
            schemaVersion: 2,
            settingsVersion: current.settings.version,
            mutationKind: 'ai_create' as const,
            createdAt: input.now,
            snapshot: revisionSnapshot(
                card,
                current.settings,
                current.dictionary.translationContext,
            ),
        })),
    );

    const dictionaryVersion = await bumpDictionary(
        tx,
        current.dictionary,
        input.now,
    );

    return {
        operationId: input.request.operationId,
        dictionaryId: input.dictionaryId,
        cardIds: ordered.map((card) => card.id),
        addedCount: ordered.length,
        archivedCount: replacing ? active.length : 0,
        duplicateCount,
        dictionaryVersion,
        settingsVersion: current.settings.version,
    };
}
