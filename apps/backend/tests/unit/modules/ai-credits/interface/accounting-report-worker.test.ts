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

    it('keeps eight active ranges fresh as they become eligible again', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const snapshots: Array<number | null> = Array(8).fill(null);
        const refreshNextReport = vi.fn(async () => {
            const eligible = snapshots.findIndex(
                (time) => time === null || Date.now() - time > 30000,
            );

            if (eligible < 0) {
                return false;
            }

            snapshots[eligible] = Date.now();

            return true;
        });
        const worker = startAccountingReportWorker({
            refreshNextReport,
            onError: vi.fn(),
        });

        for (let tick = 1; tick <= 8; tick++) {
            await vi.advanceTimersByTimeAsync(15000);
            expect(
                snapshots.every(
                    (time) => time !== null && Date.now() - time <= 60000,
                ),
            ).toBe(true);
        }

        // Three batches of eight and one empty-queue check per tick.
        expect(refreshNextReport).toHaveBeenCalledTimes(32);
        await worker.stop();
    });

    it('yields after the claim limit even while work is always available', async () => {
        vi.useFakeTimers();
        const refreshNextReport = vi.fn(async () => true);
        const worker = startAccountingReportWorker({
            refreshNextReport,
            onError: vi.fn(),
        });

        await vi.advanceTimersByTimeAsync(15000);
        expect(refreshNextReport).toHaveBeenCalledTimes(32);
        await vi.advanceTimersByTimeAsync(14999);
        expect(refreshNextReport).toHaveBeenCalledTimes(32);
        await worker.stop();
    });

    it('starts no additional claim after a slow refresh exhausts the time budget', async () => {
        vi.useFakeTimers();
        const refreshNextReport = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    setTimeout(() => resolve(true), 1200);
                }),
        );
        const worker = startAccountingReportWorker({
            refreshNextReport,
            onError: vi.fn(),
        });

        await vi.advanceTimersByTimeAsync(16200);
        expect(refreshNextReport).toHaveBeenCalledOnce();
        await worker.stop();
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
