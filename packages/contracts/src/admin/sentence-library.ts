import { z } from 'zod';
import { AdminReasonSchema } from './primitives';
import {
    DictionaryCursorSchema,
    DictionaryLanguageTagSchema,
    DictionaryNameSchema,
} from '../dictionaries/primitives';
import {
    SentenceLibraryFiltersSchema,
    SentenceLibraryItemSchema,
    SentenceLibraryArchiveFilterSchema,
    SentenceLibraryQuerySchema,
    SentenceLibrarySelectionSchema,
    SentenceLibrarySnapshotResponseSchema,
    SentenceLibraryMutationResponseSchema,
    SentenceLibraryDetailSchema,
} from '../learning/sentence-library';

export const AdminSentenceLibraryOperationSchema = z.enum([
    'archive',
    'restore',
    'global-archive',
    'global-restore',
    'delete',
]);
export const AdminSentenceLibraryQuerySchema =
    SentenceLibraryQuerySchema.extend({
        globalArchive: SentenceLibraryArchiveFilterSchema.default('all'),
        creatorId: z.uuid().optional(),
        creatorArchived: z
            .union([
                z.boolean(),
                z
                    .enum(['true', 'false'])
                    .transform((value) => value === 'true'),
            ])
            .optional(),
        relation: z.enum(['available', 'generated', 'all']).default('all'),
    }).strict();
export const AdminSentenceLibraryFiltersSchema =
    SentenceLibraryFiltersSchema.extend({
        globalArchive: SentenceLibraryArchiveFilterSchema.default('all'),
        creatorId: z.uuid().optional(),
        creatorArchived: z
            .union([
                z.boolean(),
                z
                    .enum(['true', 'false'])
                    .transform((value) => value === 'true'),
            ])
            .optional(),
        relation: z.enum(['available', 'generated', 'all']).default('all'),
    }).strict();
export const AdminSentenceLibrarySnapshotRequestSchema = z
    .object({
        operation: AdminSentenceLibraryOperationSchema,
        query: AdminSentenceLibraryFiltersSchema,
    })
    .strict();
export const AdminSentenceLibraryMutationRequestSchema = z
    .object({
        operationId: z.uuid(),
        operation: AdminSentenceLibraryOperationSchema,
        selection: SentenceLibrarySelectionSchema,
        reason: AdminReasonSchema,
        confirmation: z.literal('delete-archived-examples').optional(),
    })
    .strict()
    .superRefine((input, context) => {
        if (
            input.operation === 'delete' &&
            input.confirmation !== 'delete-archived-examples'
        ) {
            context.addIssue({
                code: 'custom',
                path: ['confirmation'],
                message: 'Permanent deletion requires explicit confirmation',
            });
        }
    });
export const AdminSentenceLibrarySnapshotResponseSchema =
    SentenceLibrarySnapshotResponseSchema;
export const AdminSentenceLibraryMutationResponseSchema =
    SentenceLibraryMutationResponseSchema;
export const AdminSentenceLibraryItemSchema = SentenceLibraryItemSchema.extend({
    creatorArchived: z.boolean(),
    creatorId: z.uuid(),
}).strict();
export const AdminSentenceLibraryListResponseSchema = z
    .object({
        items: z.array(AdminSentenceLibraryItemSchema).max(100),
        nextCursor: DictionaryCursorSchema.nullable(),
    })
    .strict();
export const AdminSentenceLibraryDetailSchema =
    SentenceLibraryDetailSchema.extend({
        item: AdminSentenceLibraryItemSchema,
    }).strict();
export type AdminSentenceLibraryItem = z.infer<
    typeof AdminSentenceLibraryItemSchema
>;
export type AdminSentenceLibraryOperation = z.infer<
    typeof AdminSentenceLibraryOperationSchema
>;
export type AdminSentenceLibraryQuery = z.infer<
    typeof AdminSentenceLibraryQuerySchema
>;
export type AdminSentenceLibraryFilters = z.infer<
    typeof AdminSentenceLibraryFiltersSchema
>;
export type AdminSentenceLibrarySnapshotRequest = z.infer<
    typeof AdminSentenceLibrarySnapshotRequestSchema
>;
export type AdminSentenceLibraryMutationRequest = z.infer<
    typeof AdminSentenceLibraryMutationRequestSchema
>;
export type AdminSentenceLibrarySnapshotResponse = z.infer<
    typeof AdminSentenceLibrarySnapshotResponseSchema
>;
export type AdminSentenceLibraryMutationResponse = z.infer<
    typeof AdminSentenceLibraryMutationResponseSchema
>;
export type AdminSentenceLibraryListResponse = z.infer<
    typeof AdminSentenceLibraryListResponseSchema
>;
export type AdminSentenceLibraryDetail = z.infer<
    typeof AdminSentenceLibraryDetailSchema
>;

export const AdminSentenceDictionaryQuerySchema = z
    .object({
        cursor: DictionaryCursorSchema.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict();
export const AdminSentenceDictionaryItemSchema = z
    .object({
        dictionaryId: z.uuid(),
        title: DictionaryNameSchema,
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        generatedCount: z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER),
        availableCount: z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER),
    })
    .strict();
export const AdminSentenceDictionaryResponseSchema = z
    .object({
        items: z.array(AdminSentenceDictionaryItemSchema).max(100),
        nextCursor: DictionaryCursorSchema.nullable(),
    })
    .strict();
export type AdminSentenceDictionaryQuery = z.infer<
    typeof AdminSentenceDictionaryQuerySchema
>;
export type AdminSentenceDictionaryItem = z.infer<
    typeof AdminSentenceDictionaryItemSchema
>;
export type AdminSentenceDictionaryResponse = z.infer<
    typeof AdminSentenceDictionaryResponseSchema
>;
export const AdminSentenceDictionariesQuerySchema =
    AdminSentenceDictionaryQuerySchema;
export const AdminSentenceDictionariesResponseSchema =
    AdminSentenceDictionaryResponseSchema;
export type AdminSentenceDictionariesQuery = AdminSentenceDictionaryQuery;
export type AdminSentenceDictionariesResponse = AdminSentenceDictionaryResponse;
