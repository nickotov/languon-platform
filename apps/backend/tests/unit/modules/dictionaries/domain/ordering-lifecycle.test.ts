import { describe, expect, it } from 'vitest';

import {
    archiveCard,
    archiveDictionary,
    type InvalidDictionaryLifecycleError,
    makeDictionaryUnlisted,
    restoreCard,
    restoreDictionary,
    validateDictionaryAccessState,
} from '../../../../../src/modules/dictionaries/domain/lifecycle';
import {
    assertDictionaryCardCapacity,
    DictionaryCardCapacityError,
    dictionaryCardSortGap,
    rebalanceDictionaryCardSortKeys,
    sortKeyBetween,
} from '../../../../../src/modules/dictionaries/domain/ordering';

describe('dictionary card ordering', () => {
    it('allocates stable gap keys and detects when local insertion needs rebalance', () => {
        expect(sortKeyBetween(null, null)).toBe(dictionaryCardSortGap);
        expect(sortKeyBetween(1_024n, 2_048n)).toBe(1_536n);
        expect(sortKeyBetween(2_048n, null)).toBe(3_072n);
        expect(sortKeyBetween(null, 1n)).toBeNull();
        expect(sortKeyBetween(10n, 11n)).toBeNull();
    });

    it('rebalances deterministically and enforces the active-card capacity', () => {
        expect(rebalanceDictionaryCardSortKeys(['a', 'b', 'c'])).toEqual([
            { card: 'a', sortKey: 1_024n },
            { card: 'b', sortKey: 2_048n },
            { card: 'c', sortKey: 3_072n },
        ]);
        expect(() => assertDictionaryCardCapacity(10_000)).not.toThrow();
        expect(() => assertDictionaryCardCapacity(10_001)).toThrow(
            DictionaryCardCapacityError,
        );
    });
});

describe('dictionary lifecycle and visibility', () => {
    const activePrivate = {
        archivedAt: null,
        lifecycle: 'active' as const,
        share: null,
        visibility: 'private' as const,
    };
    const rotatedAt = new Date('2026-08-21T10:00:00.000Z');

    it('requires complete capability metadata for an active unlisted dictionary', () => {
        expect(
            makeDictionaryUnlisted(activePrivate, {
                keyDigest:
                    'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                keyVersion: 1,
                locator: 'locator',
                rotatedAt,
            }),
        ).toMatchObject({ lifecycle: 'active', visibility: 'unlisted' });

        expect(() =>
            validateDictionaryAccessState({
                ...activePrivate,
                visibility: 'unlisted',
            }),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryLifecycleError>>({
                reason: 'unlisted_share_required',
            }),
        );
    });

    it('archives by revoking sharing and restores as private', () => {
        const unlisted = makeDictionaryUnlisted(activePrivate, {
            keyDigest:
                'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            keyVersion: 1,
            locator: 'locator',
            rotatedAt,
        });
        const archivedAt = new Date('2026-08-21T11:00:00.000Z');
        const archived = archiveDictionary(unlisted, archivedAt);

        expect(archived).toEqual({
            archivedAt,
            lifecycle: 'archived',
            share: null,
            visibility: 'private',
        });
        expect(restoreDictionary(archived)).toEqual(activePrivate);
    });

    it('keeps card lifecycle timestamps symmetric and idempotent', () => {
        const archivedAt = new Date('2026-08-21T11:00:00.000Z');
        const active = { archivedAt: null, lifecycle: 'active' as const };
        const archived = archiveCard(active, archivedAt);

        expect(archiveCard(archived, new Date())).toBe(archived);
        expect(restoreCard(archived)).toEqual(active);
        expect(restoreCard(active)).toBe(active);
    });
});
