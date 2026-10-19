import { BrowserApiError } from '@languon/browser-auth';
import * as c from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

type ErrorDetail = ReturnType<
    typeof c.KnowledgeErrorResponseSchema.parse
>['error'];
export class KnowledgeApiError extends BrowserApiError<ErrorDetail> {
    override name = 'KnowledgeApiError';
}

async function request<T>(
    token: string,
    path: string,
    schema: { parse(value: unknown): T },
    options: {
        method?: string;
        body?: unknown;
        signal?: AbortSignal | undefined;
    } = {},
): Promise<T> {
    const fallback: ErrorDetail = {
        code: 'internal_error',
        message: 'Knowledge is unavailable.',
        correlationId: 'knowledge-client-request',
    };
    let response: Response;
    try {
        response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}${path}`,
            {
                method: options.method ?? 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    ...(options.body === undefined
                        ? {}
                        : { 'Content-Type': 'application/json' }),
                },
                credentials: 'include',
                cache: 'no-store',
                signal: options.signal ?? AbortSignal.timeout(30_000),
                ...(options.body === undefined
                    ? {}
                    : { body: JSON.stringify(options.body) }),
            },
        );
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new KnowledgeApiError(0, fallback);
    }
    const payload: unknown = await response.json().catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        return undefined;
    });
    if (!response.ok) {
        const error = c.KnowledgeErrorResponseSchema.safeParse(payload);
        throw new KnowledgeApiError(
            response.status,
            error.success ? error.data.error : fallback,
        );
    }
    try {
        return schema.parse(payload);
    } catch {
        throw new KnowledgeApiError(502, fallback);
    }
}

function notePath(noteId: string) {
    return `/knowledge/${encodeURIComponent(c.KnowledgeNoteIdParamsSchema.parse({ noteId }).noteId)}`;
}

export const knowledgeApi = {
    list(
        token: string,
        input: Partial<c.ListKnowledgeQuery> = {},
        signal?: AbortSignal,
    ) {
        const query = c.ListKnowledgeQuerySchema.parse(input);
        const values = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== '')
                values.set(key, String(value));
        }
        return request(
            token,
            `/knowledge?${values}`,
            c.ListKnowledgeResponseSchema,
            { signal },
        );
    },
    async read(token: string, noteId: string, signal?: AbortSignal) {
        return (
            await request(
                token,
                notePath(noteId),
                c.KnowledgeNoteResponseSchema,
                { signal },
            )
        ).note;
    },
    async create(
        token: string,
        input: c.CreateKnowledgeNoteRequest,
        signal?: AbortSignal,
    ) {
        return (
            await request(token, '/knowledge', c.KnowledgeNoteResponseSchema, {
                method: 'POST',
                body: c.CreateKnowledgeNoteRequestSchema.parse(input),
                signal,
            })
        ).note;
    },
    async update(
        token: string,
        noteId: string,
        input: c.UpdateKnowledgeNoteRequest,
        signal?: AbortSignal,
    ) {
        return (
            await request(
                token,
                notePath(noteId),
                c.KnowledgeNoteResponseSchema,
                {
                    method: 'PATCH',
                    body: c.UpdateKnowledgeNoteRequestSchema.parse(input),
                    signal,
                },
            )
        ).note;
    },
    async remove(
        token: string,
        noteId: string,
        input: c.DeleteKnowledgeNoteRequest,
        signal?: AbortSignal,
    ) {
        return request(
            token,
            notePath(noteId),
            c.KnowledgeDeletedResponseSchema,
            {
                method: 'DELETE',
                body: c.DeleteKnowledgeNoteRequestSchema.parse(input),
                signal,
            },
        );
    },
    async revisions(token: string, noteId: string, signal?: AbortSignal) {
        return (
            await request(
                token,
                `${notePath(noteId)}/revisions`,
                c.KnowledgeRevisionsResponseSchema,
                { signal },
            )
        ).revisions;
    },
    async restore(
        token: string,
        noteId: string,
        input: c.RestoreKnowledgeNoteRequest,
        signal?: AbortSignal,
    ) {
        return (
            await request(
                token,
                `${notePath(noteId)}/restore`,
                c.KnowledgeNoteResponseSchema,
                {
                    method: 'POST',
                    body: c.RestoreKnowledgeNoteRequestSchema.parse(input),
                    signal,
                },
            )
        ).note;
    },
};
