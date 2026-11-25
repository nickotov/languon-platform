// At the default cadence, two fast batches can visit all 64 registered ranges.
const maximumRefreshesPerTick = 32;
const claimBudgetMs = 1000;

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
    if (
        !Number.isSafeInteger(interval) ||
        interval < 1000 ||
        interval > 30000
    ) {
        throw new Error(
            'Accounting report interval must be between one and thirty seconds.',
        );
    }

    const refreshBatch = async () => {
        // Bound new claims. Each claimed report keeps its own lease and SQL timeout.
        const deadline = performance.now() + claimBudgetMs;
        for (let count = 0; count < maximumRefreshesPerTick; count++) {
            if (stopped || performance.now() >= deadline) {
                return;
            }

            if (!(await options.refreshNextReport())) {
                return;
            }
        }
    };

    const schedule = () => {
        if (stopped) {
            return;
        }

        timer = setTimeout(() => {
            inFlight = refreshBatch().catch(options.onError).finally(schedule);
        }, interval);

        timer.unref();
    };
    const abort = () => {
        stopped = true;
        if (timer) {
            clearTimeout(timer);
        }
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
