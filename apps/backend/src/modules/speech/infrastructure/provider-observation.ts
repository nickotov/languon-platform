import { isDeepStrictEqual } from 'node:util';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ProviderNativeUsageSchema } from '@languon/contracts';
import type {
    SpeechJob,
    SpeechProviderObservation,
} from '../application/ports';
import type { AiCreditTransaction } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { speechJobsTable as jobs } from './schema';

const observationSchema = z
    .object({
        usage: ProviderNativeUsageSchema.optional(),
        execution: z
            .object({
                endpointId: z.string().trim().min(1).max(200).optional(),
                serviceTier: z.string().trim().min(1).max(200).optional(),
            })
            .strict()
            .optional(),
    })
    .strict();

/** Keep the first provider observation with the storage inventory across crashes. */
export async function retainSpeechProviderObservation(
    tx: AiCreditTransaction,
    row: typeof jobs.$inferSelect,
    job: SpeechJob,
    raw: SpeechProviderObservation | undefined,
) {
    // Historical ready inventory predates native observations and keeps its old fact.
    if (
        row.providerOutcome !== null &&
        !row.providerPriceSnapshot?.nativeRules &&
        row.providerUsage === null
    )
        return;
    const observed = observationSchema.parse(raw ?? {});
    const usage = ProviderNativeUsageSchema.parse({
        ...row.providerUsage,
        ...observed.usage,
        requests: 1,
        characters: Array.from(job.text).length,
    });
    const execution = observed.execution
        ? {
              ...row.providerExecutionFacts,
              ...(observed.execution.endpointId === undefined
                  ? {}
                  : { endpointId: observed.execution.endpointId }),
              ...(observed.execution.serviceTier === undefined
                  ? {}
                  : { serviceTier: observed.execution.serviceTier }),
          }
        : row.providerExecutionFacts;
    if (row.providerUsage !== null || row.providerOutcome !== null) {
        if (
            !isDeepStrictEqual(row.providerUsage, usage) ||
            !isDeepStrictEqual(row.providerExecutionFacts, execution)
        )
            throw new Error(
                'Speech provider observation differs from its immutable first result.',
            );
        return;
    }
    await tx.execute(
        sql`select public.languon_retain_speech_provider_observation(${row.id}::uuid,${job.leaseToken}::uuid,${JSON.stringify(usage)}::jsonb,${execution === null ? null : JSON.stringify(execution)}::jsonb)`,
    );
}

/** Late output errors retain metadata only while this worker still owns its live lease. */
export async function retainLiveSpeechProviderObservation(
    tx: AiCreditTransaction,
    job: SpeechJob,
    raw: SpeechProviderObservation | undefined,
    now: Date,
) {
    if (!raw) return;
    const [row] = await tx
        .select()
        .from(jobs)
        .where(
            and(
                eq(jobs.id, job.id),
                eq(jobs.leaseToken, job.leaseToken),
                gt(jobs.leaseExpiresAt, now),
                inArray(jobs.state, ['submitting', 'processing', 'storing']),
            ),
        )
        .limit(1)
        .for('update');
    if (row) await retainSpeechProviderObservation(tx, row, job, raw);
}
