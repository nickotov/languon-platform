import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    AiCreditInsufficientBalanceError,
    resolveAiCreditMeasurement,
} from '../../../../ai-credits/domain/ai-credit';
import { SentenceCreditsExhaustedError } from '../../../domain/sentence-errors';
import { textAiProviderUsageCostMicros } from '../../../../text-ai/application/text-ai-provider-catalog';
import { sentenceAiJobsTable as jobs } from './sentence-schema';
import type {
    SentenceJobRow,
    SentenceTransaction,
} from './sentence-persistence-support';
export function sentenceBudget(job: SentenceJobRow) {
    return {
        inputCostMicrosPerMillionTokens:
            job.providerInputCostMicrosPerMillionTokens,
        outputCostMicrosPerMillionTokens:
            job.providerOutputCostMicrosPerMillionTokens,
        maxCostMicrosPerAttempt: job.providerMaxCostMicrosPerAttempt,
        maxInputTokensPerAttempt: job.providerMaxInputTokensPerAttempt,
        maxOutputTokensPerAttempt: job.providerMaxOutputTokensPerAttempt,
    };
}
export async function reserveSentenceAttempt(
    tx: SentenceTransaction,
    job: SentenceJobRow,
    attempt: number,
    now: Date,
) {
    if (!job.aiCreditAccounted) return;
    const id = randomUUID();
    try {
        const result = await new DrizzleAiCreditTransactionParticipant(
            tx,
        ).reserveAttempt({
            at: now,
            attempt,
            jobId: job.id,
            jobKind: job.jobKind,
            maximumCredits: BigInt(job.aiCreditMaxCreditsPerAttempt!),
            ownerId: job.learnerId,
            reservationId: id,
        });
        await tx
            .update(jobs)
            .set({
                aiCreditReservationId: id,
                aiCreditPolicyMode: result.policy.mode,
                aiCreditProviderDispatchedAt: null,
            })
            .where(eq(jobs.id, job.id));
    } catch (error) {
        if (error instanceof AiCreditInsufficientBalanceError)
            throw new SentenceCreditsExhaustedError();
        throw error;
    }
}
export async function settleSentenceAttempt(
    tx: SentenceTransaction,
    job: SentenceJobRow,
    now: Date,
    usage?: { inputTokens: number; outputTokens: number },
) {
    if (job.providerReservationState !== 'active') return;
    if (
        usage &&
        (!Number.isSafeInteger(usage.inputTokens) ||
            !Number.isSafeInteger(usage.outputTokens) ||
            usage.inputTokens < 0 ||
            usage.outputTokens < 0 ||
            usage.inputTokens > job.providerMaxInputTokensPerAttempt ||
            usage.outputTokens > job.providerMaxOutputTokensPerAttempt)
    )
        throw new Error('Sentence provider usage exceeds reservation');
    if (job.aiCreditAccounted && job.aiCreditReservationId) {
        const credits = new DrizzleAiCreditTransactionParticipant(tx);
        if (!job.aiCreditProviderDispatchedAt)
            await credits.releaseUndispatchedAttempt({
                ownerId: job.learnerId,
                releasedAt: now,
                reservationId: job.aiCreditReservationId,
            });
        else {
            const measured = usage
                ? BigInt(
                      Math.ceil(
                          (usage.inputTokens *
                              job.aiCreditInputCreditsPerMillionTokens!) /
                              1_000_000,
                      ) +
                          Math.ceil(
                              (usage.outputTokens *
                                  job.aiCreditOutputCreditsPerMillionTokens!) /
                                  1_000_000,
                          ),
                  )
                : null;
            await credits.settleAttempt({
                ownerId: job.learnerId,
                reservationId: job.aiCreditReservationId,
                settledAt: now,
                measuredCredits: measured,
                measurement: resolveAiCreditMeasurement(
                    job.aiCreditPolicyMode!,
                    usage !== undefined,
                ),
            });
        }
    }
    const dispatched = job.aiCreditProviderDispatchedAt !== null;
    const actual = dispatched
        ? (usage ?? {
              inputTokens: job.providerMaxInputTokensPerAttempt,
              outputTokens: job.providerMaxOutputTokensPerAttempt,
          })
        : { inputTokens: 0, outputTokens: 0 };
    await tx
        .update(jobs)
        .set({
            providerReservationState:
                dispatched || (job.providerActualCostMicros ?? 0) > 0
                    ? 'settled'
                    : 'released',
            providerReservationSettledAt: now,
            providerActualInputTokens:
                (job.providerActualInputTokens ?? 0) + actual.inputTokens,
            providerActualOutputTokens:
                (job.providerActualOutputTokens ?? 0) + actual.outputTokens,
            providerActualCostMicros:
                (job.providerActualCostMicros ?? 0) +
                (dispatched
                    ? textAiProviderUsageCostMicros(sentenceBudget(job), actual)
                    : 0),
        })
        .where(eq(jobs.id, job.id));
}
