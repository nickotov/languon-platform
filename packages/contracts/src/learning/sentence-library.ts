import { z } from 'zod';
import {
    DictionaryCursorSchema,
    DictionaryLanguageTagSchema,
} from '../dictionaries/primitives';
import {
    SentenceDirectionSchema,
    SentenceExerciseSchema,
    SentenceManualReviewSchema,
} from './sentences';

export const SENTENCE_LIBRARY_LIMITS = { page: 100, selected: 100 } as const;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const SentenceLibraryArchiveFilterSchema = z.enum([
    'active',
    'archived',
    'all',
]);
export const SentenceLibraryFiltersSchema = z
    .object({
        direction: SentenceDirectionSchema.optional(),
        personalArchive: SentenceLibraryArchiveFilterSchema.default('active'),
        globalArchive: SentenceLibraryArchiveFilterSchema.default('active'),
        contentState: z.enum(['current', 'outdated', 'all']).default('all'),
    })
    .strict();
export const SentenceLibraryQuerySchema = SentenceLibraryFiltersSchema.extend({
    cursor: DictionaryCursorSchema.optional(),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(SENTENCE_LIBRARY_LIMITS.page)
        .default(25),
}).strict();
export const SentenceLibraryItemSchema = z
    .object({
        exerciseId: z.uuid(),
        dictionaryId: z.uuid(),
        direction: SentenceDirectionSchema,
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        sourceText: SentenceExerciseSchema.shape.sourceText,
        createdAt: z.iso.datetime(),
        personalArchivedAt: z.iso.datetime().nullable(),
        globalArchivedAt: z.iso.datetime().nullable(),
        contentState: z.enum(['current', 'outdated']),
        version: count,
        sharing: z.enum(['private', 'shared']),
    })
    .strict();
export const SentenceLibraryDetailSchema = z
    .object({
        item: SentenceLibraryItemSchema,
        exercise: SentenceExerciseSchema,
        referenceTranslation:
            SentenceManualReviewSchema.shape.referenceTranslation,
        requiredTargets: z
            .array(
                z
                    .object({
                        entryId: z.uuid(),
                        learningVersion: z.number().int().positive(),
                    })
                    .strict(),
            )
            .min(1)
            .max(3),
    })
    .strict();
export const SentenceLibraryListResponseSchema = z
    .object({
        items: z
            .array(SentenceLibraryItemSchema)
            .max(SENTENCE_LIBRARY_LIMITS.page),
        nextCursor: DictionaryCursorSchema.nullable(),
    })
    .strict();
export const SentenceLibrarySelectionSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('selected'),
            items: z
                .array(
                    z
                        .object({
                            exerciseId: z.uuid(),
                            expectedVersion: count,
                        })
                        .strict(),
                )
                .min(1)
                .max(SENTENCE_LIBRARY_LIMITS.selected)
                .refine(
                    (items) =>
                        new Set(items.map((item) => item.exerciseId)).size ===
                        items.length,
                    'Exercise IDs must be unique',
                ),
        })
        .strict(),
    z
        .object({
            type: z.literal('all-matching'),
            snapshotToken: DictionaryCursorSchema,
        })
        .strict(),
]);
export const SentenceLibraryOperationSchema = z.enum(['archive', 'restore']);
export const SentenceLibrarySnapshotRequestSchema = z
    .object({
        operation: SentenceLibraryOperationSchema,
        query: SentenceLibraryFiltersSchema,
    })
    .strict();
export const SentenceLibrarySnapshotResponseSchema = z
    .object({
        snapshotToken: DictionaryCursorSchema,
        matchingCount: count,
        expiresAt: z.iso.datetime(),
    })
    .strict();
export const SentenceLibraryMutationRequestSchema = z
    .object({
        operationId: z.uuid(),
        operation: SentenceLibraryOperationSchema,
        selection: SentenceLibrarySelectionSchema,
    })
    .strict();
export const SentenceLibraryMutationResponseSchema = z
    .object({
        operationId: z.uuid(),
        affectedCount: count,
    })
    .strict();

export type SentenceLibraryFilters = z.infer<
    typeof SentenceLibraryFiltersSchema
>;
export type SentenceLibraryQuery = z.infer<typeof SentenceLibraryQuerySchema>;
export type SentenceLibraryItem = z.infer<typeof SentenceLibraryItemSchema>;
export type SentenceLibraryDetail = z.infer<typeof SentenceLibraryDetailSchema>;
export type SentenceLibraryListResponse = z.infer<
    typeof SentenceLibraryListResponseSchema
>;
export type SentenceLibrarySelection = z.infer<
    typeof SentenceLibrarySelectionSchema
>;
export type SentenceLibraryOperation = z.infer<
    typeof SentenceLibraryOperationSchema
>;
export type SentenceLibrarySnapshotRequest = z.infer<
    typeof SentenceLibrarySnapshotRequestSchema
>;
export type SentenceLibrarySnapshotResponse = z.infer<
    typeof SentenceLibrarySnapshotResponseSchema
>;
export type SentenceLibraryMutationRequest = z.infer<
    typeof SentenceLibraryMutationRequestSchema
>;
export type SentenceLibraryMutationResponse = z.infer<
    typeof SentenceLibraryMutationResponseSchema
>;
