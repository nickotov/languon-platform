import type { TextAiExecutionSnapshot } from '../../application/text-ai-provider-catalog';
import { effectiveTextAiExecutionForAttempt } from '../../application/text-ai-routing-execution';
import {
    ProviderExecutionError,
    isCompletedInvalidProviderResult,
} from './provider-execution-outcome';

/** A fresh runner is required: model, accounting and dispatch receipt must agree.
 * Database admission still enforces remaining execution and provider-cost limits.
 * Completed invalid results require a trusted local-validation mark issued only
 * after the first attempt was durably settled unsuccessful, retaining expense. */
export async function runPinnedFallback<T>(input: {
    snapshot: TextAiExecutionSnapshot;
    signal: AbortSignal;
    hasPublished(): boolean;
    execute(snapshot: TextAiExecutionSnapshot, attempt: 1 | 2): Promise<T>;
}): Promise<T> {
    input.signal.throwIfAborted();
    try {
        return await input.execute(input.snapshot, 1);
    } catch (error) {
        if (
            input.signal.aborted ||
            input.hasPublished() ||
            !(
                (error instanceof ProviderExecutionError &&
                    error.executionOutcome === 'rejected') ||
                isCompletedInvalidProviderResult(error)
            ) ||
            !input.snapshot.routingAuthority?.candidates[1]
        )
            throw error;

        input.signal.throwIfAborted();
        const alternative = effectiveTextAiExecutionForAttempt(
            input.snapshot,
            2,
        );
        return input.execute(alternative, 2);
    }
}
