import { z } from 'zod';

import {
    DictionaryCardIdSchema,
    DictionaryIdSchema,
    DictionaryVersionSchema,
} from './primitives';

export const dictionaryDeletionSelectedTargetLimit = 500;

export const DictionaryDeletionTargetKindSchema = z.enum([
    'dictionary',
    'card',
]);

export const DictionaryDeletionSnapshotSchema = z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/);

export const DictionaryDeletionPreviewResponseSchema = z
    .object({
        eligibleCount: z.number().int().nonnegative(),
        snapshot: DictionaryDeletionSnapshotSchema,
        targetKind: DictionaryDeletionTargetKindSchema,
    })
    .strict();

const SelectedDictionaryDeletionScopeSchema = z
    .object({
        kind: z.literal('selected'),
        targets: z
            .array(
                z
                    .object({
                        dictionaryId: DictionaryIdSchema,
                        expectedVersion: DictionaryVersionSchema,
                    })
                    .strict(),
            )
            .min(1)
            .max(dictionaryDeletionSelectedTargetLimit)
            .superRefine((targets, context) => {
                if (
                    new Set(targets.map((target) => target.dictionaryId))
                        .size !== targets.length
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Dictionary deletion targets must be unique',
                    });
                }
            }),
    })
    .strict();

const AllArchivedDictionaryDeletionScopeSchema = z
    .object({
        kind: z.literal('all-archived'),
        snapshot: DictionaryDeletionSnapshotSchema,
    })
    .strict();

export const DeleteDictionariesRequestSchema = z
    .object({
        scope: z.discriminatedUnion('kind', [
            SelectedDictionaryDeletionScopeSchema,
            AllArchivedDictionaryDeletionScopeSchema,
        ]),
    })
    .strict();

const SelectedDictionaryCardDeletionScopeSchema = z
    .object({
        kind: z.literal('selected'),
        targets: z
            .array(
                z
                    .object({
                        cardId: DictionaryCardIdSchema,
                        expectedVersion: DictionaryVersionSchema,
                    })
                    .strict(),
            )
            .min(1)
            .max(dictionaryDeletionSelectedTargetLimit)
            .superRefine((targets, context) => {
                if (
                    new Set(targets.map((target) => target.cardId)).size !==
                    targets.length
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Card deletion targets must be unique',
                    });
                }
            }),
    })
    .strict();

const AllArchivedDictionaryCardDeletionScopeSchema = z
    .object({
        kind: z.literal('all-archived'),
        snapshot: DictionaryDeletionSnapshotSchema,
    })
    .strict();

export const DeleteDictionaryCardsRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        scope: z.discriminatedUnion('kind', [
            SelectedDictionaryCardDeletionScopeSchema,
            AllArchivedDictionaryCardDeletionScopeSchema,
        ]),
    })
    .strict();

export const DictionaryDeletionReceiptResponseSchema = z
    .object({
        deletedCount: z.number().int().positive(),
        operationId: z.uuid(),
        resultingDictionaryVersion: DictionaryVersionSchema.nullable(),
        targetKind: DictionaryDeletionTargetKindSchema,
    })
    .strict();

export type DeleteDictionariesRequest = z.infer<
    typeof DeleteDictionariesRequestSchema
>;
export type DeleteDictionaryCardsRequest = z.infer<
    typeof DeleteDictionaryCardsRequestSchema
>;
export type DictionaryDeletionPreviewResponse = z.infer<
    typeof DictionaryDeletionPreviewResponseSchema
>;
export type DictionaryDeletionReceiptResponse = z.infer<
    typeof DictionaryDeletionReceiptResponseSchema
>;
