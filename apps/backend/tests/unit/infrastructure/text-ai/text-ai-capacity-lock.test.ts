import { describe, expect, it, vi } from 'vitest';
import { lockTextAiCapacity } from '../../../../src/infrastructure/text-ai/text-ai-capacity';

type Transaction = Parameters<typeof lockTextAiCapacity>[0];
describe('transaction-scoped capacity fence', () => {
    it('shares concurrent/repeated acquisition only inside the same transaction', async () => {
        const execute = vi.fn(async () => []);
        const tx = { execute } as unknown as Transaction;
        await Promise.all([lockTextAiCapacity(tx), lockTextAiCapacity(tx)]);
        await lockTextAiCapacity(tx);
        expect(execute).toHaveBeenCalledTimes(1);
        await lockTextAiCapacity({ execute } as unknown as Transaction);
        expect(execute).toHaveBeenCalledTimes(2);
    });
    it('does not retain a failed acquisition', async () => {
        const execute = vi
            .fn(async () => [])
            .mockRejectedValueOnce(new Error('Unavailable'));
        const tx = { execute } as unknown as Transaction;
        await expect(lockTextAiCapacity(tx)).rejects.toThrow('Unavailable');
        await lockTextAiCapacity(tx);
        expect(execute).toHaveBeenCalledTimes(2);
    });
});
