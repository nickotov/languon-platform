import { dictionaryBatchGenerationLimits } from '../../../domain/batch-generation';

/** A hard provider preflight allowance, including the existing 16 KiB framing reserve per chunk. */
export function dictionaryActionInputOverhead(payload: unknown): number {
    const rows =
        payload &&
        typeof payload === 'object' &&
        'rows' in payload &&
        Array.isArray(payload.rows)
            ? payload.rows.length
            : 0;
    return (
        Math.max(
            1,
            Math.ceil(rows / dictionaryBatchGenerationLimits.chunkRows),
        ) * 32768
    );
}
