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
import { AiCreditInsufficientBalanceError as SelectionCreditsError } from '../../../../ai-credits/domain/ai-credit';
import { textAiProviderUsageCostMicros } from '../../../../text-ai/application/text-ai-provider-catalog';
import { dictionaryTextSelectionJobsTable as jobs } from './selection-card-schema';
import type { SelectionTransaction as SentenceTransaction } from './text-selection-target';
type SentenceJobRow = typeof jobs.$inferSelect;
export function selectionBudget(job: SentenceJobRow) {
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
export async function reserveSelectionAttempt(
    tx: SentenceTransaction,
    job: SentenceJobRow,
    attempt: number,
    now: Date,
) {
    if (usesLegacyAction(job.selectedExecutionSnapshot)) {
        if (attempt === 1)
            await reserveLegacyAction(tx, {
                id: job.id,
                requestKey: job.operationId,
                fingerprint: job.requestHash,
                scope: 'text-selection-card',
                ownerId: job.ownerId,
                kind: 'text-selection-card',
                snapshot: job.selectedExecutionSnapshot,
                inputPayload: job.inputPayload,
                inputOverheadTokens: 32768,
                at: now,
            });
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
            jobKind: 'text-selection-card',
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
            throw new SelectionCreditsError();
        throw error;
    }
}
export async function settleSelectionAttempt(
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
            ownerId: job.ownerId,
            attempt: job.attemptCount,
            snapshot: job.selectedExecutionSnapshot,
            successful: outcome !== 'failure',
            dispatched: job.aiCreditProviderDispatchedAt !== null,
            ...(usage ? { usage } : {}),
            at: now,
        });
        if (terminal)
            await settleLegacyAction(tx, {
                id: job.id,
                ownerId: job.ownerId,
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
                ownerId: job.ownerId,
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
                    ownerId: job.ownerId,
                    reservationId: job.aiCreditReservationId,
                    settledAt: now,
                });
            else {
                await credits.settleAttempt({
                    ownerId: job.ownerId,
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
                    ? textAiProviderUsageCostMicros(
                          selectionBudget(job),
                          actual,
                      )
                    : 0),
        })
        .where(eq(jobs.id, job.id));
}
