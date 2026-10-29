import type { CopyKnowledgeBlocksRequest } from '@languon/contracts';
import type { CopyKnowledgeBlocksResponseSchema } from '@languon/contracts';
import type { z } from 'zod';
export interface KnowledgeBlockCopyStore {
    copy(
        ownerId: string,
        noteId: string,
        input: CopyKnowledgeBlocksRequest,
    ): Promise<z.infer<typeof CopyKnowledgeBlocksResponseSchema>>;
}
