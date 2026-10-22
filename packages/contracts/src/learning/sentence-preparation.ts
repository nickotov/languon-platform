import { z } from 'zod';
import { ActionBillingSchema } from '../ai-action';
import { DictionaryLanguageTagSchema } from '../dictionaries/primitives';
import {
    SentenceDirectionSchema,
    SentenceModeSchema,
    SentenceScopeSchema,
} from './sentences';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const roundIds = z
    .array(z.uuid())
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'IDs must be unique');
export const SentencePreparationStateSchema = z.enum([
    'queued',
    'running',
    'stopping',
    'paused',
    'completed',
    'failed',
]);
export const SentencePreparationPauseReasonSchema = z.enum([
    'user',
    'credits',
    'budget',
    'capacity',
    'model',
    'provider',
    'stale',
    'access',
]);
export const SentencePreparationStartRequestSchema = z
    .object({
        operationId: z.uuid(),
        direction: SentenceDirectionSchema,
        mode: SentenceModeSchema,
        initialRoundScope: SentenceScopeSchema,
        explanationLanguage: DictionaryLanguageTagSchema.optional(),
        confirmedQuoteId: z.uuid().optional(),
    })
    .strict();
export const SentencePreparationBatchSchema = z
    .object({
        id: z.uuid(),
        entryIds: roundIds,
        preparedEntryIds: roundIds,
        exerciseIds: roundIds,
        state: z.enum(['pending', 'ready', 'partial']),
    })
    .strict()
    .superRefine((batch, context) => {
        if (
            batch.entryIds.length === 0 ||
            batch.preparedEntryIds.some((id) => !batch.entryIds.includes(id))
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Prepared words must belong to a nonempty batch',
            });
        }
    });
export const SentencePreparationSchema = z
    .object({
        id: z.uuid(),
        dictionaryId: z.uuid(),
        direction: SentenceDirectionSchema,
        mode: SentenceModeSchema,
        state: SentencePreparationStateSchema,
        pauseReason: SentencePreparationPauseReasonSchema.nullable(),
        eligibleCount: count,
        preparedCount: count,
        reusedExerciseCount: count,
        generatedExerciseCount: count,
        initialBatch: SentencePreparationBatchSchema.nullable(),
        batchCount: count,
        activeJobId: z.uuid().nullable(),
        billing: ActionBillingSchema.optional(),
        remainingOutputTokens: z.number().int().min(0).max(10000).optional(),
        requiresNewBudget: z.boolean().optional(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
    })
    .strict()
    .superRefine((preparation, context) => {
        if (preparation.preparedCount > preparation.eligibleCount) {
            context.addIssue({
                code: 'custom',
                message: 'Prepared coverage exceeds eligible words',
            });
        }
    });
export const SentencePreparationStartResponseSchema = z
    .object({ preparation: SentencePreparationSchema })
    .strict();
export const SentencePreparationCommandRequestSchema = z
    .object({
        operationId: z.uuid(),
        action: z.enum(['stop', 'resume', 'continue']),
        confirmedQuoteId: z.uuid().optional(),
    })
    .strict();
export const SentencePreparationCommandResponseSchema =
    SentencePreparationStartResponseSchema;
export const SentencePreparationResponseSchema =
    SentencePreparationStartResponseSchema;
export type SentencePreparationState = z.infer<
    typeof SentencePreparationStateSchema
>;
export type SentencePreparationPauseReason = z.infer<
    typeof SentencePreparationPauseReasonSchema
>;
export type SentencePreparationStartRequest = z.infer<
    typeof SentencePreparationStartRequestSchema
>;
export type SentencePreparationBatch = z.infer<
    typeof SentencePreparationBatchSchema
>;
export type SentencePreparation = z.infer<typeof SentencePreparationSchema>;
export type SentencePreparationStartResponse = z.infer<
    typeof SentencePreparationStartResponseSchema
>;
export type SentencePreparationCommandRequest = z.infer<
    typeof SentencePreparationCommandRequestSchema
>;
export type SentencePreparationCommandResponse = z.infer<
    typeof SentencePreparationCommandResponseSchema
>;
export type SentencePreparationResponse = z.infer<
    typeof SentencePreparationResponseSchema
>;

export const SentencePreparationBatchesQuerySchema = z
    .object({
        offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
        limit: z.coerce.number().int().min(1).max(25).default(10),
    })
    .strict();
export const SentencePreparationBatchesResponseSchema = z
    .object({
        items: z.array(SentencePreparationBatchSchema).max(25),
        nextOffset: z.number().int().min(0).max(1_000_000).nullable(),
    })
    .strict();
export type SentencePreparationBatchesQuery = z.infer<
    typeof SentencePreparationBatchesQuerySchema
>;
export type SentencePreparationBatchesResponse = z.infer<
    typeof SentencePreparationBatchesResponseSchema
>;
