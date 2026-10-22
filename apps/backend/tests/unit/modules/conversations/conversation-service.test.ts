import { describe, expect, it, vi } from 'vitest';
import type {
    ConcurrentRequestLimiter,
    RateLimiter,
} from '../../../../src/modules/authentication/application/ports/rate-limiter';
import { ConversationService } from '../../../../src/modules/conversations/application/conversation-service';

function fixture() {
    const ownerRelease = vi.fn(async () => {});
    const globalRelease = vi.fn(async () => {});
    const consume = vi.fn(async () => ({
        allowed: true,
        limit: 30,
        remaining: 29,
        retryAfterSeconds: 0,
    }));
    const acquireLease = vi
        .fn<ConcurrentRequestLimiter['acquireLease']>()
        .mockResolvedValueOnce({ release: ownerRelease })
        .mockResolvedValueOnce({ release: globalRelease });
    const service = new ConversationService(
        {} as never,
        async () => ({ userId: 'user-1' }),
        { consume } as unknown as RateLimiter,
        { acquireLease } as ConcurrentRequestLimiter,
    );
    return { service, consume, acquireLease, ownerRelease, globalRelease };
}

describe('conversation submission admission', () => {
    it('combines per-learner and global leases and releases both once', async () => {
        const { service, consume, acquireLease, ownerRelease, globalRelease } =
            fixture();
        const lease = await service.admitSubmission(
            { ownerId: 'user-1' },
            new AbortController().signal,
        );
        expect(consume).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: 'contextual-assistant-turn-submission',
                subject: 'user-1',
                limit: 30,
            }),
        );
        expect(acquireLease).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                scope: 'contextual-assistant-turn-submissions',
                subject: 'user-1',
                limit: 1,
                ttlMs: 300_000,
            }),
        );
        expect(acquireLease).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                scope: 'contextual-assistant-turn-submission-global',
                subject: 'all',
                limit: 10,
            }),
        );
        await Promise.all([lease.release(), lease.release()]);
        expect(ownerRelease).toHaveBeenCalledTimes(1);
        expect(globalRelease).toHaveBeenCalledTimes(1);
    });

    it('releases the learner lease when global capacity is exhausted', async () => {
        const { service, acquireLease, ownerRelease } = fixture();
        acquireLease.mockReset();
        acquireLease
            .mockResolvedValueOnce({ release: ownerRelease })
            .mockResolvedValueOnce(null);
        await expect(
            service.admitSubmission(
                { ownerId: 'user-1' },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: 'capacity_unavailable' });
        expect(ownerRelease).toHaveBeenCalledOnce();
    });

    it('fails closed when the submission rate limit is exhausted', async () => {
        const { service, consume, acquireLease } = fixture();
        consume.mockResolvedValue({
            allowed: false,
            limit: 30,
            remaining: 0,
            retryAfterSeconds: 60,
        });
        await expect(
            service.admitSubmission(
                { ownerId: 'user-1' },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: 'rate_limited' });
        expect(acquireLease).not.toHaveBeenCalled();
    });
});
