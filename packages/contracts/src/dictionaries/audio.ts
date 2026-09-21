import { z } from 'zod';

export const DictionaryAudioFieldSchema = z.enum([
    'source',
    'translation',
    'example',
    'exampleTranslation',
]);
export type DictionaryAudioField = z.infer<typeof DictionaryAudioFieldSchema>;
export const DictionaryAudioRequestSchema = z
    .object({
        field: DictionaryAudioFieldSchema,
        expectedCardVersion: z.number().int().positive(),
        expectedSettingsVersion: z.number().int().positive(),
    })
    .strict();
export type DictionaryAudioRequest = z.infer<
    typeof DictionaryAudioRequestSchema
>;
export const DictionaryAudioResponseSchema = z.object({
    state: z.enum([
        'unavailable',
        'queued',
        'processing',
        'ready',
        'failed',
        'submission_unknown',
    ]),
    field: DictionaryAudioFieldSchema,
    assetId: z.string().uuid().nullable(),
    fixture: z.boolean(),
    retryAfterMs: z.number().int().nonnegative().nullable(),
    error: z.string().nullable(),
});
export type DictionaryAudioResponse = z.infer<
    typeof DictionaryAudioResponseSchema
>;
