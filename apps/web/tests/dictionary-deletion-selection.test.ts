import { dictionaryDeletionSelectedTargetLimit } from '@languon/contracts';
import { describe, expect, it } from 'vitest';

import {
    toggleDeletionTarget,
    toggleLoadedDeletionTargets,
} from '@/fsd/entities/dictionary';

describe('dictionary deletion selection', () => {
    it('caps additions at the shared contract limit while allowing removal', () => {
        const selected = new Set(
            Array.from(
                { length: dictionaryDeletionSelectedTargetLimit },
                (_, index) => `target-${index}`,
            ),
        );

        const rejected = toggleDeletionTarget(selected, 'target-over-limit');
        expect(rejected.limitReached).toBe(true);
        expect(rejected.selected.size).toBe(
            dictionaryDeletionSelectedTargetLimit,
        );
        expect(rejected.selected.has('target-over-limit')).toBe(false);

        const removed = toggleDeletionTarget(rejected.selected, 'target-0');
        expect(removed.limitReached).toBe(false);
        expect(removed.selected.size).toBe(
            dictionaryDeletionSelectedTargetLimit - 1,
        );
    });

    it('selects loaded targets only up to the shared limit', () => {
        const update = toggleLoadedDeletionTargets(
            new Set(),
            Array.from(
                { length: dictionaryDeletionSelectedTargetLimit + 1 },
                (_, index) => `target-${index}`,
            ),
        );

        expect(update.limitReached).toBe(true);
        expect(update.selected.size).toBe(
            dictionaryDeletionSelectedTargetLimit,
        );
    });
});
