const MAXIMUM_BYTES = 2 * 1024 * 1024;
const origins = new Set([
    'https://openrouter.ai',
    'https://api-docs.deepseek.com',
    'https://api.evolink.ai',
    'https://kie.ai',
    'https://api.kie.ai',
]);

/** Fixed official URLs are constructed by adapters, never accepted from an MCP argument. */
export async function readPricingJson(
    fetcher: typeof fetch,
    url: URL,
    signal?: AbortSignal,
    body?: {
        pageNum: number;
        pageSize: number;
        modelDescription: string;
        interfaceType: string;
    },
): Promise<unknown> {
    return JSON.parse(
        await readPricingText(fetcher, url, signal, body),
    ) as unknown;
}

export async function readPricingText(
    fetcher: typeof fetch,
    url: URL,
    signal?: AbortSignal,
    body?: {
        pageNum: number;
        pageSize: number;
        modelDescription: string;
        interfaceType: string;
    },
): Promise<string> {
    signal?.throwIfAborted();
    if (!origins.has(url.origin) || url.username || url.password || url.hash)
        throw new Error('Unsupported pricing source origin.');
    if (
        body &&
        (url.origin !== 'https://api.kie.ai' ||
            url.pathname !== '/client/v1/model-pricing/page' ||
            url.search)
    )
        throw new Error('Unsupported pricing source request.');
    const bounded = AbortSignal.timeout(10_000);
    const response = await fetcher(url, {
        method: body ? 'POST' : 'GET',
        headers: body
            ? {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-cache',
              }
            : { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        ...(body ? { body: JSON.stringify(body) } : {}),
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
    return Buffer.concat(chunks).toString('utf8');
}
