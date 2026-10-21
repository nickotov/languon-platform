import { BrowserApiError } from '@languon/browser-auth';
import {
    NavigationResourcesResponseSchema,
    NavigationResourceResponseSchema,
    NavigationErrorResponseSchema,
    type NavigationResourceKind,
} from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

export class NavigationApiError extends BrowserApiError<{
    code: string;
    message: string;
    correlationId: string;
}> {}

async function request<T>(
    token: string,
    path: string,
    schema: { parse(value: unknown): T },
    options: {
        method?: string;
        body?: unknown;
        signal?: AbortSignal | undefined;
    } = {},
) {
    const fallback = {
        code: 'internal_error',
        message: 'Navigation unavailable',
        correlationId: 'navigation-client',
    };
    let response: Response;
    try {
        response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/navigation/${path}`,
            {
                method: options.method ?? 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    ...(options.body === undefined
                        ? {}
                        : { 'Content-Type': 'application/json' }),
                },
                signal: options.signal ?? AbortSignal.timeout(30_000),
                ...(options.body === undefined
                    ? {}
                    : { body: JSON.stringify(options.body) }),
            },
        );
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new NavigationApiError(0, fallback);
    }
    const payload: unknown = await response.json();
    if (!response.ok) {
        const parsed = NavigationErrorResponseSchema.safeParse(payload);
        throw new NavigationApiError(
            response.status,
            parsed.success ? parsed.data.error : fallback,
        );
    }
    return schema.parse(payload);
}

export const navigationApi = {
    resources(
        token: string,
        input: {
            kind?: NavigationResourceKind;
            q?: string;
            limit: number;
            currentId?: string;
        },
        signal?: AbortSignal,
    ) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(input))
            if (value !== undefined) query.set(key, String(value));
        return request(
            token,
            `resources?${query}`,
            NavigationResourcesResponseSchema,
            { signal },
        );
    },
    recent(token: string, signal?: AbortSignal) {
        return request(
            token,
            'recent?limit=5',
            NavigationResourcesResponseSchema,
            { signal },
        );
    },
    opened(token: string, kind: NavigationResourceKind, id: string) {
        return request(
            token,
            `resources/${kind}/${encodeURIComponent(id)}/opened`,
            NavigationResourceResponseSchema,
            { method: 'POST' },
        );
    },
    pin(
        token: string,
        kind: NavigationResourceKind,
        id: string,
        pinned: boolean,
    ) {
        return request(
            token,
            `resources/${kind}/${encodeURIComponent(id)}/pin`,
            NavigationResourceResponseSchema,
            { method: 'PUT', body: { pinned } },
        );
    },
};
