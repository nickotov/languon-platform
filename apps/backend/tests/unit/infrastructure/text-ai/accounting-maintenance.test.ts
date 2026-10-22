import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAccountingMaintenance } from '../../../../src/infrastructure/text-ai/accounting-maintenance';

describe('accounting maintenance scheduling', () => {
    afterEach(() => vi.useRealTimers());

    it('does not overlap slow maintenance and waits for it before shutdown', async () => {
        vi.useFakeTimers();
        let finish: () => void = () => undefined;
        const maintain = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        const onError = vi.fn();
        const worker = startAccountingMaintenance({
            maintain,
            onError,
            intervalMs: 1000,
        });
        await vi.advanceTimersByTimeAsync(20000);
        expect(maintain).toHaveBeenCalledOnce();
        let stopped = false;
        const completion = worker.stop().then(() => {
            stopped = true;
        });
        expect(stopped).toBe(false);
        finish();
        await completion;
        await vi.advanceTimersByTimeAsync(20000);
        expect(maintain).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();
    });

    it('reports failures and schedules a later bounded retry', async () => {
        vi.useFakeTimers();
        const maintain = vi
            .fn()
            .mockRejectedValueOnce(new Error('Unavailable'))
            .mockResolvedValue(undefined);
        const onError = vi.fn();
        const worker = startAccountingMaintenance({
            maintain,
            onError,
            intervalMs: 1000,
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect(onError).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1000);
        expect(maintain).toHaveBeenCalledTimes(2);
        await worker.stop();
        await vi.advanceTimersByTimeAsync(10000);
        expect(maintain).toHaveBeenCalledTimes(2);
    });
});
