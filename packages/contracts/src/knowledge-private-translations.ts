import { z } from 'zod';
import { TextLanguageSchema } from './texts';
import { TextAiJobSchema } from './texts';
export const RequestKnowledgeTranslationSchema = z
    .object({
        operationId: z.uuid(),
        targetLanguage: TextLanguageSchema,
        confirmedQuoteId: z.uuid().optional(),
    })
    .strict();
export const KnowledgePrivateTranslationSchema = z
    .object({
        noteId: z.uuid(),
        blockId: z.uuid(),
        sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        targetLanguage: TextLanguageSchema,
        segments: z
            .array(
                z
                    .object({
                        sourceSegmentId: z.uuid(),
                        text: z.string().max(80_000),
                    })
                    .strict(),
            )
            .min(1)
            .max(500),
        updatedAt: z.iso.datetime(),
    })
    .strict();
export const KnowledgePrivateTranslationsResponseSchema = z
    .object({
        translations: z.array(KnowledgePrivateTranslationSchema).max(16),
    })
    .strict();
export const KnowledgeTranslationJobResponseSchema = z
    .object({ job: TextAiJobSchema })
    .strict();
export type KnowledgePrivateTranslation = z.infer<
    typeof KnowledgePrivateTranslationSchema
>;
export type RequestKnowledgeTranslation = z.infer<
    typeof RequestKnowledgeTranslationSchema
>;
