const MAXIMUM_BYTES = 2 * 1024 * 1024;

/** Fixed official URLs are constructed by adapters, never accepted from an MCP argument. */
export async function readPricingJson(
    fetcher: typeof fetch,
    url: URL,
    signal?: AbortSignal,
): Promise<unknown> {
    if (url.origin !== 'https://openrouter.ai' || url.username || url.password)
        throw new Error('Unsupported pricing source origin.');
    const bounded = AbortSignal.timeout(10_000);
    const response = await fetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, bounded]) : bounded,
    });
    if (!response.ok || !response.body)
        throw new Error('Pricing source unavailable.');
    const length = response.headers.get('content-length');
    if (length && Number(length) > MAXIMUM_BYTES) {
        await response.body.cancel();
        throw new Error('Pricing response too large.');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        for (;;) {
            const item = await reader.read();
            if (item.done) break;
            bytes += item.value.byteLength;
            if (bytes > MAXIMUM_BYTES)
                throw new Error('Pricing response too large.');
            chunks.push(item.value);
        }
    } finally {
        await reader.cancel();
        reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
