import { describe, expect, it, vi } from 'vitest';

import { retainIdempotencyAttempt } from '@/fsd/features/dictionary-library/lib/idempotency-attempt';

describe('dictionary idempotency attempts', () => {
    it('retains a key for the same payload retry and rotates it for a new payload', () => {
        const createKey = vi
            .fn()
            .mockReturnValueOnce('key-one')
            .mockReturnValueOnce('key-two');
        const first = retainIdempotencyAttempt(null, 'payload-a', createKey);
        const retry = retainIdempotencyAttempt(first, 'payload-a', createKey);
        const changed = retainIdempotencyAttempt(retry, 'payload-b', createKey);

        expect(retry).toBe(first);
        expect(changed.key).toBe('key-two');
        expect(createKey).toHaveBeenCalledTimes(2);
    });
});
