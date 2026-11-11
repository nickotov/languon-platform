import { randomUUID } from 'node:crypto';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
    ApplyDictionaryChatSnippetRequestSchema,
    ApplyDictionaryChatSnippetResponseSchema,
    DictionaryChatSnippetsResponseSchema,
} from '@languon/contracts';
import type {
    ConversationStore,
    ConversationAccess,
} from '../../application/ports/conversation-store';
import { ConversationError } from '../../domain/conversation';

const json = (schema: z.ZodType, description = 'Success') => ({
    description,
    content: { 'application/json': { schema } },
});
const failure = json(
    z.object({
        error: z.object({
            code: z.string(),
            message: z.string(),
            requestId: z.string(),
        }),
    }),
    'Request failed',
);
const errors = {
    400: failure,
    401: failure,
    403: failure,
    404: failure,
    409: failure,
    429: failure,
    500: failure,
    503: failure,
};
const security = [{ bearerAuth: [] as string[] }];
export function registerConversationDictionarySnippetRoutes(
    app: OpenAPIHono,
    store: ConversationStore,
    access: (context: Context) => Promise<ConversationAccess>,
) {
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/dictionary-snippets',
            security,
            request: { params: z.object({ conversationId: z.uuid() }) },
            responses: {
                200: json(DictionaryChatSnippetsResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            if (!store.listDictionarySnippets) {
                throw new ConversationError(
                    'service_unavailable',
                    'Dictionary snippets are unavailable.',
                );
            }

            return c.json(
                await store.listDictionarySnippets(
                    await access(c),
                    c.req.valid('param').conversationId,
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/dictionary-snippets/{snippetId}/apply',
            security,
            request: {
                params: z.object({
                    conversationId: z.uuid(),
                    snippetId: z.uuid(),
                }),
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: ApplyDictionaryChatSnippetRequestSchema,
                        },
                    },
                },
            },
            responses: {
                200: json(ApplyDictionaryChatSnippetResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            if (!store.applyDictionarySnippet) {
                throw new ConversationError(
                    'service_unavailable',
                    'Dictionary snippets are unavailable.',
                );
            }

            const params = c.req.valid('param');

            try {
                return c.json(
                    await store.applyDictionarySnippet(
                        await access(c),
                        params.conversationId,
                        params.snippetId,
                        c.req.valid('json'),
                    ),
                    200,
                );
            } catch (error) {
                if (
                    error instanceof ConversationError ||
                    !(error instanceof Error)
                ) {
                    throw error;
                }

                const mapped = mapDictionaryHttpError(error);

                const status =
                    mapped.status === 400 ||
                    mapped.status === 401 ||
                    mapped.status === 403 ||
                    mapped.status === 404 ||
                    mapped.status === 409 ||
                    mapped.status === 429 ||
                    mapped.status === 503
                        ? mapped.status
                        : 500;

                return c.json(
                    {
                        error: {
                            code: mapped.code,
                            message: mapped.message,
                            requestId: randomUUID(),
                        },
                    },
                    status,
                );
            }
        },
    );
}
