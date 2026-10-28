import {
    dictionaryGenerationProviderUsageCostMicros,
    type DictionaryGenerationProviderBudgetPolicy,
} from '../../../application/ports/dictionary-generation-provider-policy';
import type { JobRow } from './generation-context';

/** Legacy operational projection; native expense lives in authoritative action receipts. */
export function generationCompletionUsage(
    job: Pick<
        JobRow,
        | 'attemptCount'
        | 'providerReservedCostMicros'
        | 'providerReservedInputTokens'
        | 'providerReservedOutputTokens'
    >,
    budget: DictionaryGenerationProviderBudgetPolicy,
    usage: { inputTokens: number; outputTokens: number } | undefined,
    nativeDispatch: boolean,
) {
    if (
        usage &&
        (!Number.isSafeInteger(usage.inputTokens) ||
            usage.inputTokens < 0 ||
            !Number.isSafeInteger(usage.outputTokens) ||
            usage.outputTokens < 0 ||
            usage.inputTokens > budget.maxInputTokensPerAttempt ||
            usage.outputTokens > budget.maxOutputTokensPerAttempt)
    )
        throw new Error('Invalid provider usage');
    const priorAttemptCount = Math.max(0, job.attemptCount - 1);
    const costMicros = nativeDispatch
        ? null
        : priorAttemptCount * budget.maxCostMicrosPerAttempt +
          (usage
              ? dictionaryGenerationProviderUsageCostMicros(budget, usage)
              : budget.maxCostMicrosPerAttempt);
    const inputTokens = usage
        ? priorAttemptCount * budget.maxInputTokensPerAttempt +
          usage.inputTokens
        : job.providerReservedInputTokens;
    const outputTokens = usage
        ? priorAttemptCount * budget.maxOutputTokensPerAttempt +
          usage.outputTokens
        : job.providerReservedOutputTokens;

    if (
        (costMicros !== null && costMicros > job.providerReservedCostMicros) ||
        inputTokens > job.providerReservedInputTokens ||
        outputTokens > job.providerReservedOutputTokens
    )
        throw new Error('Provider usage exceeds reservation');

    return { costMicros, inputTokens, outputTokens };
}
