import type { DictionaryImportRowWarning } from '@languon/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DictionaryInterchangePair } from '../../../domain/interchange';
import type { QueryDatabase } from './dictionary-context';
import { normalizedSource } from './dictionary-rows';
import { dictionaryCardsTable } from './schema';

export async function importExistingSources(
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
    for (let offset = 0; offset < sources.length; offset += lookupChunkSize) {
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

export function importDuplicateWarnings(
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
                message: 'A matching source already exists in this dictionary.',
                rowIndex: row.rowIndex,
            });
        } else if (duplicateRowIndex !== null) {
            warnings.push({
                code: 'duplicate_source',
                duplicateCardId: null,
                duplicateRowIndex,
                message: 'A matching source appears earlier in this import.',
                rowIndex: row.rowIndex,
            });
        }

        if (!firstImported.has(key)) firstImported.set(key, row.rowIndex);
    }

    return warnings;
}
