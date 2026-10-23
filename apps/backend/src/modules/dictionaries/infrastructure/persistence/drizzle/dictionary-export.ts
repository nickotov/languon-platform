import type { OwnedDictionary } from '@languon/contracts';
import { and, asc, eq, gt, or } from 'drizzle-orm';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import type {
    CardRow,
    DictionaryPersistenceContext,
} from './dictionary-context';
import { abort } from './dictionary-cursors';
import {
    acquireGlobalPermit,
    acquireOwnerPermit,
} from './dictionary-aggregate-state';
import { readOwnedStateForExport } from './dictionary-queries';
import { mapCard, settingsValues } from './dictionary-rows';
import { dictionaryCardsTable } from './schema';

export async function streamDictionaryExport(
    context: DictionaryPersistenceContext,
    input: Parameters<DictionaryStore['streamDictionaryExport']>[0],
): Promise<void> {
    await context.database.transaction(
        async (tx) => {
            abort(input.context);
            await acquireGlobalPermit(tx, 6, 8);
            await acquireOwnerPermit(tx, input.ownerId, 6);
            const current = await readOwnedStateForExport(
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
