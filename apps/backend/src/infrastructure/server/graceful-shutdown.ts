type ShutdownStep = () => void | Promise<unknown>;

export interface GracefulShutdownOptions {
    stopWorkers: readonly ShutdownStep[];
    closeResources: readonly ShutdownStep[];
    onDeadline?: () => void;
    onError: (error: unknown) => void;
    server: {
        close(callback: (error?: Error) => void): unknown;
        closeAllConnections?: () => void;
    };
    timeoutMs: number;
}

export function createGracefulShutdown(
    options: GracefulShutdownOptions,
): (signal: string) => void {
    let shuttingDown = false;

    return (signal: string): void => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        console.log(`Received ${signal}; draining active requests.`);

        let failed = false;
        const reportFailure = (error: unknown) => {
            failed = true;
            options.onError(error);
        };

        const deadline = setTimeout(() => {
            console.error(
                `Graceful shutdown exceeded ${options.timeoutMs}ms; terminating.`,
            );

            try {
                options.server.closeAllConnections?.();
            } finally {
                if (options.onDeadline) {
                    options.onDeadline();
                } else {
                    process.exit(1);
                }
            }
        }, options.timeoutMs);

        const drainRequests = new Promise<void>((resolve, reject) => {
            options.server.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });

        async function runSteps(steps: readonly ShutdownStep[]) {
            await Promise.all(
                steps.map(async (step) => {
                    try {
                        await step();
                    } catch (error) {
                        reportFailure(error);
                    }
                }),
            );
        }

        async function finish() {
            await Promise.all([
                drainRequests.catch(reportFailure),
                runSteps(options.stopWorkers),
            ]);

            // HTTP and workers share clients. Close clients only once both have drained.
            await runSteps(options.closeResources);
            if (failed) {
                // A failed close may leave a live handle. Keep its deadline without
                // delaying normal exit when all remaining handles are already gone.
                deadline.unref();
            } else {
                clearTimeout(deadline);
            }
        }

        void finish();
    };
}

export function listenForShutdownSignals(
    shutdown: (signal: string) => void,
): void {
    // Keep handlers installed while draining. A second SIGTERM would otherwise
    // take Node's default exit path before outstanding work finishes.
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
