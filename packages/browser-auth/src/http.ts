export interface RuntimeSchema<T> {
    parse(value: unknown): T;
}

export interface SafeRuntimeSchema<T> extends RuntimeSchema<T> {
    safeParse(
        value: unknown,
    ): { data: T; success: true } | { error: unknown; success: false };
}

export interface BrowserApiErrorDetail {
    code: string;
    correlationId: string;
    message: string;
    retryAfterSeconds?: number | undefined;
}

export interface BrowserErrorResponse<TDetail extends BrowserApiErrorDetail> {
    error: TDetail;
}

export interface BrowserRequestOptions<TBody, TResponse> {
    accessToken?: string | undefined;
    body?: TBody | undefined;
    bodySchema?: RuntimeSchema<TBody> | undefined;
    method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | undefined;
    responseSchema: RuntimeSchema<TResponse>;
    signal?: AbortSignal | undefined;
}

export interface BrowserApiClientOptions<
    TDetail extends BrowserApiErrorDetail,
> {
    accessTokenHeader?: string | undefined;
    baseUrl: string;
    createError?: ((status: number, detail: TDetail) => Error) | undefined;
    errorResponseSchema: SafeRuntimeSchema<BrowserErrorResponse<TDetail>>;
    invalidErrorResponseMessage?: string | undefined;
    invalidResponseMessage: string;
    networkErrorMessage: string;
}

export class BrowserApiError<
    TDetail extends BrowserApiErrorDetail = BrowserApiErrorDetail,
> extends Error {
    public constructor(
        public readonly status: number,
        public readonly detail: TDetail,
    ) {
        super(detail.message);
        this.name = 'BrowserApiError';
    }
}

export function createBrowserApiClient<TDetail extends BrowserApiErrorDetail>(
    options: BrowserApiClientOptions<TDetail>,
) {
    const baseUrl = options.baseUrl.replace(/\/$/, '');
    const accessTokenHeader = options.accessTokenHeader ?? 'Authorization';
    const createError = (status: number, detail: TDetail) =>
        options.createError?.(status, detail) ??
        new BrowserApiError(status, detail);
    return {
        request: async <TBody, TResponse>(
            path: string,
            requestOptions: BrowserRequestOptions<TBody, TResponse>,
        ): Promise<TResponse> => {
            const body = requestOptions.bodySchema?.parse(requestOptions.body);
            let response: Response;
            try {
                response = await fetch(`${baseUrl}${path}`, {
                    ...(body === undefined
                        ? {}
                        : { body: JSON.stringify(body) }),
                    cache: 'no-store',
                    credentials: 'include',
                    headers: {
                        Accept: 'application/json',
                        ...(body === undefined
                            ? {}
                            : { 'Content-Type': 'application/json' }),
                        ...(requestOptions.accessToken
                            ? {
                                  [accessTokenHeader]: `Bearer ${requestOptions.accessToken}`,
                              }
                            : {}),
                    },
                    method: requestOptions.method ?? 'GET',
                    ...(requestOptions.signal
                        ? { signal: requestOptions.signal }
                        : {}),
                });
            } catch (cause) {
                if (
                    cause instanceof DOMException &&
                    cause.name === 'AbortError'
                ) {
                    throw cause;
                }
                throw createError(0, {
                    code: 'service_unavailable',
                    correlationId: 'client-network-error',
                    message: options.networkErrorMessage,
                } as TDetail);
            }

            const payload = await readJson(response);
            if (!response.ok) {
                const parsed = options.errorResponseSchema.safeParse(payload);
                throw createError(
                    response.status,
                    parsed.success
                        ? parsed.data.error
                        : ({
                              code: 'service_unavailable',
                              correlationId:
                                  response.headers.get('x-correlation-id') ??
                                  'invalid-api-response',
                              message:
                                  options.invalidErrorResponseMessage ??
                                  options.invalidResponseMessage,
                          } as TDetail),
                );
            }
            try {
                return requestOptions.responseSchema.parse(payload);
            } catch {
                throw createError(502, {
                    code: 'service_unavailable',
                    correlationId: 'invalid-api-response',
                    message: options.invalidResponseMessage,
                } as TDetail);
            }
        },
    };
}

async function readJson(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return undefined;
    try {
        return await response.json();
    } catch {
        return undefined;
    }
}
