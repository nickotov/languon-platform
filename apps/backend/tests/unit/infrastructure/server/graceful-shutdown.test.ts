import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGracefulShutdown } from '../../../../src/infrastructure/server/graceful-shutdown';

afterEach(() => vi.useRealTimers());

describe('graceful shutdown', () => {
    it('stops workers immediately and waits for both workers and HTTP before releasing clients once', async () => {
        vi.useFakeTimers();
        const stopWorker = vi.fn(
            () => new Promise<void>((done) => setTimeout(done, 200)),
        );
        const closeClient = vi.fn();
        const onDeadline = vi.fn();
        const shutdown = createGracefulShutdown({
            stopWorkers: [stopWorker],
            closeResources: [closeClient],
            server: { close: (done) => setTimeout(done, 50) },
            timeoutMs: 1000,
            onDeadline,
            onError: vi.fn(),
        });

        shutdown('SIGTERM');
        shutdown('SIGINT');
        expect(stopWorker).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(100);
        expect(closeClient).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(closeClient).toHaveBeenCalledOnce();
        expect(onDeadline).not.toHaveBeenCalled();
    });

    it.each(['HTTP drain', 'client cleanup'])(
        'enforces the original deadline during %s',
        async (phase) => {
            vi.useFakeTimers();
            const closeAllConnections = vi.fn();
            const onDeadline = vi.fn();
            const shutdown = createGracefulShutdown({
                stopWorkers: [],
                closeResources: [
                    () => new Promise<void>((done) => setTimeout(done, 2000)),
                ],
                onDeadline,
                onError: vi.fn(),
                server: {
                    close: (done) => {
                        if (phase === 'client cleanup') {
                            setTimeout(done, 750);
                        }
                    },
                    closeAllConnections,
                },
                timeoutMs: 1000,
            });

            shutdown('SIGTERM');
            await vi.advanceTimersByTimeAsync(999);
            expect(onDeadline).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(closeAllConnections).toHaveBeenCalledOnce();
            expect(onDeadline).toHaveBeenCalledOnce();
        },
    );

    it('attempts every independent close after worker and client failures', async () => {
        vi.useFakeTimers();
        const onError = vi.fn();
        const closeClient = vi.fn();
        const onDeadline = vi.fn();
        const shutdown = createGracefulShutdown({
            stopWorkers: [
                async () => {
                    throw new Error('worker');
                },
            ],
            closeResources: [
                () => {
                    throw new Error('client');
                },
                closeClient,
            ],
            onDeadline,
            onError,
            server: { close: (done) => done() },
            timeoutMs: 1000,
        });

        shutdown('SIGINT');
        await vi.advanceTimersByTimeAsync(1);
        expect(closeClient).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(999);
        expect(onDeadline).toHaveBeenCalledOnce();
    });

    it('keeps draining on repeated SIGTERM and exits by the deadline with a stalled client', () => {
        const module = new URL(
            '../../../../src/infrastructure/server/graceful-shutdown.ts',
            import.meta.url,
        );
        const child = spawnSync(
            process.execPath,
            [
                '--input-type=module',
                '--eval',
                `
            import { createGracefulShutdown, listenForShutdownSignals } from ${JSON.stringify(module.href)};
            setInterval(() => {}, 1000);
            listenForShutdownSignals(createGracefulShutdown({
                server: { close: done => done() },
                stopWorkers: [],
                closeResources: [() => {
                    process.kill(process.pid, 'SIGTERM');
                    return new Promise(() => {});
                }],
                onError: () => {},
                timeoutMs: 40,
            }));
            process.kill(process.pid, 'SIGTERM');
        `,
            ],
            { encoding: 'utf8', timeout: 3000 },
        );

        expect(child.error).toBeUndefined();
        expect(child.status).toBe(1);
        expect(child.stderr).toContain('Graceful shutdown exceeded 40ms');
    });
});
