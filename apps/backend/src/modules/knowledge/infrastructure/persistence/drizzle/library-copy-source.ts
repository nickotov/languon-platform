import { KnowledgeBodySchema, type LearningBlock } from '@languon/contracts';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { readLearnerNote } from './learner-access';

/** Publication calls this while holding the same transaction as the destination write. */
export async function readLibraryCopyBlock(
    tx: KnowledgeTransaction,
    crypto: KnowledgeShareCrypto,
    actorId: string,
    request: { noteId: string; noteVersion: number; blockId: string },
    access?: LearnerSourceAccess,
): Promise<LearningBlock> {
    const note = await readLearnerNote(
        tx,
        crypto,
        actorId,
        request.noteId,
        access,
    );

    if (note.version !== request.noteVersion)
        throw new KnowledgeDomainError(
            'version_conflict',
            'The note changed. Preview the copy again.',
        );
    const body = KnowledgeBodySchema.parse(note.body);
    const block = body.document.content?.find(
        (node) =>
            node.type === 'learningBlock' &&
            node.attrs?.block?.id === request.blockId,
    )?.attrs?.block;

    if (!block)
        throw new KnowledgeDomainError(
            'knowledge_not_found',
            'The learning block is unavailable.',
        );

    return block;
}
