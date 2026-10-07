import type { SentenceEntry } from './sentence-types';
/** First practice round stays stable; remaining words form independent bounded rounds. */
export function partitionSentencePreparation<T extends SentenceEntry>(
    entries: readonly T[],
    initialIds: readonly string[],
    limit = 100,
): T[][] {
    const initial = new Set(initialIds);
    const first = entries.filter((entry) => initial.has(entry.entryId));
    if (first.length > limit)
        throw new Error('Initial preparation round exceeds the practice limit');
    const remaining = entries.filter((entry) => !initial.has(entry.entryId));
    const partitions: T[][] = first.length ? [first] : [];
    for (let offset = 0; offset < remaining.length; offset += limit)
        partitions.push(remaining.slice(offset, offset + limit));
    return partitions;
}
