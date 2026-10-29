import { BrowserApiError } from '@languon/browser-auth';
import { z } from 'zod';
import {
    KnowledgePrivateTranslationsResponseSchema,
    KnowledgeTranslationJobResponseSchema,
    RequestKnowledgeTranslationSchema,
    type RequestKnowledgeTranslation,
} from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import type { KnowledgePrivateTranslationProps } from '../types';
const detailSchema = z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string(),
    details: z.unknown().optional(),
});
export class PrivateTranslationApiError extends BrowserApiError<
    z.infer<typeof detailSchema>
> {}
export function privateTranslationApi(props: KnowledgePrivateTranslationProps) {
    const path = `/knowledge/${z.uuid().parse(props.noteId)}/blocks/${z.uuid().parse(props.block.id)}/private-translations`;
    async function call<T>(
        suffix: string,
        schema: { parse(value: unknown): T },
        signal: AbortSignal,
        input?: RequestKnowledgeTranslation,
        method = 'GET',
    ): Promise<T> {
        return props.requestWithSession(async (token) => {
            const access = props.access;
            const response = await fetch(
                `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}${path}${suffix}`,
                {
                    method,
                    signal,
                    credentials: 'include',
                    cache: 'no-store',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                        ...(input
                            ? { 'Content-Type': 'application/json' }
                            : {}),
                        ...(access
                            ? {
                                  'X-Languon-Share-Kind': access.kind,
                                  'X-Languon-Share-Locator': access.locator,
                                  'X-Languon-Share-Key': access.key,
                              }
                            : {}),
                    },
                    ...(input
                        ? {
                              body: JSON.stringify(
                                  RequestKnowledgeTranslationSchema.parse(
                                      input,
                                  ),
                              ),
                          }
                        : {}),
                },
            );
            const payload: unknown = await response.json();
            if (!response.ok) {
                const parsed = detailSchema.safeParse(
                    (payload as { error?: unknown })?.error,
                );
                throw new PrivateTranslationApiError(
                    response.status,
                    parsed.success
                        ? parsed.data
                        : {
                              code: 'service_unavailable',
                              message: 'Translation is unavailable.',
                              correlationId: 'translation-client',
                          },
                );
            }
            return schema.parse(payload);
        });
    }
    return {
        list: (signal: AbortSignal) =>
            call('', KnowledgePrivateTranslationsResponseSchema, signal),
        request: (input: RequestKnowledgeTranslation, signal: AbortSignal) =>
            call(
                '',
                KnowledgeTranslationJobResponseSchema,
                signal,
                input,
                'POST',
            ),
        job: (id: string, signal: AbortSignal) =>
            call(
                `/jobs/${z.uuid().parse(id)}`,
                KnowledgeTranslationJobResponseSchema,
                signal,
            ),
        cancel: (id: string, signal: AbortSignal) =>
            call(
                `/jobs/${z.uuid().parse(id)}/cancel`,
                KnowledgeTranslationJobResponseSchema,
                signal,
                undefined,
                'POST',
            ),
    };
}
