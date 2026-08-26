import { dictionaryLimits } from './limits';

export const dictionaryCardSortGap = 1_024n;

export class DictionaryCardCapacityError extends Error {
    public constructor() {
        super(
            `A dictionary cannot contain more than ${dictionaryLimits.cardCapacity} active cards.`,
        );
        this.name = 'DictionaryCardCapacityError';
    }
}

export function assertDictionaryCardCapacity(cardCount: number): void {
    if (!Number.isSafeInteger(cardCount) || cardCount < 0) {
        throw new RangeError(
            'A dictionary card count must be a non-negative integer.',
        );
    }
    if (cardCount > dictionaryLimits.cardCapacity) {
        throw new DictionaryCardCapacityError();
    }
}

export function initialDictionaryCardSortKey(index: number): bigint {
    if (!Number.isSafeInteger(index) || index < 0) {
        throw new RangeError(
            'A dictionary card index must be a non-negative integer.',
        );
    }

    return BigInt(index + 1) * dictionaryCardSortGap;
}

export function sortKeyBetween(
    previous: bigint | null,
    next: bigint | null,
): bigint | null {
    if (previous !== null && previous < 1n) {
        throw new RangeError('Dictionary card sort keys must be positive.');
    }
    if (next !== null && next < 1n) {
        throw new RangeError('Dictionary card sort keys must be positive.');
    }
    if (previous !== null && next !== null && previous >= next) {
        throw new RangeError(
            'Dictionary card sort-key bounds must be ordered.',
        );
    }

    if (previous === null && next === null) {
        return dictionaryCardSortGap;
    }
    if (next === null) {
        return previous! + dictionaryCardSortGap;
    }
    if (previous === null) {
        return next > 1n ? next / 2n : null;
    }

    return next - previous > 1n ? previous + (next - previous) / 2n : null;
}

export function rebalanceDictionaryCardSortKeys<T>(
    orderedCards: readonly T[],
): Array<{ card: T; sortKey: bigint }> {
    assertDictionaryCardCapacity(orderedCards.length);

    return orderedCards.map((card, index) => ({
        card,
        sortKey: initialDictionaryCardSortKey(index),
    }));
}
