import * as c from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { KnowledgeApiError } from '@/fsd/entities/knowledge';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

export type KnowledgeLibraryContext = {
    requestWithSession: RequestWithSession;
    noteId: string;
    /** Local presentation target for a currently selected private view. */
    translationLanguage?:
        c.CopyKnowledgeTextRequest['translationLanguage'] | undefined;
    onSaved?(): void;
    access?: c.WorkbookLearningShareAccess | undefined;
} & (
    | {
          noteVersion: number;
          workingSource?: never;
          privateTranslation?: c.CopyKnowledgeTextRequest['privateTranslation'];
      }
    | {
          noteVersion?: never;
          workingSource: c.KnowledgeLibraryWorkingSource;
          resolveWorkingSource?: () => Promise<c.KnowledgeLibraryWorkingSource>;
          privateTranslation?: never;
      }
);
async function request<T>(
    context: KnowledgeLibraryContext,
    path: string,
    body: unknown,
    schema: { parse(value: unknown): T },
): Promise<T> {
    return context.requestWithSession(async (token) => {
        const access = context.access;
        const response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/knowledge/library/${path}`,
            {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                signal: AbortSignal.timeout(30_000),
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(access
                        ? {
                              'X-Languon-Share-Kind': access.kind,
                              'X-Languon-Share-Locator': access.locator,
                              'X-Languon-Share-Key': access.key,
                          }
                        : {}),
                },
                body: JSON.stringify(body),
            },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
            const parsed = c.KnowledgeErrorResponseSchema.safeParse(payload);
            throw new KnowledgeApiError(
                response.status,
                parsed.success
                    ? parsed.data.error
                    : {
                          code: 'internal_error',
                          message: 'Library copy failed.',
                          correlationId: 'library-client',
                      },
            );
        }
        return schema.parse(payload);
    });
}
export const libraryCopyApi = {
    previewVocabulary: (
        context: KnowledgeLibraryContext,
        input: c.CopyKnowledgeVocabularyRequest,
    ) =>
        request(
            context,
            'vocabulary/preview',
            c.CopyKnowledgeVocabularyRequestSchema.parse(input),
            c.KnowledgeVocabularyPreviewSchema,
        ),
    copyVocabulary: (
        context: KnowledgeLibraryContext,
        input: c.CopyKnowledgeVocabularyRequest,
    ) =>
        request(
            context,
            'vocabulary/copy',
            c.CopyKnowledgeVocabularyRequestSchema.parse(input),
            c.CopyKnowledgeVocabularyResponseSchema,
        ),
    previewText: (
        context: KnowledgeLibraryContext,
        input: c.CopyKnowledgeTextRequest,
    ) =>
        request(
            context,
            'text/preview',
            c.CopyKnowledgeTextRequestSchema.parse(input),
            c.KnowledgeTextLibraryPreviewSchema,
        ),
    copyText: (
        context: KnowledgeLibraryContext,
        input: c.CopyKnowledgeTextRequest,
    ) =>
        request(
            context,
            'text/copy',
            c.CopyKnowledgeTextRequestSchema.parse(input),
            c.CopyKnowledgeTextResponseSchema,
        ),
};
