import { z } from 'zod';

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const optionalCount = count.nullish();
const usageSchema = z.object({
    inputTokens: z.union([
        count,
        z.object({
            total: count,
            cacheRead: optionalCount,
            cacheWrite: optionalCount,
        }),
    ]),
    outputTokens: z.union([count, z.object({ total: count })]),
    cachedInputTokens: optionalCount,
    cacheReadTokens: optionalCount,
    cacheWriteTokens: optionalCount,
    inputTokenDetails: z
        .object({
            cacheReadTokens: optionalCount,
            cacheWriteTokens: optionalCount,
        })
        .nullish(),
});
export interface ProviderTokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
function consistent(
    values: Array<number | null | undefined>,
): number | undefined {
    const known = values.filter(
        (value): value is number => value !== undefined && value !== null,
    );
    if (new Set(known).size > 1)
        throw new Error('Conflicting provider cache meters.');
    return known[0];
}
/** Normalize only reported SDK meters; absent cache categories remain absent. */
export function readProviderTokenUsage(
    value: unknown,
    limits: { maxInputTokens: number; maxOutputTokens: number },
): ProviderTokenUsage {
    const parsed = usageSchema.parse(value);
    const inputTokens =
        typeof parsed.inputTokens === 'number'
            ? parsed.inputTokens
            : parsed.inputTokens.total;
    const outputTokens =
        typeof parsed.outputTokens === 'number'
            ? parsed.outputTokens
            : parsed.outputTokens.total;
    const cacheReadTokens = consistent([
        parsed.cachedInputTokens,
        parsed.cacheReadTokens,
        parsed.inputTokenDetails?.cacheReadTokens,
        typeof parsed.inputTokens === 'number'
            ? undefined
            : parsed.inputTokens.cacheRead,
    ]);
    const cacheWriteTokens = consistent([
        parsed.cacheWriteTokens,
        parsed.inputTokenDetails?.cacheWriteTokens,
        typeof parsed.inputTokens === 'number'
            ? undefined
            : parsed.inputTokens.cacheWrite,
    ]);
    if (
        inputTokens > limits.maxInputTokens ||
        outputTokens > limits.maxOutputTokens ||
        (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) > inputTokens
    )
        throw new Error('Provider usage exceeds the admitted meter bounds.');
    return {
        inputTokens,
        outputTokens,
        ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
        ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    };
}
