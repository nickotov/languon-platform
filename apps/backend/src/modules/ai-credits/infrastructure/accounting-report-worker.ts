/** Dedicated accounting pool can be supplied through the store; no generation-pool timer work. */
export function startAccountingReportWorker(options: {
    refreshNextReport(at?: Date): Promise<boolean>;
    onError(error: unknown): void;
    intervalMs?: number;
    signal?: AbortSignal;
}): { stop(): Promise<void> } {
    let stopped = options.signal?.aborted ?? false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: Promise<void> = Promise.resolve();
    const interval = options.intervalMs ?? 15000;
    if (!Number.isSafeInteger(interval) || interval < 1000 || interval > 30000)
        throw new Error(
            'Accounting report interval must be between one and thirty seconds.',
        );
    const schedule = () => {
        if (stopped) return;
        timer = setTimeout(() => {
            inFlight = options
                .refreshNextReport()
                .then(() => undefined)
                .catch(options.onError)
                .finally(schedule);
        }, interval);
        timer.unref();
    };
    const abort = () => {
        stopped = true;
        if (timer) clearTimeout(timer);
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    schedule();
    return {
        async stop() {
            abort();
            options.signal?.removeEventListener('abort', abort);
            await inFlight;
        },
    };
}
