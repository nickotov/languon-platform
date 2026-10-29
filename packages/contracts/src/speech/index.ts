import { z } from 'zod';
import { CreditAmountNumberSchema } from '../ai-credit-amount';

const id = z.string().uuid();
export const SpeechAccessSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('owner'), dictionaryId: id }).strict(),
    z
        .object({
            kind: z.literal('shared'),
            shareId: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
            shareKey: z.string().min(1).max(512),
        })
        .strict(),
]);
export const SpeechSourceSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('knowledge-block'),
            noteId: id,
            branchId: id,
            blockId: id,
            expectedBranchVersion: z.number().int().positive(),
        })
        .strict(),
    z
        .object({
            kind: z.literal('flashcard-field'),
            access: SpeechAccessSchema,
            cardId: id,
            field: z.enum([
                'source',
                'translation',
                'sourceExample',
                'targetExample',
            ]),
            expectedLearningVersion: z.number().int().positive().optional(),
        })
        .strict(),
    z
        .object({
            kind: z.literal('dictionary-field'),
            access: SpeechAccessSchema,
            cardId: id,
            field: z.enum([
                'source',
                'translation',
                'example',
                'exampleTranslation',
            ]),
            expectedVersion: z.number().int().positive().optional(),
            expectedDictionaryVersion: z.number().int().positive().optional(),
            expectedSettingsVersion: z.number().int().positive().optional(),
        })
        .strict(),
    z
        .object({
            kind: z.literal('sentence-practice'),
            access: SpeechAccessSchema,
            exerciseId: id,
            sessionId: id,
            field: z.enum(['prompt', 'reference']),
        })
        .strict(),
    z
        .object({
            kind: z.literal('sentence-library'),
            access: SpeechAccessSchema,
            exerciseId: id,
            field: z.enum(['prompt', 'reference']),
        })
        .strict(),
    z
        .object({
            kind: z.literal('checked-answer'),
            access: SpeechAccessSchema,
            attemptId: id,
        })
        .strict(),
]);
export type SpeechSource = z.infer<typeof SpeechSourceSchema>;
export const SpeechQuoteSchema = z
    .object({
        id,
        credits: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,3})?$/),
        availableCredits: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,3})?$/),
        unlimited: z.boolean().default(false),
        characterCount: z.number().int().nonnegative(),
        wordCount: z.number().int().nonnegative(),
        expiresAt: z.string().datetime(),
        provisional: z.boolean(),
    })
    .strict();
export type SpeechQuote = z.infer<typeof SpeechQuoteSchema>;
export const SpeechResponseSchema = z
    .object({
        state: z.enum([
            'unavailable',
            'confirmation_required',
            'queued',
            'processing',
            'ready',
            'failed',
            'submission_unknown',
        ]),
        requestId: id.nullable(),
        playbackId: id.nullable(),
        quote: SpeechQuoteSchema.nullable(),
        fixture: z.boolean(),
        retryAfterMs: z.number().int().nonnegative().nullable(),
        error: z.string().nullable(),
        billingState: z
            .enum(['free', 'reserved', 'charged_success', 'released_no_charge'])
            .nullable(),
    })
    .strict();
export type SpeechResponse = z.infer<typeof SpeechResponseSchema>;
export const SpeechPrepareRequestSchema = z
    .object({ source: SpeechSourceSchema, operationId: id })
    .strict();
export const SpeechConfirmRequestSchema = z
    .object({ quoteId: id, operationId: id })
    .strict();
export const SpeechAvailabilityRequestSchema = z
    .object({ sources: z.array(SpeechSourceSchema).min(1).max(50) })
    .strict();
export const SpeechAvailabilityResponseSchema = z
    .object({
        availability: z
            .array(
                z
                    .object({
                        source: SpeechSourceSchema,
                        playable: z.boolean(),
                        generationAvailable: z.boolean(),
                    })
                    .strict(),
            )
            .max(50),
    })
    .strict();

export const ModelPriceSchema = z
    .object({
        providerId: z.string().min(1).max(128),
        modelId: z.string().min(1).max(128),
        meter: z.enum(['speech-characters', 'text-tokens']),
        version: z.number().int().nonnegative(),
        rateRevisionId: id.nullable(),
        creditsPer1000Characters: CreditAmountNumberSchema.positive()
            .max(1000000000)
            .nullable(),
        minimumCredits: CreditAmountNumberSchema.max(1000000000).nullable(),
        inputCreditsPerMillionTokens:
            CreditAmountNumberSchema.max(1000000000).nullable(),
        outputCreditsPerMillionTokens:
            CreditAmountNumberSchema.max(1000000000).nullable(),
        cachedInputCreditsPerMillionTokens: CreditAmountNumberSchema.max(
            1000000000,
        )
            .nullable()
            .optional(),
        provisional: z.boolean(),
        updatedAt: z.string().datetime().nullable(),
    })
    .strict();
export type ModelPrice = z.infer<typeof ModelPriceSchema>;
export const ModelPricesResponseSchema = z
    .object({ prices: z.array(ModelPriceSchema).max(100) })
    .strict();
export const ModelPricePublishRequestSchema = ModelPriceSchema.omit({
    version: true,
    rateRevisionId: true,
    updatedAt: true,
})
    .extend({
        expectedVersion: z.number().int().nonnegative(),
        reason: z.string().trim().min(5).max(500),
    })
    .strict();

export const AdminSpeechRecordingSchema = z
    .object({
        id,
        text: z.string(),
        language: z.string(),
        provider: z.string(),
        model: z.string(),
        state: z.string(),
        bindingCount: z.number().int().nonnegative(),
        byteLength: z.number().int().nonnegative().nullable(),
        durationMs: z.number().nonnegative().nullable(),
        createdAt: z.string().datetime(),
        lastAccessedAt: z.string().datetime(),
        version: z.number().int().positive(),
    })
    .strict();
export type AdminSpeechRecording = z.infer<typeof AdminSpeechRecordingSchema>;
export const AdminSpeechListQuerySchema = z
    .object({
        search: z.string().max(200).optional(),
        language: z.string().max(32).optional(),
        model: z.string().max(128).optional(),
        provider: z.string().max(128).optional(),
        linked: z.enum(['true', 'false']).optional(),
        state: z.string().max(32).optional(),
        createdFrom: z.string().datetime().optional(),
        createdTo: z.string().datetime().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict();
export const AdminSpeechListResponseSchema = z
    .object({
        recordings: z.array(AdminSpeechRecordingSchema).max(100),
        total: z.number().int().nonnegative(),
    })
    .strict();
export const AdminSpeechDeleteRequestSchema = z
    .object({
        operationId: id,
        reason: z.string().trim().min(5).max(500),
        recordings: z
            .array(
                z
                    .object({
                        id,
                        expectedVersion: z.number().int().positive(),
                        expectedBindingCount: z.number().int().nonnegative(),
                    })
                    .strict(),
            )
            .min(1)
            .max(100),
    })
    .strict();
export const AdminSpeechDeleteResponseSchema = z
    .object({ deletedIds: z.array(id).max(100) })
    .strict();
