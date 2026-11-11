import {
    ApplyDictionaryChatSnippetRequestSchema,
    ApplyDictionaryChatSnippetResponseSchema,
    ConversationErrorResponseSchema,
    DictionaryChatSnippetSchema,
    DictionaryChatSnippetsResponseSchema,
    DictionaryErrorResponseSchema,
    type ApplyDictionaryChatSnippetRequest,
} from '@languon/contracts';
import { ConversationApiError } from '@/fsd/entities/conversation';
import { DictionaryApiError } from '@/fsd/entities/dictionary';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import type { DictionarySnippetContext } from '../types';

async function request<T>(
    context: DictionarySnippetContext,
    suffix: string,
    schema: { parse(value: unknown): T },
    body?: ApplyDictionaryChatSnippetRequest,
    signal?: AbortSignal,
) {
    const conversationId =
        DictionaryChatSnippetSchema.shape.conversationId.parse(
            context.conversationId,
        );

    return context.requestWithSession(async (token) => {
        const base = resolveApiUrl(
            process.env.NODE_ENV,
            process.env.NEXT_PUBLIC_API_URL,
        );
        const response = await fetch(
            `${base}/conversations/${conversationId}/dictionary-snippets${suffix}`,
            {
                method: body ? 'POST' : 'GET',
                credentials: 'include',
                cache: 'no-store',
                signal: signal ?? AbortSignal.timeout(30_000),
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
            const error = ConversationErrorResponseSchema.safeParse(payload);
            const correlationId =
                response.headers.get('x-correlation-id') ??
                'dictionary-snippet-client';
            const dictionaryError = DictionaryErrorResponseSchema.safeParse({
                error: error.success
                    ? {
                          code: error.data.error.code,
                          message: error.data.error.message,
                          correlationId:
                              error.data.error.correlationId ??
                              error.data.error.requestId ??
                              correlationId,
                      }
                    : null,
            });

            if (dictionaryError.success) {
                throw new DictionaryApiError(
                    response.status,
                    dictionaryError.data.error,
                );
            }

            throw new ConversationApiError(response.status, {
                ...(error.success
                    ? error.data.error
                    : {
                          code: 'service_unavailable',
                          message: 'The snippet is unavailable.',
                      }),
                correlationId,
            });
        }

        return schema.parse(payload);
    });
}

export const dictionarySnippetsApi = {
    list: (context: DictionarySnippetContext, signal?: AbortSignal) =>
        request(
            context,
            '',
            DictionaryChatSnippetsResponseSchema,
            undefined,
            signal,
        ),
    apply: (
        context: DictionarySnippetContext,
        snippetId: string,
        body: ApplyDictionaryChatSnippetRequest,
    ) => {
        const id = DictionaryChatSnippetSchema.shape.id.parse(snippetId);

        return request(
            context,
            `/${id}/apply`,
            ApplyDictionaryChatSnippetResponseSchema,
            ApplyDictionaryChatSnippetRequestSchema.parse(body),
        );
    },
};
