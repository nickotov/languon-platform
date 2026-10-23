import { sql } from 'drizzle-orm';
import {
    actionChargeNumerator,
    roundActionChargeMilli,
} from '../../../../ai-credits/domain/action-pricing';
import { resolveAiCreditMeasurement } from '../../../../ai-credits/domain/ai-credit';
import { ProviderCostAdmissionUnavailableError } from '../../../../ai-credits/domain/provider-cost-admission';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { OperatorBudgetUnavailableError } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import {
    prepareLegacyAction,
    recordLegacyAttempt,
    settleLegacyAction,
    usesLegacyAction,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { TextAiSelectionUnavailableError } from '../../../../text-ai/application/text-ai-admission-participant';
import {
    findTextAiModel,
    textAiExecutionLimits,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import { DrizzleTextAiAdmissionParticipant } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { DictionaryGenerationNotAvailableError } from '../../../application/dictionary-errors';
import type {
    DictionaryDocumentPersistenceContext,
    DocumentJobRow,
    Transaction,
} from './dictionary-document-context';

export async function activeProviderExecution(
    context: DictionaryDocumentPersistenceContext,
    tx: Transaction,
    ownerId: string,
    format: string,
    now: Date,
) {
    try {
        const execution = await new DrizzleTextAiAdmissionParticipant(
            tx,
        ).resolve({
            userId: ownerId,
            format,
            now,
            legacyBudget: context.providerBudget,
        });

        if (context.aiCreditEnforcementEnabled && !execution.snapshot)
            throw new DictionaryGenerationNotAvailableError();
        if (context.aiCreditEnforcementEnabled && execution.snapshot) {
            const model = findTextAiModel(
                execution.snapshot.providerId,
                execution.snapshot.modelId,
            );

            if (!model) throw new DictionaryGenerationNotAvailableError();
            execution.snapshot = {
                ...execution.snapshot,
                ...textAiExecutionLimits(model, [format]),
                supportedFormats: [format],
            };

            execution.snapshot = await prepareLegacyAction(
                tx,
                ownerId,
                'dictionary-generation',
                execution.snapshot,
                now,
            );

            execution.budget = execution.snapshot.aggregateBudget;
            execution.selectionVersion = 1;
        }

        return execution;
    } catch (error) {
        if (
            error instanceof TextAiSelectionUnavailableError ||
            error instanceof OperatorBudgetUnavailableError ||
            error instanceof ProviderCostAdmissionUnavailableError
        )
            throw new DictionaryGenerationNotAvailableError();

        throw error;
    }
}

export async function settleAiCreditAttempt(
    tx: Transaction,
    job: DocumentJobRow,
    at: Date,
    providerUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    },
    outcome: 'success' | 'failure' = 'failure',
    terminal = true,
) {
    if (usesLegacyAction(job.selectedExecutionSnapshot)) {
        await recordLegacyAttempt(tx, {
            id: job.id,
            ownerId: job.ownerId,
            attempt: job.attemptCount,
            snapshot: job.selectedExecutionSnapshot,
            successful: outcome === 'success',
            dispatched: job.aiCreditProviderDispatchedAt !== null,
            ...(providerUsage ? { usage: providerUsage } : {}),
            at,
        });

        if (terminal)
            await settleLegacyAction(tx, {
                id: job.id,
                ownerId: job.ownerId,
                outcome,
                at,
            });

        return;
    }

    if (!job.aiCreditAccounted || !job.aiCreditReservationId) return;
    if (!job.aiCreditPolicyMode)
        throw new Error('AI credit reservation is missing');
    const participant = new DrizzleAiCreditTransactionParticipant(tx);
    if (!job.aiCreditProviderDispatchedAt) {
        await participant.releaseUndispatchedAttempt({
            ownerId: job.ownerId,
            releasedAt: at,
            reservationId: job.aiCreditReservationId,
        });

        return;
    }

    if (outcome !== 'success' || !providerUsage) {
        await participant.settleFailedAttempt({
            ownerId: job.ownerId,
            reservationId: job.aiCreditReservationId,
            settledAt: at,
        });

        return;
    }

    await participant.settleAttempt({
        measuredCredits: providerUsage
            ? documentCreditUsage(job, providerUsage)
            : null,
        measurement: resolveAiCreditMeasurement(
            job.aiCreditPolicyMode,
            providerUsage !== undefined,
        ),
        ownerId: job.ownerId,
        reservationId: job.aiCreditReservationId,
        settledAt: at,
    });
}

export async function enableAiCreditSettlement(tx: Transaction): Promise<void> {
    await tx.execute(
        sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
    );
}

export function documentCreditUsage(
    job: DocumentJobRow,
    usage: { inputTokens: number; outputTokens: number },
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
