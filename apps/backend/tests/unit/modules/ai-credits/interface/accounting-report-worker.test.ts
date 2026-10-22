import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAccountingReportWorker } from '../../../../../src/modules/ai-credits/infrastructure/accounting-report-worker';

describe('bounded accounting report worker', () => {
    afterEach(() => vi.useRealTimers());
    it('never overlaps report refreshes and waits for in-flight work on stop', async () => {
        vi.useFakeTimers();
        let resolve: (value: boolean) => void = () => undefined;
        const refreshNextReport = vi.fn().mockImplementation(
            () =>
                new Promise<boolean>((done) => {
                    resolve = done;
                }),
        );
        const onError = vi.fn();
        const worker = startAccountingReportWorker({
            refreshNextReport,
            onError,
            intervalMs: 1000,
        });
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(20000);
        expect(refreshNextReport).toHaveBeenCalledOnce();
        let stopped = false;
        const completion = worker.stop().then(() => {
            stopped = true;
        });
        expect(stopped).toBe(false);
        resolve(true);
        await completion;
        await vi.advanceTimersByTimeAsync(20000);
        expect(refreshNextReport).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();
    });
    it('stops scheduling on abort and reports bounded task failures', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const refreshNextReport = vi
            .fn()
            .mockRejectedValue(new Error('Unavailable'));
        const onError = vi.fn();
        const worker = startAccountingReportWorker({
            refreshNextReport,
            onError,
            intervalMs: 1000,
            signal: controller.signal,
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect(onError).toHaveBeenCalledOnce();
        controller.abort();
        await vi.advanceTimersByTimeAsync(10000);
        await worker.stop();
        expect(refreshNextReport).toHaveBeenCalledOnce();
    });
});
