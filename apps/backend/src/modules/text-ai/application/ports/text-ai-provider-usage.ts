import type {
    ProviderExecutionFacts,
    ProviderNativeCallObservation,
    ProviderNativeUsage,
} from '@languon/contracts';

/** Reported transport observations, carried unchanged to the fenced financial seam. */
export interface TextAiProviderUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    nativeUsage?: ProviderNativeUsage;
    executionFacts?: ProviderExecutionFacts;
    calls?: ProviderNativeCallObservation[];
}

/** Preserve call boundaries: component minima and schedules cannot price an aggregate call. */
export function sumTextAiProviderUsage(
    previous: TextAiProviderUsage | undefined,
    next: TextAiProviderUsage,
): TextAiProviderUsage {
    if (!previous) return next;
    const calls = [...(previous.calls ?? []), ...(next.calls ?? [])];
    if (calls.length > 5)
        throw new Error(
            'Provider call observations exceed the admitted batch.',
        );
    return {
        inputTokens: previous.inputTokens + next.inputTokens,
        outputTokens: previous.outputTokens + next.outputTokens,
        ...(previous.cacheReadTokens === undefined ||
        next.cacheReadTokens === undefined
            ? {}
            : {
                  cacheReadTokens:
                      previous.cacheReadTokens + next.cacheReadTokens,
              }),
        ...(previous.cacheWriteTokens === undefined ||
        next.cacheWriteTokens === undefined
            ? {}
            : {
                  cacheWriteTokens:
                      previous.cacheWriteTokens + next.cacheWriteTokens,
              }),
        ...(calls.length ? { calls } : {}),
    };
}
