export interface GracefulShutdownOptions {
    closeResources: () => Promise<void>;
    onDeadline?: () => void;
    onError?: (error: unknown) => void;
    server: {
        close(callback?: (error?: Error) => void): unknown;
        closeAllConnections?: () => void;
    };
    timeoutMs: number;
}

export function createGracefulShutdown(
    options: GracefulShutdownOptions,
): (signal: string) => void {
    let shuttingDown = false;
    let resourcesClosed: Promise<void> | undefined;

    const closeResources = (): Promise<void> => {
        resourcesClosed ??= options.closeResources().catch((error: unknown) => {
            options.onError?.(error);
        });
        return resourcesClosed;
    };

    return (signal: string): void => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Received ${signal}; draining active requests.`);

        const deadline = setTimeout(() => {
            console.error(
                `Graceful shutdown exceeded ${options.timeoutMs}ms; closing remaining connections.`,
            );
            options.server.closeAllConnections?.();
            options.onDeadline?.();
            void closeResources();
        }, options.timeoutMs);

        options.server.close((error?: Error) => {
            clearTimeout(deadline);
            if (error !== undefined) {
                options.onError?.(error);
            }
            void closeResources();
        });
    };
}
