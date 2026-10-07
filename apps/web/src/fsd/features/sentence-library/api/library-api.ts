import {
    SentenceLibraryListResponseSchema,
    SentenceErrorResponseSchema,
    SentenceLibraryDetailSchema,
    SentenceLibrarySnapshotResponseSchema,
    SentenceLibraryMutationResponseSchema,
    SentenceLibraryQuerySchema,
    SentenceLibrarySnapshotRequestSchema,
    SentenceLibraryMutationRequestSchema,
    DictionaryIdParamsSchema,
    SharedDictionaryParamsSchema,
    DictionaryShareKeyHeadersSchema,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import type { LibraryTarget, LibraryApi } from '../types';
export class LibraryApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
    ) {
        super(code);
    }
}
export function createLibraryApi(
    target: LibraryTarget,
    requestWithSession: RequestWithSession,
): LibraryApi {
    const base = (
        process.env.NEXT_PUBLIC_API_URL ??
        (process.env.NODE_ENV === 'production'
            ? '/api'
            : 'http://localhost:4000')
    ).replace(/\/$/, '');
    const root =
        target.kind === 'owner'
            ? `/learning/dictionaries/${encodeURIComponent(target.dictionaryId)}/sentences/library`
            : `/learning/shared-dictionaries/${encodeURIComponent(target.shareId)}/sentences/library`;
    async function request<T>(
        path: string,
        schema: { parse(value: unknown): T },
        body?: unknown,
    ): Promise<T> {
        if (target.kind === 'owner')
            DictionaryIdParamsSchema.parse({
                dictionaryId: target.dictionaryId,
            });
        else {
            SharedDictionaryParamsSchema.parse({ shareId: target.shareId });
            DictionaryShareKeyHeadersSchema.parse({
                'x-languon-share-key': target.shareKey,
            });
        }
        return requestWithSession(async (token) => {
            const response = await fetch(`${base}${root}${path}`, {
                method: body === undefined ? 'GET' : 'POST',
                cache: 'no-store',
                credentials: 'include',
                signal: AbortSignal.timeout(30000),
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    ...(body === undefined
                        ? {}
                        : { 'Content-Type': 'application/json' }),
                    ...(target.kind === 'shared'
                        ? { 'X-Languon-Share-Key': target.shareKey }
                        : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            const payload: unknown = await response.json();
            if (!response.ok) {
                const error = SentenceErrorResponseSchema.safeParse(payload);
                throw new LibraryApiError(
                    response.status,
                    error.success
                        ? error.data.error.code
                        : 'service_unavailable',
                );
            }
            return schema.parse(payload);
        });
    }
    return {
        list: (query) => {
            const parsed = SentenceLibraryQuerySchema.parse(query);
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(parsed))
                if (v !== undefined) params.set(k, String(v));
            return request(`?${params}`, SentenceLibraryListResponseSchema);
        },
        detail: (id) =>
            request(
                `/${encodeURIComponent(SentenceLibraryDetailSchema.shape.item.shape.exerciseId.parse(id))}`,
                SentenceLibraryDetailSchema,
            ),
        snapshot: (operation, query) =>
            request(
                '/snapshots',
                SentenceLibrarySnapshotResponseSchema,
                SentenceLibrarySnapshotRequestSchema.parse({
                    operation,
                    query,
                }),
            ),
        mutate: (input) =>
            request(
                '/mutations',
                SentenceLibraryMutationResponseSchema,
                SentenceLibraryMutationRequestSchema.parse(input),
            ),
    };
}
