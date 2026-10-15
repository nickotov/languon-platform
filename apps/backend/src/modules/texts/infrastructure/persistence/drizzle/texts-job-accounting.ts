import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    AiCreditInsufficientBalanceError,
    resolveAiCreditMeasurement,
} from '../../../../ai-credits/domain/ai-credit';
import { TextsCreditsExhaustedError } from '../../../application/ports/texts-ai-provider';
import { textAiProviderUsageCostMicros } from '../../../../text-ai/application/text-ai-provider-catalog';
import { textsAiJobsTable as jobs } from './texts-job-schema';
import type { TextsJobRow, TextsTransaction } from './texts-job-support';
export function textsBudget(job: TextsJobRow) {
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
export async function reserveTextsAttempt(
    tx: TextsTransaction,
    job: TextsJobRow,
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
            ownerId: job.ownerId,
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
            throw new TextsCreditsExhaustedError();
        throw error;
    }
}
export async function settleTextsAttempt(
    tx: TextsTransaction,
    job: TextsJobRow,
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
        throw new Error('Texts provider usage exceeds reservation');
    if (job.aiCreditAccounted && job.aiCreditReservationId) {
        const credits = new DrizzleAiCreditTransactionParticipant(tx);
        if (!job.aiCreditProviderDispatchedAt)
            await credits.releaseUndispatchedAttempt({
                ownerId: job.ownerId,
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
                ownerId: job.ownerId,
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
                    ? textAiProviderUsageCostMicros(textsBudget(job), actual)
                    : 0),
        })
        .where(eq(jobs.id, job.id));
}
