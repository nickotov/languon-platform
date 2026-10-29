import { z } from 'zod';
import { AssistantLanguageSchema } from './contextual-assistant';

export const KnowledgeTranscriptionRequestSchema = z
    .object({
        operationId: z.uuid(),
        noteId: z.uuid(),
        assetId: z.uuid(),
        languages: z.array(AssistantLanguageSchema).max(16).default([]),
    })
    .strict();

/** Execution receipt from canonical financial/source authority, never accepted from an HTTP caller. */
export const KnowledgeTranscriptionDispatchPermitSchema = z
    .object({
        receiptId: z.uuid(),
        operationId: z.uuid(),
        noteId: z.uuid(),
        assetId: z.uuid(),
        checksum: z.string().regex(/^[a-f0-9]{64}$/u),
        providerId: z.literal('openai'),
        modelId: z.literal('gpt-transcribe'),
        providerPriceRevisionId: z.uuid(),
        customerTariffRevisionId: z.uuid(),
        processingControlsRevision: z.string().min(1).max(128),
        /** Internal-only receipt pin, never an HTTP request/response field. */
        processingCredentialFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
        usageMeter: z.literal('audioInputMilliseconds'),
        maximumBytes: z.number().int().positive().max(5_242_880),
        maximumDurationMs: z.number().int().positive().max(1_800_000),
        expiresAt: z.iso.datetime(),
    })
    .strict();
const transcriptText = z
    .string()
    .min(1)
    .max(80_000)
    .refine(
        (value) =>
            value.trim().length > 0 &&
            !/[\uD800-\uDFFF]/u.test(value) &&
            !value.includes('\u0000'),
    );
export const KnowledgeTranscriptionResultSchema = z
    .object({
        receiptId: z.uuid(),
        text: transcriptText,
        languages: z.array(AssistantLanguageSchema).max(16),
        /** Provider observation only; null explicitly means unknown, never local media duration. */
        usage: z
            .object({
                type: z.literal('duration'),
                seconds: z.number().finite().nonnegative(),
            })
            .strict()
            .nullable(),
    })
    .strict();
export type KnowledgeTranscriptionRequest = z.infer<
    typeof KnowledgeTranscriptionRequestSchema
>;
export type KnowledgeTranscriptionDispatchPermit = z.infer<
    typeof KnowledgeTranscriptionDispatchPermitSchema
>;
export type KnowledgeTranscriptionResult = z.infer<
    typeof KnowledgeTranscriptionResultSchema
>;
