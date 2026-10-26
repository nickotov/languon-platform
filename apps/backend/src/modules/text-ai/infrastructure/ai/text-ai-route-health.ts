import { currentTextAiProviderAttemptWitness } from './text-ai-provider-attempt-context';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { TextAiFlowIdSchema } from '@languon/contracts';
import type { databaseSchema } from '../../../../infrastructure/database/schema';
import type { SentenceProviderFailure } from '../../../learning/infrastructure/ai/sentence-provider-failure';
import { findTextAiModel } from './text-ai-provider-catalog';

export interface TextAiRouteHealthObservation {
    routeId: string;
    flowId: string;
    fingerprint: string;
    failure: SentenceProviderFailure;
    reason?:
        | 'model_retired'
        | 'model_unavailable'
        | 'authorization_failed'
        | 'invalid_output'
        | 'request_rejected'
        | 'schema_incompatible'
        | 'rate_limited'
        | 'provider_credits_exhausted'
        | 'provider_unavailable';
}
const observationSchema = z.object({
    routeId: z.string().max(240),
    flowId: TextAiFlowIdSchema,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z
        .enum([
            'model_retired',
            'model_unavailable',
            'authorization_failed',
            'invalid_output',
            'request_rejected',
            'schema_incompatible',
            'rate_limited',
            'provider_credits_exhausted',
            'provider_unavailable',
        ])
        .optional(),
    failure: z.object({
        reason: z.enum([
            'model_retired',
            'schema_incompatible',
            'model_unavailable',
            'authorization_failed',
            'provider_credits_exhausted',
            'rate_limited',
            'provider_unavailable',
        ]),
        errorName: z.string().max(80).optional(),
        httpStatus: z.number().int().min(100).max(599).optional(),
        providerCode: z.number().int().min(400).max(599).optional(),
    }),
});

/** Awaited at the SDK boundary; a failed health write cannot silently authorize another call. */
export function createTextAiRouteHealthRecorder(
    database: PostgresJsDatabase<typeof databaseSchema>,
) {
    return async (event: TextAiRouteHealthObservation): Promise<void> => {
        const parsed = observationSchema.parse(event);
        if (
            (parsed.failure.httpStatus === 403 ||
                parsed.failure.providerCode === 403) &&
            parsed.failure.providerCode !== 401
        )
            return;
        const route = findTextAiModel(parsed.routeId);
        if (!route) throw new Error('Unreviewed route health observation.');
        const reason =
            (parsed.failure.httpStatus === 400 ||
                parsed.failure.providerCode === 400) &&
            parsed.failure.reason === 'provider_unavailable' &&
            parsed.reason !== 'schema_incompatible'
                ? 'request_rejected'
                : (parsed.reason ??
                  (parsed.failure.errorName === 'AI_NoObjectGeneratedError'
                      ? 'invalid_output'
                      : parsed.failure.reason));
        const witness = currentTextAiProviderAttemptWitness();
        if (!witness)
            throw new Error(
                'Provider health requires a current admitted attempt witness.',
            );
        await database.execute(
            sql`select languon_record_text_ai_route_health(${randomUUID()}::uuid,${witness.attemptId}::uuid,${witness.jobId}::uuid,${witness.leaseToken ?? null}::text,${witness.workerId ?? null}::text,${witness.fencingToken ?? null}::bigint,${reason})`,
        );
    };
}
