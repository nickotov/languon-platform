import type { TextAiExecutionSnapshot } from './text-ai-provider-catalog';

/** Feature rows keep their original admission. Only a previously authorized
 * alternative can be projected for the second conclusive execution attempt. */
export function effectiveTextAiExecutionForAttempt<
    T extends TextAiExecutionSnapshot,
>(snapshot: T, attempt: number): T {
    if (attempt <= 1 || !snapshot.routingAuthority) return snapshot;
    if (attempt !== 2)
        throw new Error('Automatic routing attempt allowance exhausted.');
    const candidate = snapshot.routingAuthority.candidates[1];
    if (!candidate) return snapshot;
    if (
        candidate.snapshot.perCallMaxInputTokens <
            snapshot.perCallMaxInputTokens ||
        candidate.snapshot.perCallMaxOutputTokens <
            snapshot.perCallMaxOutputTokens
    )
        throw new Error(
            'Fallback cannot reduce the confirmed execution allowance.',
        );
    return {
        ...snapshot,
        ...candidate.snapshot,
        // Aggregate ceilings belong to the action, never each candidate.
        aggregateBudget: {
            ...snapshot.aggregateBudget,
            inputCostMicrosPerMillionTokens:
                candidate.snapshot.aggregateBudget
                    .inputCostMicrosPerMillionTokens,
            outputCostMicrosPerMillionTokens:
                candidate.snapshot.aggregateBudget
                    .outputCostMicrosPerMillionTokens,
        },
        routingAuthority: snapshot.routingAuthority,
        ...('actionProviderPrice' in snapshot
            ? { actionProviderPrice: candidate.providerPrice }
            : {}),
    };
}

/** Infrastructure may attach this evidence only after classifying a bounded SDK
 * response. Unknown exceptions, aborts and transport disconnects are ambiguous. */
export function hasConclusiveTextAiFailure(error: unknown): boolean {
    try {
        if (
            !error ||
            typeof error !== 'object' ||
            !('executionOutcome' in error)
        )
            return false;
        return (
            error.executionOutcome === 'rejected' ||
            error.executionOutcome === 'completed'
        );
    } catch {
        return false;
    }
}
