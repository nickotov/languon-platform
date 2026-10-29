import { and, eq } from 'drizzle-orm';
import { knowledgeWorkingBranchesTable as branches } from './schema';
import { getOwnedKnowledgeRow } from './knowledge-transaction';
import {
    KnowledgeBodySchema,
    type LearningBlock,
    type KnowledgeBody,
    type CopyKnowledgeVocabularyRequest,
} from '@languon/contracts';
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
    request: Pick<
        CopyKnowledgeVocabularyRequest,
        'noteId' | 'noteVersion' | 'blockId' | 'workingSource'
    >,
    access?: LearnerSourceAccess,
): Promise<LearningBlock> {
    let body: KnowledgeBody;
    if (request.workingSource) {
        if (request.noteVersion !== undefined || access)
            throw new KnowledgeDomainError(
                'invalid_request',
                'Working copies require an owned working source only.',
            );
        await getOwnedKnowledgeRow(tx, actorId, request.noteId);
        const [branch] = await tx
            .select()
            .from(branches)
            .where(
                and(
                    eq(branches.id, request.workingSource.branchId),
                    eq(branches.noteId, request.noteId),
                ),
            )
            .for('share');

        if (!branch)
            throw new KnowledgeDomainError(
                'knowledge_not_found',
                'The working source is unavailable.',
            );
        if (branch.version !== request.workingSource.expectedVersion)
            throw new KnowledgeDomainError(
                'version_conflict',
                'The working material changed. Preview the copy again.',
            );
        body = KnowledgeBodySchema.parse(branch.content.body);
    } else {
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
        body = KnowledgeBodySchema.parse(note.body);
    }

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
