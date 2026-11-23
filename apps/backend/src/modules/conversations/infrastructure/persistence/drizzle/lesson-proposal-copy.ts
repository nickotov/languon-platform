import { and, eq, sql } from 'drizzle-orm';
import {
    KnowledgeBodySchema,
    type LessonCopy,
    type LessonPart,
} from '@languon/contracts';
import { generationFingerprint } from '../../../application/generation-run-revisions';
import {
    ConversationError,
    conversationUnavailable,
} from '../../../domain/conversation';
import { knowledgeWorkingBranchesTable as branches } from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import { assertKnowledgeMediaGrants } from '../../../../knowledge/infrastructure/persistence/drizzle/media-grants';
import {
    generationRunMutationsTable as mutations,
    generationRunsTable as runs,
} from './conversation-generation-schema';
import { conversationContentProposalsTable as proposals } from './conversation-content-proposal-schema';
import { conflict } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import { lessonCopyNodes } from './lesson-copy-nodes';
import { insertProposalNodes } from './block-proposal-insertion';

type LessonCopyInput = {
    proposal: typeof proposals.$inferSelect;
    branch: typeof branches.$inferSelect;
    completedRunId: string | null;
    parts: LessonPart[];
    expectedBranchVersion: number;
    position: number | undefined;
    selection: LessonCopy;
    now: Date;
};

/** Correlate the proposal to its owner's completed run in the same read snapshot. */
export function completedLessonRunId(
    tx: ConversationsTransaction,
    ownerId: string,
) {
    const run = tx
        .select({ id: runs.id })
        .from(runs)
        .where(
            and(
                eq(runs.ownerId, ownerId),
                eq(runs.proposalId, proposals.id),
                eq(runs.state, 'completed'),
                eq(runs.conversationId, proposals.conversationId),
                eq(runs.noteId, proposals.noteId),
            ),
        )
        .limit(1);

    return sql<string | null>`(${run})`;
}

/** Caller locks the owner note, working branch and proposal for this transaction. */
export async function copyCompletedLesson(
    tx: ConversationsTransaction,
    input: LessonCopyInput,
) {
    const {
        proposal,
        branch,
        selection,
        position,
        expectedBranchVersion,
        now,
    } = input;
    const runId = input.completedRunId;
    if (!runId) {
        throw conversationUnavailable();
    }

    const fingerprint = generationFingerprint({
        kind: 'insert-lesson',
        proposalId: proposal.id,
        branchId: branch.id,
        expectedBranchVersion,
        taskId: selection.taskId,
        position,
    });
    const [receipt] = await tx
        .select()
        .from(mutations)
        .where(
            and(
                eq(mutations.runId, runId),
                eq(mutations.requestId, selection.requestId),
            ),
        );

    if (receipt) {
        if (receipt.fingerprint !== fingerprint) {
            throw new ConversationError(
                'idempotency_conflict',
                'This request identifier has already been used.',
            );
        }

        return branch;
    }

    if (branch.version !== expectedBranchVersion) {
        throw conflict(
            'The working document changed. Review it before applying.',
        );
    }

    const current = branch.content.body.document;
    const nodes = lessonCopyNodes(
        proposal,
        input.parts,
        current,
        selection.taskId,
    );
    const saveReceipt = () =>
        tx.insert(mutations).values({
            runId,
            requestId: selection.requestId,
            fingerprint,
            createdAt: now,
        });

    // A second deliberate click on already-present material is a successful no-op.
    if (!nodes.length) {
        await saveReceipt();

        return branch;
    }

    const document =
        position === undefined
            ? { ...current, content: [...(current.content ?? []), ...nodes] }
            : insertProposalNodes(current, nodes, position);
    const parsed = KnowledgeBodySchema.safeParse({
        schemaVersion: 2,
        document,
    });

    if (!parsed.success) {
        throw new ConversationError(
            'invalid_request',
            'The lesson material cannot be added to this draft.',
        );
    }

    await assertKnowledgeMediaGrants(tx, proposal.noteId, parsed.data);
    const [updated] = await tx
        .update(branches)
        .set({
            content: { ...branch.content, body: parsed.data },
            version: branch.version + 1,
            updatedAt: now,
        })
        .where(eq(branches.id, branch.id))
        .returning();

    await saveReceipt();

    return updated!;
}
