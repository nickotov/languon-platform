import { SENTENCE_LIMITS } from '@languon/contracts';
import type { SentenceCandidate } from './sentence-types';
export function selectSentenceCandidates(
    entries: readonly SentenceCandidate[],
    limit: number = SENTENCE_LIMITS.candidateEntries,
): readonly SentenceCandidate[] {
    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > SENTENCE_LIMITS.candidateEntries
    )
        throw new RangeError('Invalid candidate limit');
    if (
        entries.some(
            (entry) =>
                !Number.isSafeInteger(entry.exposureCount) ||
                entry.exposureCount < 0,
        ) ||
        new Set(entries.map((entry) => entry.entryId)).size !== entries.length
    )
        throw new RangeError('Invalid candidate entries');
    return [...entries]
        .sort(
            (a, b) =>
                a.exposureCount - b.exposureCount ||
                (a.sortKey < b.sortKey
                    ? -1
                    : a.sortKey > b.sortKey
                      ? 1
                      : a.entryId.localeCompare(b.entryId)),
        )
        .slice(0, limit);
}
