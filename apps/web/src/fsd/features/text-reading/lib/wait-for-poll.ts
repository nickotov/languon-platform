/** Abort releases the pending timer immediately; callers recheck the signal. */

export function waitForPoll(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve();
            return;
        }
        const timer = window.setTimeout(done, 1000);
        function done() {
            window.clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
        }
        signal.addEventListener('abort', done, { once: true });
    });
}
