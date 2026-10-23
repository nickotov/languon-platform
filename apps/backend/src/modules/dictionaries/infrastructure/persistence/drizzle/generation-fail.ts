import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { sql } from 'drizzle-orm';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { dictionaryGenerationProviderUsageCostMicros } from '../../../application/ports/dictionary-generation-provider-policy';
import { dictionaryGenerationJobsTable } from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import { workerCas } from './generation-job-access';
import {
    terminalizeCancelled,
    scheduleDocumentCleanup,
} from './generation-cancellation';
import { persistedProviderBudget } from './generation-admission';
import { settleCurrentAiCreditAttempt } from './generation-accounting';
import { recordProviderFailure } from './generation-provider-circuit';

export async function fail(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['fail']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        await tx.execute(
            sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
        );

        abort(input.context);
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(workerCas(input))
            .for('update');

        if (!job) return false;
        if (job.cancellationRequestedAt) {
            await terminalizeCancelled(tx, job, input.context.now);

            return true;
        }

        const retry =
            input.retryAt &&
            job.attemptCount < job.maxAttempts &&
            (!usesLegacyAction(job.selectedExecutionSnapshot) ||
                !job.aiCreditProviderDispatchedAt ||
                input.failureCategory === 'provider_rate_limited');
        const jobProviderBudget = persistedProviderBudget(job);
        if (
            input.providerUsage &&
            (!Number.isSafeInteger(input.providerUsage.inputTokens) ||
                input.providerUsage.inputTokens < 0 ||
                !Number.isSafeInteger(input.providerUsage.outputTokens) ||
                input.providerUsage.outputTokens < 0 ||
                input.providerUsage.inputTokens >
                    jobProviderBudget.maxInputTokensPerAttempt ||
                input.providerUsage.outputTokens >
                    jobProviderBudget.maxOutputTokensPerAttempt)
        )
            throw new Error('Invalid provider usage');
        const priorAttemptCount = Math.max(0, job.attemptCount - 1);
        const settledCostMicros = input.providerUsage
            ? priorAttemptCount * jobProviderBudget.maxCostMicrosPerAttempt +
              dictionaryGenerationProviderUsageCostMicros(
                  jobProviderBudget,
                  input.providerUsage,
              )
            : job.providerReservedCostMicros;
        const settledInputTokens = input.providerUsage
            ? priorAttemptCount * jobProviderBudget.maxInputTokensPerAttempt +
              input.providerUsage.inputTokens
            : job.providerReservedInputTokens;
        const settledOutputTokens = input.providerUsage
            ? priorAttemptCount * jobProviderBudget.maxOutputTokensPerAttempt +
              input.providerUsage.outputTokens
            : job.providerReservedOutputTokens;

        if (
            settledCostMicros > job.providerReservedCostMicros ||
            settledInputTokens > job.providerReservedInputTokens ||
            settledOutputTokens > job.providerReservedOutputTokens
        )
            throw new Error('Provider usage exceeds reservation');
        await settleCurrentAiCreditAttempt(tx, job, {
            at: input.context.now,
            terminal: !retry,
            ...(input.providerUsage
                ? { providerUsage: input.providerUsage }
                : {}),
        });

        const [updated] = await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditProviderDispatchedAt:
                    job.aiCreditAccounted ||
                    usesLegacyAction(job.selectedExecutionSnapshot)
                        ? null
                        : job.aiCreditProviderDispatchedAt,
                aiCreditReservationId: job.aiCreditAccounted
                    ? null
                    : job.aiCreditReservationId,
                completedAt: retry ? null : input.context.now,
                executionState: retry ? 'queued' : 'failed',
                failureCategory: retry ? null : input.failureCategory,
                heartbeatAt: null,
                inputPayload: retry ? job.inputPayload : null,
                leaseDeadline: null,
                nextAttemptAt: input.retryAt ?? input.context.now,
                progressPercent: retry ? 0 : job.progressPercent,
                progressStage: retry ? 'queued' : 'terminal',
                providerActualCostMicros: retry ? null : settledCostMicros,
                providerActualInputTokens: retry ? null : settledInputTokens,
                providerActualOutputTokens: retry ? null : settledOutputTokens,
                providerReservationSettledAt: retry ? null : input.context.now,
                providerReservationState: retry ? 'active' : 'settled',
                updatedAt: input.context.now,
                workerId: null,
            })
            .where(workerCas(input))
            .returning({ id: dictionaryGenerationJobsTable.id });

        if (
            updated &&
            input.countProviderFailure !== false &&
            [
                'provider_rate_limited',
                'provider_timeout',
                'provider_unavailable',
            ].includes(input.failureCategory)
        )
            await recordProviderFailure(tx, job, input.context.now);
        if (updated && !retry && job.kind === 'document-terms')
            await scheduleDocumentCleanup(
                tx,
                job.id,
                input.context.now,
                'failed',
            );

        return Boolean(updated);
    });
}
