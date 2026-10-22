import { adminApi, AdminApiError } from '@/shared/api/admin-api';

/** Cold reporting snapshots are computed off the admission and HTTP paths. */
export async function reportWhenReady(
    query: { from: string; to: string },
    signal?: AbortSignal,
) {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await adminApi.accountingReport(query, signal);
        } catch (caught) {
            const preparing =
                caught instanceof AdminApiError &&
                caught.statusCode === 503 &&
                caught.detail.code === 'service_unavailable';
            if (!preparing || attempt >= 29 || signal?.aborted) throw caught;
            await pause(signal);
        }
    }
}
function pause(signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        const abort = () => {
            window.clearTimeout(timer);
            reject(signal?.reason);
        };
        const timer = window.setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, 2_000);
        signal?.addEventListener('abort', abort, { once: true });
    });
}
