import { dictionaryActionInputOverhead } from './legacy-generation-input-limit';
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
import { eq } from 'drizzle-orm';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { AiCreditInsufficientBalanceError } from '../../../../ai-credits/domain/ai-credit';
import {
    DictionaryGenerationNotAvailableError,
    DictionaryAiCreditsExhaustedError,
} from '../../../application/dictionary-errors';
import { dictionaryGenerationJobsTable } from './schema';
import type {
    JobRow,
    GenerationStoreContext,
    ProviderExecution,
    Transaction,
} from './generation-context';

export function creditUsage(
    job: JobRow,
    usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    },
): bigint {
    if (
        job.aiCreditInputCreditsPerMillionTokens === null ||
        job.aiCreditOutputCreditsPerMillionTokens === null
    )
        throw new Error('AI credit pricing is missing');

    return roundActionChargeMilli(
        actionChargeNumerator(usage, {
            inputCreditsPerMillionTokens: String(
                job.aiCreditInputCreditsPerMillionTokens,
            ),
            outputCreditsPerMillionTokens: String(
                job.aiCreditOutputCreditsPerMillionTokens,
            ),
        }),
    );
}

export function aiCreditJobValues(
    context: GenerationStoreContext,
    providerExecution: ProviderExecution,
) {
    if (!context.aiCreditEnforcementEnabled) return {};
    const pricing = providerExecution.snapshot?.creditPricing;
    if (!providerExecution.revisionId || !pricing)
        throw new DictionaryGenerationNotAvailableError();

    return {
        aiCreditAccounted: false,
        maxAttempts: 2,
        aiCreditInputCreditsPerMillionTokens:
            pricing.inputCreditsPerMillionTokens,
        aiCreditMaxCreditsPerAttempt: pricing.maxCreditsPerAttempt,
        aiCreditOutputCreditsPerMillionTokens:
            pricing.outputCreditsPerMillionTokens,
        aiCreditPricingRevision: pricing.revision,
    } as const;
}

export async function reserveInitialAiCreditAttempt(
    context: GenerationStoreContext,
    tx: Transaction,
    job: JobRow,
    at: Date,
) {
    if (usesLegacyAction(job.selectedExecutionSnapshot)) {
        try {
            await reserveLegacyAction(tx, {
                id: job.id,
                requestKey: job.idempotencyKey,
                fingerprint: job.requestFingerprint,
                scope: `dictionary-generation:${job.kind}`,
                ownerId: job.ownerId,
                kind: 'dictionary-generation',
                snapshot: job.selectedExecutionSnapshot,
                inputPayload: job.inputPayload,
                inputOverheadTokens: dictionaryActionInputOverhead(
                    job.inputPayload,
                ),
                at,
            });
        } catch (error) {
            if (error instanceof OperatorBudgetUnavailableError)
                throw new DictionaryGenerationNotAvailableError();
            if (error instanceof AiCreditInsufficientBalanceError)
                throw new DictionaryAiCreditsExhaustedError();

            throw error;
        }

        return;
    }

    if (!job.aiCreditAccounted) return;
    try {
        const reservation = await reserveAiCreditAttempt(
            context,
            tx,
            job,
            1,
            at,
        );

        await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditPolicyMode: reservation.mode,
                aiCreditReservationId: reservation.id,
            })
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
    } catch (error) {
        if (error instanceof AiCreditInsufficientBalanceError)
            throw new DictionaryAiCreditsExhaustedError();

        throw error;
    }
}

export async function reserveAiCreditAttempt(
    context: GenerationStoreContext,
    tx: Transaction,
    job: JobRow,
    attempt: number,
    at: Date,
) {
    if (!job.aiCreditMaxCreditsPerAttempt)
        throw new Error('AI credit pricing is missing');
    const reservationId = context.ids.generate();
    const reservation = await new DrizzleAiCreditTransactionParticipant(
        tx,
    ).reserveAttempt({
        at,
        attempt,
        jobId: job.id,
        maximumCredits: BigInt(job.aiCreditMaxCreditsPerAttempt),
        ownerId: job.ownerId,
        reservationId,
    });

    return { id: reservationId, mode: reservation.policy.mode };
}

export async function settleCurrentAiCreditAttempt(
    tx: Transaction,
    job: JobRow,
    input: {
        at: Date;
        providerUsage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
        };
        outcome?: 'success' | 'stopped' | 'failure';
        terminal?: boolean;
    },
) {
    if (usesLegacyAction(job.selectedExecutionSnapshot)) {
        await recordLegacyAttempt(tx, {
            id: job.id,
            ownerId: job.ownerId,
            attempt: job.attemptCount,
            snapshot: job.selectedExecutionSnapshot,
            successful:
                input.outcome === 'success' || input.outcome === 'stopped',
            dispatched: job.aiCreditProviderDispatchedAt !== null,
            ...(input.providerUsage ? { usage: input.providerUsage } : {}),
            at: input.at,
        });

        if (input.terminal !== false)
            await settleLegacyAction(tx, {
                id: job.id,
                ownerId: job.ownerId,
                outcome: input.outcome ?? 'failure',
                at: input.at,
            });

        return;
    }

    if (!job.aiCreditAccounted) return;
    if (!job.aiCreditReservationId) return;
    if (!job.aiCreditPolicyMode)
        throw new Error('AI credit reservation is missing');
    const credits = new DrizzleAiCreditTransactionParticipant(tx);
    if (!job.aiCreditProviderDispatchedAt) {
        await credits.releaseUndispatchedAttempt({
            ownerId: job.ownerId,
            releasedAt: input.at,
            reservationId: job.aiCreditReservationId,
        });

        return;
    }

    const measuredCredits =
        input.outcome !== undefined &&
        input.outcome !== 'failure' &&
        input.providerUsage
            ? creditUsage(job, input.providerUsage)
            : 0n;

    if (!input.outcome || input.outcome === 'failure' || !input.providerUsage)
        await credits.settleFailedAttempt({
            ownerId: job.ownerId,
            reservationId: job.aiCreditReservationId,
            settledAt: input.at,
        });
    else {
        await credits.settleAttempt({
            measuredCredits,
            measurement: 'provider_reported',
            ownerId: job.ownerId,
            reservationId: job.aiCreditReservationId,
            settledAt: input.at,
        });
    }
}
