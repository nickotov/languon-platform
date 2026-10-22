import { BrowserApiError } from '@languon/browser-auth';
import * as c from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

export type RequestWithTextSession = <T>(
    operation: (accessToken: string) => Promise<T>,
) => Promise<T>;
const selectionErrorSchema = c.TextErrorResponseSchema.shape.error.extend({
    code: c.TextErrorResponseSchema.shape.error.shape.code.or(
        c.TextAiJobSchema.shape.failureCode.unwrap(),
    ),
    correlationId:
        c.TextErrorResponseSchema.shape.error.shape.correlationId.default(
            'selection-api-error',
        ),
});
type ErrorDetail = ReturnType<typeof selectionErrorSchema.parse>;
export class TextsApiError extends BrowserApiError<ErrorDetail> {
    public override readonly name = 'TextsApiError';
}
const apiUrl = resolveApiUrl(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_API_URL,
);
export type Schema<T> = { parse(value: unknown): T };
export type Options = {
    accessToken?: string | undefined;
    signal?: AbortSignal | undefined;
    headers?: Record<string, string> | undefined;
};
const fallback = (correlationId: string): ErrorDetail => ({
    code: 'service_unavailable',
    message: 'Texts are temporarily unavailable.',
    correlationId,
});
export async function request<T>(
    path: string,
    schema: Schema<T>,
    options: Options = {},
    method = 'GET',
    body?: unknown,
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${apiUrl}${path}`, {
            method,
            cache: 'no-store',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                ...(body === undefined
                    ? {}
                    : { 'Content-Type': 'application/json' }),
                ...(options.accessToken
                    ? { Authorization: `Bearer ${options.accessToken}` }
                    : {}),
                ...options.headers,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            ...(options.signal ? { signal: options.signal } : {}),
        });
    } catch (cause) {
        if (
            (cause instanceof DOMException || cause instanceof Error) &&
            cause.name === 'AbortError'
        )
            throw cause;
        throw new TextsApiError(0, fallback('client-network-error'));
    }
    let payload: unknown;
    if (
        (response.headers.get('content-type') ?? '').includes(
            'application/json',
        )
    ) {
        try {
            payload = await response.json();
        } catch (cause) {
            if (
                (cause instanceof DOMException || cause instanceof Error) &&
                cause.name === 'AbortError'
            )
                throw cause;
            payload = undefined;
        }
    }
    if (!response.ok) {
        const parsed = selectionErrorSchema.safeParse(
            (payload as { error?: unknown } | undefined)?.error,
        );
        throw new TextsApiError(
            response.status,
            parsed.success
                ? parsed.data
                : fallback(
                      response.headers.get('x-correlation-id') ??
                          'invalid-api-response',
                  ),
        );
    }
    try {
        if (schema === voidSchema && response.status !== 204) {
            throw new Error('Expected empty response');
        }
        return schema.parse(payload);
    } catch {
        throw new TextsApiError(502, fallback('invalid-api-response'));
    }
}
export const id = (value: string) =>
    encodeURIComponent(c.TextIdSchema.parse(value));
export function query(values: Partial<c.ListTextsQuery> = {}) {
    const parsed = c.ListTextsQuerySchema.parse(values);
    return `?${new URLSearchParams(Object.entries(parsed).map(([key, value]) => [key, String(value)])).toString()}`;
}
export function share(shareId: string, key: string, kind: 'text' | 'folder') {
    const capability = c.TextShareCapabilitySchema.parse({ shareId, key });
    return {
        path: `/shared-${kind === 'text' ? 'texts' : 'text-folders'}/${encodeURIComponent(capability.shareId)}`,
        headers: { 'X-Languon-Share-Key': capability.key },
    };
}
export const voidSchema: Schema<void> = { parse: () => undefined };
export const copyResponseSchema = {
    parse(value: unknown) {
        return {
            id: c.TextIdSchema.parse(
                (value as { id?: unknown } | undefined)?.id,
            ),
        };
    },
};
