import {
    KnowledgeContentProposalSchema,
    type KnowledgeBody,
    type LearningBlock,
    type LessonPart,
} from '@languon/contracts';
import type { conversationContentProposalsTable as proposals } from './conversation-content-proposal-schema';
import { blockContentHash, findProposalBlock } from './block-proposal-content';

/** Only top-level typed nodes are blocks; prose order is retained separately. */
export function proposalBlocks(body: KnowledgeBody): LearningBlock[] {
    return (body.document.content ?? []).flatMap((node) =>
        node.type === 'learningBlock'
            ? [node.attrs!.block as LearningBlock]
            : [],
    );
}

export function withProposalBlocks(
    body: KnowledgeBody,
    blocks: LearningBlock[],
): KnowledgeBody {
    let index = 0;

    return {
        ...body,
        document: {
            ...body.document,
            content: (body.document.content ?? []).map((node) =>
                node.type === 'learningBlock'
                    ? {
                          type: 'learningBlock',
                          attrs: { block: blocks[index++]! },
                      }
                    : node,
            ),
        },
    };
}

export function contentProposalView(
    row: typeof proposals.$inferSelect & { completedRunId: string | null },
    currentDocument?: unknown,
    lessonParts?: LessonPart[],
) {
    const captured = [...row.dependencySnapshots];
    if (row.targetSnapshot) {
        captured.push(row.targetSnapshot);
    }

    const targetStale =
        Boolean(currentDocument) &&
        captured.some((block) => {
            const current = findProposalBlock(currentDocument, block.id);

            return (
                !current ||
                blockContentHash(current) !== blockContentHash(block)
            );
        });

    return KnowledgeContentProposalSchema.parse({
        id: row.id,
        ...(row.completedRunId ? { isCompletedLesson: true } : {}),
        ...(lessonParts ? { lessonParts } : {}),
        conversationId: row.conversationId,
        turnId: row.turnId,
        ...(row.targetBlockId && row.targetSnapshot
            ? {
                  target: {
                      blockId: row.targetBlockId,
                      blockHash: blockContentHash(row.targetSnapshot),
                  },
              }
            : {}),
        targetStale,
        dependencies: row.dependencySnapshots,
        noteId: row.noteId,
        branchId: row.branchId,
        baseBranchVersion: row.baseBranchVersion,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        appliedAt: row.appliedAt?.toISOString() ?? null,
        appliedBranchVersion: row.appliedBranchVersion,
    });
}
