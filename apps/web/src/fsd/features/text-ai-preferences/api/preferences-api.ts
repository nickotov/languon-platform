import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import { BrowserApiError } from '@languon/browser-auth';
import {
    TextAiErrorResponseSchema,
    TextAiModelsResponseSchema,
    TextAiPreferenceResponseSchema,
    UpdateTextAiPreferenceRequestSchema,
    type UpdateTextAiPreferenceRequest,
} from '@languon/contracts';

export type SessionRequest = <T>(
    operation: (accessToken: string) => Promise<T>,
) => Promise<T>;
export class PreferenceApiError extends BrowserApiError {
    constructor(
        public readonly code: string,
        status: number,
    ) {
        super(status, {
            code,
            correlationId: 'text-ai-request',
            message: code,
        });
    }
}
async function request<T>(
    token: string,
    path: string,
    schema: { parse(value: unknown): T },
    body?: UpdateTextAiPreferenceRequest,
): Promise<T> {
    const base = resolveApiUrl(
        process.env.NODE_ENV,
        process.env.NEXT_PUBLIC_API_URL,
    );
    const response = await fetch(`${base}${path}`, {
        method: body ? 'PUT' : 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
        credentials: 'include',
        ...(body
            ? {
                  body: JSON.stringify(
                      UpdateTextAiPreferenceRequestSchema.parse(body),
                  ),
              }
            : {}),
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
        const parsed = TextAiErrorResponseSchema.safeParse(data);
        throw new PreferenceApiError(
            parsed.success ? parsed.data.error.code : 'internal_error',
            response.status,
        );
    }
    return schema.parse(data);
}
export const preferencesApi = {
    catalog: (token: string) =>
        request(token, '/text-ai/models', TextAiModelsResponseSchema),
    read: (token: string) =>
        request(
            token,
            '/users/me/ai-model-preference',
            TextAiPreferenceResponseSchema,
        ),
    save: (token: string, body: UpdateTextAiPreferenceRequest) =>
        request(
            token,
            '/users/me/ai-model-preference',
            TextAiPreferenceResponseSchema,
            body,
        ),
};
