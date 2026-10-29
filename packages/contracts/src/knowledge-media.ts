import { z } from 'zod';

export const knowledgeAudioMaximumBytes = 5 * 1024 * 1024;
export const KnowledgeMediaAssetSchema = z
    .object({
        id: z.uuid(),
        mimeType: z.enum(['audio/wav', 'audio/mpeg']),
        byteLength: z.number().int().positive().max(knowledgeAudioMaximumBytes),
        durationMs: z.number().positive().max(1_800_000),
    })
    .strict();
export const KnowledgeMediaParamsSchema = z
    .object({ noteId: z.uuid(), assetId: z.uuid() })
    .strict();
export const KnowledgeMediaAccessSchema = z
    .object({
        kind: z.enum(['note', 'workbook']),
        locator: z.string().min(1).max(200),
        key: z.string().min(1).max(300),
    })
    .strict();
export type KnowledgeMediaAsset = z.infer<typeof KnowledgeMediaAssetSchema>;
export type KnowledgeMediaAccess = z.infer<typeof KnowledgeMediaAccessSchema>;
