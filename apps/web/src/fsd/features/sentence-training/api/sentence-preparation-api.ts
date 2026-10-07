import {
    SentencePreparationStartRequestSchema,
    SentencePreparationBatchSchema,
    SentencePreparationStartResponseSchema,
    SentencePreparationResponseSchema,
    SentencePreparationCommandRequestSchema,
    SentencePreparationCommandResponseSchema,
    SentencePreparationBatchesQuerySchema,
    SentencePreparationBatchesResponseSchema,
} from '@languon/contracts';
import type { SentencePreparationApi } from '../types';

type Request = <T>(
    path: string,
    schema: { parse(value: unknown): T },
    method?: string,
    body?: unknown,
) => Promise<T>;

export function createSentencePreparationApi(
    request: Request,
    prefix: string,
    pathId: (id: string) => string,
): SentencePreparationApi {
    return {
        preparedBatch: (id) =>
            request(
                `${prefix}/prepared-batches/${pathId(id)}`,
                SentencePreparationBatchSchema,
            ),
        startPreparation: (input) =>
            request(
                `${prefix}/preparations`,
                SentencePreparationStartResponseSchema,
                'POST',
                SentencePreparationStartRequestSchema.parse(input),
            ),
        getPreparation: (id) =>
            request(
                `${prefix}/preparations/${pathId(id)}`,
                SentencePreparationResponseSchema,
            ),
        commandPreparation: (id, input) =>
            request(
                `${prefix}/preparations/${pathId(id)}/commands`,
                SentencePreparationCommandResponseSchema,
                'POST',
                SentencePreparationCommandRequestSchema.parse(input),
            ),
        preparationBatches: (id, input) => {
            const query = SentencePreparationBatchesQuerySchema.parse(input);
            return request(
                `${prefix}/preparations/${pathId(id)}/batches?offset=${query.offset}&limit=${query.limit}`,
                SentencePreparationBatchesResponseSchema,
            );
        },
    };
}
