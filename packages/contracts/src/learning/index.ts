import { z } from 'zod';
import {
    DictionaryCursorSchema,
    DictionaryLanguageTagSchema,
    DictionarySearchSchema,
} from '../dictionaries/primitives';

export const FlashcardFieldSchema = z.enum([
    'source',
    'translation',
    'transcription',
    'definition',
    'sourceExample',
    'targetExample',
]);
const fields = z
    .array(FlashcardFieldSchema)
    .min(1)
    .max(6)
    .refine(
        (value) => new Set(value).size === value.length,
        'Fields must be unique',
    );
export const FlashcardConfigurationSchema = z
    .object({ front: fields, back: fields })
    .strict();
export const FlashcardPreferencesSchema = z
    .object({
        configuration: FlashcardConfigurationSchema,
        shuffle: z.boolean(),
        version: z.number().int().nonnegative(),
    })
    .strict();
export const FlashcardPreferencesPutRequestSchema = z
    .object({
        configuration: FlashcardConfigurationSchema,
        shuffle: z.boolean(),
        expectedVersion: z.number().int().nonnegative(),
    })
    .strict();
const entryIds = (maximum: number) =>
    z
        .array(z.uuid())
        .min(1)
        .max(maximum)
        .refine(
            (value) => new Set(value).size === value.length,
            'Entry IDs must be unique',
        );
export const FlashcardPrepareRequestSchema = z
    .object({
        configuration: FlashcardConfigurationSchema,
        scope: z.discriminatedUnion('type', [
            z.object({ type: z.literal('all') }).strict(),
            z
                .object({
                    type: z.literal('manual'),
                    entryIds: entryIds(10_000),
                })
                .strict(),
        ]),
    })
    .strict();
export const FlashcardPrepareResponseSchema = z
    .object({
        entryIds: z.array(z.uuid()).max(10_000),
        eligibleCount: z.number().int().nonnegative(),
        skippedCount: z.number().int().nonnegative(),
        fallbackCount: z.number().int().nonnegative(),
    })
    .strict();
export const FlashcardItemsRequestSchema = z
    .object({
        configuration: FlashcardConfigurationSchema,
        entryIds: entryIds(25),
    })
    .strict();
export const FlashcardPresentationFieldSchema = z
    .object({
        field: FlashcardFieldSchema,
        requestedFields: fields,
        text: z.string().min(1).max(4_000),
        language: DictionaryLanguageTagSchema,
        direction: z.enum(['ltr', 'rtl']),
        fallback: z.boolean(),
    })
    .strict();
export const FlashcardItemSchema = z
    .object({
        entryId: z.uuid(),
        learningVersion: z.number().int().positive(),
        front: z.array(FlashcardPresentationFieldSchema).min(1).max(6),
        back: z.array(FlashcardPresentationFieldSchema).min(1).max(6),
    })
    .strict();
export const FlashcardItemsResponseSchema = z
    .object({
        items: z.array(FlashcardItemSchema).max(25),
        unavailableEntryIds: z.array(z.uuid()).max(25),
    })
    .strict();
export const FlashcardRatingSchema = z.enum(['known', 'again']);
export const FlashcardAttemptRequestSchema = z
    .object({
        operationId: z.uuid(),
        sessionId: z.uuid(),
        entryId: z.uuid(),
        expectedLearningVersion: z.number().int().positive(),
        round: z.number().int().positive().max(10_000),
        rating: FlashcardRatingSchema,
        configuration: FlashcardConfigurationSchema,
    })
    .strict();
export const FlashcardAttemptResponseSchema = z
    .object({
        attemptId: z.uuid(),
        entryId: z.uuid(),
        learningVersion: z.number().int().positive(),
        rating: FlashcardRatingSchema,
    })
    .strict();
export const FlashcardUndoRequestSchema = z
    .object({ operationId: z.uuid() })
    .strict();
export const FlashcardUndoResponseSchema = z
    .object({
        attemptId: z.uuid(),
        entryId: z.uuid(),
        learningVersion: z.number().int().positive(),
        rating: FlashcardRatingSchema.nullable(),
    })
    .strict();
export const FlashcardProgressResponseSchema = z
    .object({
        total: z.number().int().nonnegative(),
        known: z.number().int().nonnegative(),
        again: z.number().int().nonnegative(),
        unstudied: z.number().int().nonnegative(),
    })
    .strict();
export const LearningEntriesQuerySchema = z
    .object({
        cursor: DictionaryCursorSchema.optional(),
        search: DictionarySearchSchema.optional(),
        limit: z.coerce.number().int().min(1).max(25).default(25),
    })
    .strict();
export const LearningEntriesResponseSchema = z
    .object({
        entries: z
            .array(
                z
                    .object({
                        entryId: z.uuid(),
                        source: z.string().min(1).max(400),
                        translation: z.string().min(1).max(400),
                    })
                    .strict(),
            )
            .max(25),
        nextCursor: DictionaryCursorSchema.nullable(),
    })
    .strict();
export const LearningCapabilitiesResponseSchema = z
    .object({ flashcardsEnabled: z.boolean() })
    .strict();
export const LearningErrorCodeSchema = z.enum([
    'authentication_required',
    'dictionary_not_found',
    'shared_dictionary_not_found',
    'entry_not_found',
    'invalid_request',
    'version_conflict',
    'idempotency_conflict',
    'learning_version_conflict',
    'undo_conflict',
    'rate_limited',
    'service_unavailable',
    'internal_error',
]);
export const LearningErrorResponseSchema = z
    .object({
        error: z
            .object({
                code: LearningErrorCodeSchema,
                message: z.string().min(1).max(300),
                correlationId: z.string().min(1).max(128),
                retryAfterSeconds: z
                    .number()
                    .int()
                    .positive()
                    .max(86_400)
                    .optional(),
            })
            .strict(),
    })
    .strict();

export type FlashcardField = z.infer<typeof FlashcardFieldSchema>;
export type FlashcardConfiguration = z.infer<
    typeof FlashcardConfigurationSchema
>;
export type FlashcardPreferences = z.infer<typeof FlashcardPreferencesSchema>;
export type FlashcardPreferencesPutRequest = z.infer<
    typeof FlashcardPreferencesPutRequestSchema
>;
export type FlashcardPrepareRequest = z.infer<
    typeof FlashcardPrepareRequestSchema
>;
export type FlashcardPrepareResponse = z.infer<
    typeof FlashcardPrepareResponseSchema
>;
export type FlashcardItemsRequest = z.infer<typeof FlashcardItemsRequestSchema>;
export type FlashcardPresentationField = z.infer<
    typeof FlashcardPresentationFieldSchema
>;
export type FlashcardItem = z.infer<typeof FlashcardItemSchema>;
export type FlashcardItemsResponse = z.infer<
    typeof FlashcardItemsResponseSchema
>;
export type FlashcardRating = z.infer<typeof FlashcardRatingSchema>;
export type FlashcardAttemptRequest = z.infer<
    typeof FlashcardAttemptRequestSchema
>;
export type FlashcardAttemptResponse = z.infer<
    typeof FlashcardAttemptResponseSchema
>;
export type FlashcardUndoRequest = z.infer<typeof FlashcardUndoRequestSchema>;
export type FlashcardUndoResponse = z.infer<typeof FlashcardUndoResponseSchema>;
export type FlashcardProgressResponse = z.infer<
    typeof FlashcardProgressResponseSchema
>;
export type LearningEntriesQuery = z.infer<typeof LearningEntriesQuerySchema>;
export type LearningEntriesResponse = z.infer<
    typeof LearningEntriesResponseSchema
>;
export type LearningCapabilitiesResponse = z.infer<
    typeof LearningCapabilitiesResponseSchema
>;
export type LearningErrorCode = z.infer<typeof LearningErrorCodeSchema>;
export type LearningErrorResponse = z.infer<typeof LearningErrorResponseSchema>;
