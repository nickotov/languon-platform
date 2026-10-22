import { OperatorBudgetUnavailableError } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import {
    usesLegacyAction,
    reserveLegacyAction,
    recordLegacyAttempt,
    settleLegacyAction,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import {
    actionChargeNumerator,
    roundActionChargeMilli,
} from '../../../../ai-credits/domain/action-pricing';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { AiCreditInsufficientBalanceError } from '../../../../ai-credits/domain/ai-credit';
import {
    SentenceCreditsExhaustedError,
    SentenceCapacityUnavailableError,
} from '../../../domain/sentence-errors';
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
    if (usesLegacyAction(job.selectedExecutionSnapshot)) {
        try {
            if (attempt === 1 && !job.selectedExecutionSnapshot.actionParentId)
                await reserveLegacyAction(tx, {
                    id: job.id,
                    requestKey: job.operationId,
                    fingerprint: job.requestFingerprint,
                    scope: job.jobKind,
                    ownerId: job.learnerId,
                    kind: job.jobKind,
                    snapshot: job.selectedExecutionSnapshot,
                    inputPayload: job.inputPayload,
                    at: now,
                });
        } catch (error) {
            if (error instanceof OperatorBudgetUnavailableError)
                throw new SentenceCapacityUnavailableError();
            if (error instanceof AiCreditInsufficientBalanceError)
                throw new SentenceCreditsExhaustedError();
            throw error;
        }
        return;
    }
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
    usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    },
    outcome: 'success' | 'stopped' | 'failure' = 'failure',
    terminal = true,
) {
    if (usesLegacyAction(job.selectedExecutionSnapshot)) {
        await recordLegacyAttempt(tx, {
            id: job.id,
            ownerId: job.learnerId,
            attempt: job.attemptCount,
            snapshot: job.selectedExecutionSnapshot,
            successful: outcome !== 'failure',
            dispatched: job.aiCreditProviderDispatchedAt !== null,
            ...(usage ? { usage } : {}),
            at: now,
        });
        if (terminal && !job.selectedExecutionSnapshot.actionParentId)
            await settleLegacyAction(tx, {
                id: job.id,
                ownerId: job.learnerId,
                outcome,
                at: now,
            });
    }
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
            // Customer eligibility is independent of incurred provider usage.
            const measured =
                outcome !== 'failure' && usage
                    ? roundActionChargeMilli(
                          actionChargeNumerator(usage, {
                              inputCreditsPerMillionTokens: String(
                                  job.aiCreditInputCreditsPerMillionTokens!,
                              ),
                              outputCreditsPerMillionTokens: String(
                                  job.aiCreditOutputCreditsPerMillionTokens!,
                              ),
                          }),
                      )
                    : 0n;
            if (outcome === 'failure' || !usage)
                await credits.settleFailedAttempt({
                    ownerId: job.learnerId,
                    reservationId: job.aiCreditReservationId,
                    settledAt: now,
                });
            else {
                await credits.settleAttempt({
                    ownerId: job.learnerId,
                    reservationId: job.aiCreditReservationId,
                    settledAt: now,
                    measuredCredits: measured,
                    measurement: 'provider_reported',
                });
            }
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
