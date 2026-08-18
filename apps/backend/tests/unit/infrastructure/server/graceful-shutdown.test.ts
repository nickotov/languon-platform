import { describe, expect, it, vi } from 'vitest';

import { createGracefulShutdown } from '../../../../src/infrastructure/server/graceful-shutdown';

describe('graceful shutdown', () => {
    it('stops accepting work and closes resources once after requests drain', async () => {
        let closeCallback: ((error?: Error) => void) | undefined;
        const closeResources = vi.fn(async () => undefined);
        const shutdown = createGracefulShutdown({
            closeResources,
            server: {
                close: (callback) => {
                    closeCallback = callback;
                },
            },
            timeoutMs: 1_000,
        });

        shutdown('SIGTERM');
        shutdown('SIGINT');
        expect(closeCallback).toBeTypeOf('function');
        closeCallback?.();
        await vi.waitFor(() => expect(closeResources).toHaveBeenCalledOnce());
    });

    it('bounds draining, closes remaining connections, and reports the deadline', async () => {
        vi.useFakeTimers();
        const closeAllConnections = vi.fn();
        const closeResources = vi.fn(async () => undefined);
        const onDeadline = vi.fn();
        const shutdown = createGracefulShutdown({
            closeResources,
            onDeadline,
            server: { close: vi.fn(), closeAllConnections },
            timeoutMs: 1_000,
        });

        shutdown('SIGTERM');
        await vi.advanceTimersByTimeAsync(1_000);
        await Promise.resolve();

        expect(closeAllConnections).toHaveBeenCalledOnce();
        expect(closeResources).toHaveBeenCalledOnce();
        expect(onDeadline).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });
});
