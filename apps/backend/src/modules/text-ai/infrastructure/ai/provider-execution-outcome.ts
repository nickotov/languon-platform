import { sentenceProviderFailure } from '../../../learning/infrastructure/ai/sentence-provider-failure';

export type ProviderExecutionOutcome = 'rejected' | 'completed' | 'ambiguous';

/** Transport errors permit routing only on conclusive rejection. HTTP 403 can be a policy
 * refusal, and 5xx/disconnect/timeout do not prove upstream work never started. */
export function providerExecutionOutcome(
    error: unknown,
    providerId: string,
): ProviderExecutionOutcome {
    const failure = sentenceProviderFailure(error, providerId);
    const code = failure.providerCode ?? failure.httpStatus;
    return code !== undefined && [401, 402, 404, 410, 429].includes(code)
        ? 'rejected'
        : 'ambiguous';
}

export function withProviderExecutionOutcome<T extends Error>(
    failure: T,
    source: unknown,
    providerId: string,
): T & { executionOutcome: ProviderExecutionOutcome } {
    return Object.assign(failure, {
        executionOutcome: providerExecutionOutcome(source, providerId),
    });
}

/** Preserve SDK cause internally for bounded safe classifiers, never raw logging. */
export class ProviderExecutionError extends Error {
    readonly executionOutcome: ProviderExecutionOutcome;
    constructor(source: unknown, providerId: string) {
        super('Provider execution failed.', { cause: source });
        this.name = 'ProviderExecutionError';
        this.executionOutcome = providerExecutionOutcome(source, providerId);
    }
}

// A provider-controlled error property cannot authorize a completed-result retry.
// Only local validation after durable unsuccessful settlement registers this mark.
const completedInvalidResults = new WeakSet<Error>();
export function markCompletedInvalidProviderResult<T extends Error>(
    error: T,
): T {
    completedInvalidResults.add(error);
    return error;
}
export function isCompletedInvalidProviderResult(error: unknown): boolean {
    return error instanceof Error && completedInvalidResults.has(error);
}
