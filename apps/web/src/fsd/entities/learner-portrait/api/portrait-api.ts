import { BrowserApiError } from '@languon/browser-auth';
import {
    ApprovePortraitRequestSchema,
    DeletePortraitRequestSchema,
    DiscardPortraitInterviewRequestSchema,
    PortraitInterviewOperationResponseSchema,
    PortraitInterviewStatusResponseSchema,
    PortraitOperationParamsSchema,
    PortraitStateSchema,
    SavePortraitDraftRequestSchema,
    SetPortraitInterviewLocaleResponseSchema,
    SetPortraitInterviewLocaleSchema,
    SetPortraitUseRequestSchema,
    StartPortraitInterviewResponseSchema,
    StartPortraitInterviewSchema,
    SubmitPortraitInterviewSchema,
} from '@languon/contracts';
import { z } from 'zod';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

export type PortraitSessionRequest = <T>(
    operation: (token: string) => Promise<T>,
) => Promise<T>;

const ErrorCodeSchema = z.enum([
    'authentication_required',
    'invalid_origin',
    'invalid_request',
    'version_conflict',
    'draft_unavailable',
    'resource_limit',
    'billing_notice_required',
    'credits_exhausted',
    'model_unavailable',
    'capacity_unavailable',
    'invalid_call',
    'rate_limited',
    'service_unavailable',
    'internal_error',
    'not_found',
    'invalid_response',
    'network_error',
]);
const ErrorResponseSchema = z.object({
    error: z.object({
        code: ErrorCodeSchema,
        message: z.string().max(2000),
        correlationId: z.string().max(200),
    }),
});
export type PortraitErrorCode = z.infer<typeof ErrorCodeSchema>;
export class PortraitApiError extends BrowserApiError<
    z.infer<typeof ErrorResponseSchema>['error']
> {
    public override readonly name = 'PortraitApiError';
    get code() {
        return this.detail.code;
    }
}

const base = resolveApiUrl(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_API_URL,
);
const MAX_RESPONSE_BYTES = 250_000;

/** Bound decoded response bytes before JSON parsing; errors never expose raw personal data. */
async function readBody(response: Response): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing response body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                throw new Error('Response exceeds limit');
            }
            chunks.push(chunk.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function request<T>(
    token: string,
    path: string,
    schema: { parse(value: unknown): T },
    options: {
        method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
        body?: unknown;
        signal?: AbortSignal | undefined;
    } = {},
): Promise<T> {
    const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000);
    let response: Response;
    try {
        response = await fetch(`${base}/learner-portrait${path}`, {
            method: options.method ?? 'GET',
            cache: 'no-store',
            credentials: 'include',
            signal,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                ...(options.body === undefined
                    ? {}
                    : { 'Content-Type': 'application/json' }),
            },
            ...(options.body === undefined
                ? {}
                : { body: JSON.stringify(options.body) }),
        });
    } catch (cause) {
        if (signal.aborted) throw cause;
        throw new PortraitApiError(0, {
            code: 'network_error',
            message: 'Could not reach the portrait service.',
            correlationId: 'client-request',
        });
    }
    let body: unknown;
    try {
        body = await readBody(response);
    } catch {
        throw new PortraitApiError(response.status, {
            code: response.ok ? 'invalid_response' : 'service_unavailable',
            message: 'The portrait service returned an invalid response.',
            correlationId:
                response.headers.get('x-correlation-id') ?? 'client-request',
        });
    }
    if (!response.ok) {
        const parsed = ErrorResponseSchema.safeParse(body);
        throw new PortraitApiError(
            response.status,
            parsed.success
                ? parsed.data.error
                : {
                      code: 'service_unavailable',
                      message: 'The portrait request could not be completed.',
                      correlationId: 'client-request',
                  },
        );
    }
    try {
        return schema.parse(body);
    } catch {
        throw new PortraitApiError(response.status, {
            code: 'invalid_response',
            message: 'The portrait service returned an invalid response.',
            correlationId: 'client-request',
        });
    }
}

export const portraitApi = {
    readInterviewStatus: (token: string, signal?: AbortSignal) =>
        request(
            token,
            '/interview/status',
            PortraitInterviewStatusResponseSchema,
            { signal },
        ),
    read: (token: string, signal?: AbortSignal) =>
        request(token, '', PortraitStateSchema, { signal }),
    saveDraft: (
        token: string,
        input: z.input<typeof SavePortraitDraftRequestSchema>,
    ) =>
        request(token, '/draft', PortraitStateSchema, {
            method: 'PATCH',
            body: SavePortraitDraftRequestSchema.parse(input),
        }),
    approve: (
        token: string,
        input: z.input<typeof ApprovePortraitRequestSchema>,
    ) =>
        request(token, '/approve', PortraitStateSchema, {
            method: 'POST',
            body: ApprovePortraitRequestSchema.parse(input),
        }),
    setUse: (
        token: string,
        input: z.input<typeof SetPortraitUseRequestSchema>,
    ) =>
        request(token, '/use', PortraitStateSchema, {
            method: 'PATCH',
            body: SetPortraitUseRequestSchema.parse(input),
        }),
    remove: (
        token: string,
        input: z.input<typeof DeletePortraitRequestSchema>,
    ) =>
        request(token, '', PortraitStateSchema, {
            method: 'DELETE',
            body: DeletePortraitRequestSchema.parse(input),
        }),
    discard: (
        token: string,
        input: z.input<typeof DiscardPortraitInterviewRequestSchema>,
    ) =>
        request(token, '/interview/discard', PortraitStateSchema, {
            method: 'POST',
            body: DiscardPortraitInterviewRequestSchema.parse(input),
        }),
    startInterview: (
        token: string,
        input: z.input<typeof StartPortraitInterviewSchema>,
    ) =>
        request(token, '/interview', StartPortraitInterviewResponseSchema, {
            method: 'POST',
            body: StartPortraitInterviewSchema.parse(input),
        }),
    setInterviewLocale: (
        token: string,
        input: z.input<typeof SetPortraitInterviewLocaleSchema>,
    ) =>
        request(
            token,
            '/interview/locale',
            SetPortraitInterviewLocaleResponseSchema,
            {
                method: 'PATCH',
                body: SetPortraitInterviewLocaleSchema.parse(input),
            },
        ),
    submitInterview: (
        token: string,
        input: z.input<typeof SubmitPortraitInterviewSchema>,
    ) =>
        request(
            token,
            '/interview/responses',
            PortraitInterviewOperationResponseSchema,
            {
                method: 'POST',
                body: SubmitPortraitInterviewSchema.parse(input),
            },
        ),
    readOperation: (token: string, id: string, signal?: AbortSignal) =>
        request(
            token,
            `/interview/responses/${PortraitOperationParamsSchema.parse({ operationId: id }).operationId}`,
            PortraitInterviewOperationResponseSchema,
            { signal },
        ),
    stopOperation: (token: string, id: string) =>
        request(
            token,
            `/interview/responses/${PortraitOperationParamsSchema.parse({ operationId: id }).operationId}/stop`,
            PortraitInterviewOperationResponseSchema,
            { method: 'POST' },
        ),
};
