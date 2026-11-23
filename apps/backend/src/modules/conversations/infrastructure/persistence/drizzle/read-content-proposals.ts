import { and, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { knowledgeWorkingBranchesTable as branches } from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import { conversationContentProposalsTable as proposals } from './conversation-content-proposal-schema';
import { conversationTurnsTable as turns } from './schema';
import { contentProposalView } from './content-proposal-view';
import { completedLessonRunId } from './lesson-proposal-copy';
import {
    lessonPartsInDocument,
    loadLessonPartLayouts,
} from './lesson-proposal-parts';
import type { ConversationsTransaction } from './conversation-source';

export async function readContentProposals(
    tx: ConversationsTransaction,
    ownerId: string,
    id: string,
    proposalId?: string,
) {
    const rows = await tx
        .select({
            ...getTableColumns(proposals),
            completedRunId: completedLessonRunId(tx, ownerId),
        })
        .from(proposals)
        .where(
            and(
                eq(proposals.conversationId, id),
                proposalId ? eq(proposals.id, proposalId) : undefined,
                inArray(
                    proposals.turnId,
                    tx
                        .select({ id: turns.id })
                        .from(turns)
                        .where(eq(turns.status, 'succeeded')),
                ),
            ),
        )
        .orderBy(desc(proposals.createdAt))
        .limit(100);

    const branchRows = await tx
        .select()
        .from(branches)
        .where(eq(branches.noteId, rows[0]?.noteId ?? id));
    const byId = new Map(
        branchRows.map((branch) => [branch.id, branch.content.body.document]),
    );

    const layouts = await loadLessonPartLayouts(
        tx,
        rows.flatMap((row) => row.completedRunId ?? []),
    );

    return {
        proposals: rows.map((row) => {
            const current = byId.get(row.branchId);
            const layout = row.completedRunId
                ? layouts.get(row.completedRunId)
                : undefined;

            return contentProposalView(
                row,
                current,
                layout && current
                    ? lessonPartsInDocument(row, layout, current)
                    : undefined,
            );
        }),
    };
}
