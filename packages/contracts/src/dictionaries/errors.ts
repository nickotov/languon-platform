import { z } from 'zod';

export const DictionaryErrorCodeSchema = z.enum([
    'authentication_required',
    'dictionary_not_found',
    'card_not_found',
    'generation_job_not_found',
    'generation_not_available',
    'generation_not_reviewable',
    'generation_proposal_expired',
    'generation_candidate_conflict',
    'shared_dictionary_not_found',
    'invalid_request',
    'version_conflict',
    'idempotency_conflict',
    'language_pair_locked',
    'card_capacity_exceeded',
    'owner_capacity_exceeded',
    'rate_limited',
    'service_unavailable',
    'internal_error',
]);

export const DictionaryErrorResponseSchema = z
    .object({
        error: z
            .object({
                code: DictionaryErrorCodeSchema,
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

export type DictionaryErrorCode = z.infer<typeof DictionaryErrorCodeSchema>;
export type DictionaryErrorResponse = z.infer<
    typeof DictionaryErrorResponseSchema
>;
