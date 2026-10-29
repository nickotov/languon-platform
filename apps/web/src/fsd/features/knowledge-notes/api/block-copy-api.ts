import * as c from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { KnowledgeApiError } from '@/fsd/entities/knowledge';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';
export type KnowledgeBlockCopyContext = {
    requestWithSession: RequestWithSession;
    source: c.CopyKnowledgeBlocksRequest['source'];
    beforeCopy?(): Promise<c.CopyKnowledgeBlocksRequest['source']>;
    beforeApply?(destinationNoteId: string): Promise<void>;
    onApplied?(
        destinationNoteId: string,
        branch: c.KnowledgeWorkingBranch,
    ): void | Promise<void>;
    onApplyingChange?(busy: boolean): void;
};
export async function copyKnowledgeBlocks(
    context: KnowledgeBlockCopyContext,
    destinationNoteId: string,
    input: c.CopyKnowledgeBlocksRequest,
) {
    const noteId = c.KnowledgeNoteIdParamsSchema.parse({
        noteId: destinationNoteId,
    }).noteId;
    const body = c.CopyKnowledgeBlocksRequestSchema.parse(input);
    return context.requestWithSession(async (token) => {
        const response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/knowledge/notes/${encodeURIComponent(noteId)}/blocks/copy`,
            {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                signal: AbortSignal.timeout(30_000),
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(body),
            },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
            const error = c.KnowledgeErrorResponseSchema.safeParse(payload);
            throw new KnowledgeApiError(
                response.status,
                error.success
                    ? error.data.error
                    : {
                          code: 'internal_error',
                          message: 'The copy could not be completed.',
                          correlationId: 'block-copy-client',
                      },
            );
        }
        return c.CopyKnowledgeBlocksResponseSchema.parse(payload);
    });
}
