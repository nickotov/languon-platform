import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type {
    FlashcardPreferencesPutRequest,
    FlashcardPrepareRequest,
    FlashcardItemsRequest,
    FlashcardAttemptRequest,
    FlashcardUndoRequest,
    LearningEntriesQuery,
} from '@languon/contracts';
import type {
    VocabularyPracticeActor,
    VocabularyPracticeStore,
} from '../../../application/vocabulary-practice-store';
import type {
    KnowledgeDatabase,
    KnowledgeTransaction,
} from './knowledge-transaction';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    LearningConflictError,
    LearningInvalidRequestError,
} from '../../../../learning/domain/errors';
import { defaultFlashcardConfiguration } from '../../../../learning/domain/flashcard-projection';
import {
    readVocabularyPracticeSource,
    type VocabularyPracticeContent,
} from './vocabulary-practice-source';
import {
    knowledgeVocabularyPreferencesTable as preferences,
    knowledgeVocabularyProgressTable as progress,
} from './vocabulary-practice-schema';
import {
    rateVocabularyEntry,
    undoVocabularyEntry,
} from './vocabulary-practice-attempts';
const cursorSchema = z
    .object({
        noteId: z.uuid(),
        blockId: z.uuid(),
        version: z.number().int().positive(),
        offset: z.number().int().min(0).max(500),
        search: z.string().nullable(),
    })
    .strict();

export class DrizzleVocabularyPracticeStore implements VocabularyPracticeStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly crypto: KnowledgeShareCrypto,
    ) {}

    private run<T>(
        source: VocabularyPracticeActor,
        operation: (
            tx: KnowledgeTransaction,
            material: VocabularyPracticeContent,
        ) => Promise<T>,
    ) {
        return this.database.transaction(async (tx) =>
            operation(
                tx,
                await readVocabularyPracticeSource(tx, this.crypto, source),
            ),
        );
    }

    entries(source: VocabularyPracticeActor, input: LearningEntriesQuery) {
        return this.run(source, async (_tx, material) => {
            let offset = 0;
            if (input.cursor) {
                let cursor: z.infer<typeof cursorSchema>;
                try {
                    cursor = cursorSchema.parse(
                        JSON.parse(
                            Buffer.from(input.cursor, 'base64url').toString(),
                        ),
                    );
                } catch {
                    throw new LearningInvalidRequestError();
                }

                if (
                    cursor.noteId !== source.noteId ||
                    cursor.blockId !== source.blockId ||
                    cursor.search !== (input.search ?? null)
                )
                    throw new LearningInvalidRequestError();
                if (cursor.version !== material.note.version)
                    throw new LearningConflictError('stale_content');
                offset = cursor.offset;
            }

            const search = input.search?.toLowerCase();
            const entries = material.entries.filter(
                (entry) =>
                    !search ||
                    entry.term.toLowerCase().includes(search) ||
                    entry.translation.toLowerCase().includes(search),
            );
            const page = entries.slice(offset, offset + input.limit);

            return {
                entries: page.map((entry) => ({
                    entryId: entry.id,
                    source: entry.term.slice(0, 400),
                    translation: entry.translation.slice(0, 400),
                })),
                nextCursor:
                    offset + page.length < entries.length
                        ? Buffer.from(
                              JSON.stringify({
                                  noteId: source.noteId,
                                  blockId: source.blockId,
                                  version: material.note.version,
                                  offset: offset + page.length,
                                  search: input.search ?? null,
                              }),
                          ).toString('base64url')
                        : null,
            };
        });
    }

    preferences(source: VocabularyPracticeActor) {
        return this.run(source, async (tx) => {
            const [row] = await tx
                .select()
                .from(preferences)
                .where(this.preferenceCondition(source));

            return row
                ? {
                      configuration: row.configuration,
                      shuffle: row.shuffle,
                      version: row.version,
                  }
                : {
                      configuration: defaultFlashcardConfiguration,
                      shuffle: true,
                      version: 0,
                  };
        });
    }

    private preferenceCondition(source: VocabularyPracticeActor) {
        return and(
            eq(preferences.actorId, source.actorId),
            eq(preferences.noteId, source.noteId),
            eq(preferences.blockId, source.blockId),
        );
    }

    savePreferences(
        source: VocabularyPracticeActor,
        input: FlashcardPreferencesPutRequest,
    ) {
        return this.run(source, async (tx) => {
            const [current] = await tx
                .select()
                .from(preferences)
                .where(this.preferenceCondition(source));

            if ((current?.version ?? 0) !== input.expectedVersion)
                throw new LearningConflictError('preferences_conflict');
            const value = {
                configuration: input.configuration,
                shuffle: input.shuffle,
                version: input.expectedVersion + 1,
            };

            await tx
                .insert(preferences)
                .values({
                    actorId: source.actorId,
                    noteId: source.noteId,
                    blockId: source.blockId,
                    ...value,
                })
                .onConflictDoUpdate({
                    target: [
                        preferences.actorId,
                        preferences.noteId,
                        preferences.blockId,
                    ],
                    set: value,
                });

            return value;
        });
    }

    prepare(source: VocabularyPracticeActor, input: FlashcardPrepareRequest) {
        return this.run(source, async (_tx, material) => {
            const ids =
                input.scope.type === 'all'
                    ? material.entries.map((entry) => entry.id)
                    : input.scope.entryIds;
            const map = new Map(
                material.entries.map((entry) => [entry.id, entry]),
            );
            const items = ids.flatMap((id) => {
                const entry = map.get(id);
                const item =
                    entry && material.project(entry, input.configuration);

                return item ? [item] : [];
            });

            return {
                entryIds: items.map((item) => item.entryId),
                eligibleCount: items.length,
                skippedCount: ids.length - items.length,
                fallbackCount: items.filter((item) =>
                    [...item.front, ...item.back].some(
                        (field) => field.fallback,
                    ),
                ).length,
            };
        });
    }

    items(source: VocabularyPracticeActor, input: FlashcardItemsRequest) {
        return this.run(source, async (_tx, material) => {
            const map = new Map(
                material.entries.map((entry) => [entry.id, entry]),
            );
            const items = input.entryIds.flatMap((id) => {
                const entry = map.get(id);
                const item =
                    entry && material.project(entry, input.configuration);

                return item ? [item] : [];
            });
            const found = new Set(items.map((item) => item.entryId));

            return {
                items,
                unavailableEntryIds: input.entryIds.filter(
                    (id) => !found.has(id),
                ),
            };
        });
    }

    progress(source: VocabularyPracticeActor) {
        return this.run(source, async (tx, material) => {
            const rows = await tx
                .select()
                .from(progress)
                .where(
                    and(
                        eq(progress.actorId, source.actorId),
                        eq(progress.noteId, source.noteId),
                        eq(progress.blockId, source.blockId),
                    ),
                );
            const versions = new Map(
                material.entries.map((entry) => [
                    entry.id,
                    entry.learningVersion,
                ]),
            );
            const valid = rows.filter(
                (row) => versions.get(row.entryId) === row.learningVersion,
            );

            return {
                total: material.entries.length,
                known: valid.filter((row) => row.rating === 'known').length,
                again: valid.filter((row) => row.rating === 'again').length,
                unstudied: material.entries.length - valid.length,
            };
        });
    }

    rate(source: VocabularyPracticeActor, input: FlashcardAttemptRequest) {
        return this.run(source, (tx, material) =>
            rateVocabularyEntry(tx, source, material, input),
        );
    }

    undo(
        source: VocabularyPracticeActor,
        attemptId: string,
        input: FlashcardUndoRequest,
    ) {
        return this.run(source, (tx, material) =>
            undoVocabularyEntry(tx, source, material, attemptId, input),
        );
    }
}
