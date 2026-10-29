import { isReadOnlyKnowledgeSource } from '../../../domain/conversation';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
    KnowledgeBlockProposalSchema,
    KnowledgeBodySchema,
    KnowledgeWorkingBranchSchema,
    LearningBlockProposalInputSchema,
    type LearningBlock,
    type LearningBlockProposalInput,
} from '@languon/contracts';
import type {
    ConversationAccess,
    ClaimedConversationTurn,
} from '../../../application/ports/conversation-store';
import { conversationUnavailable } from '../../../domain/conversation';
import {
    knowledgeNotesTable,
    knowledgeWorkingBranchesTable as branches,
} from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import { assertKnowledgeMediaGrants } from '../../../../knowledge/infrastructure/persistence/drizzle/media-grants';
import {
    conversationAuthorize,
    conversationTransaction,
} from './conversation-persistence-authority';
import { conversationWithOperation } from './conversation-worker-authority';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import { conversationBlockProposalsTable as proposals } from './conversation-block-proposal-schema';

function view(row: typeof proposals.$inferSelect) {
    return KnowledgeBlockProposalSchema.parse({
        id: row.id,
        conversationId: row.conversationId,
        noteId: row.noteId,
        branchId: row.branchId,
        baseBranchVersion: row.baseBranchVersion,
        blocks: row.blocks,
        createdAt: row.createdAt.toISOString(),
        appliedAt: row.appliedAt?.toISOString() ?? null,
        appliedBranchVersion: row.appliedBranchVersion,
    });
}

function freshBlocks(blocks: LearningBlock[]): LearningBlock[] {
    const ids = new Map<string, string>();
    const find = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(find);

            return;
        }

        if (!value || typeof value !== 'object') return;
        const object = value as Record<string, unknown>;
        if (typeof object.id === 'string') ids.set(object.id, randomUUID());
        Object.values(object).forEach(find);
    };

    find(blocks);
    const remap = (value: unknown, key?: string): unknown => {
        if (Array.isArray(value))
            return value.map((child) => remap(child, key));
        if (
            typeof value === 'string' &&
            key &&
            [
                'id',
                'blockId',
                'sourceSegmentId',
                'segmentIds',
                'correctChoiceId',
            ].includes(key)
        )
            return ids.get(value) ?? value;
        if (!value || typeof value !== 'object') return value;

        return Object.fromEntries(
            Object.entries(value).map(([name, child]) => [
                name,
                remap(child, name),
            ]),
        );
    };

    return LearningBlockProposalInputSchema.parse({ blocks: remap(blocks) })
        .blocks;
}

async function ownerContext(
    persistence: ConversationPersistenceContext,
    tx: Parameters<typeof conversationAuthorize>[1],
    access: ConversationAccess,
    id: string,
) {
    const authorized = await conversationAuthorize(persistence, tx, access, id);
    if (
        authorized.chat.source.kind !== 'knowledge' ||
        isReadOnlyKnowledgeSource(authorized.chat.source) ||
        authorized.authority.sourceOwnerId !== access.ownerId
    )
        throw conflict('Only the document owner can use block proposals.');

    return authorized;
}

export async function conversationProposeBlocks(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    input: LearningBlockProposalInput,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        const target = turn.sourceSnapshot.blockTarget;
        if (
            turn.source.kind !== 'knowledge' ||
            isReadOnlyKnowledgeSource(turn.source) ||
            turn.authority.sourceOwnerId !== turn.ownerId ||
            !target
        )
            throw conflict(
                'This conversation has no authorized block proposal target.',
            );
        const [branch] = await tx
            .select({ id: branches.id, version: branches.version })
            .from(branches)
            .where(
                and(
                    eq(branches.id, target.branchId),
                    eq(branches.noteId, turn.source.id),
                ),
            )
            .for('update');

        if (!branch || branch.version !== target.version)
            throw conflict(
                'The working document changed during generation. Request a new proposal.',
            );
        const blocks = freshBlocks(
            LearningBlockProposalInputSchema.parse(input).blocks,
        );
        // A worker can propose only against its active admitted turn. It never
        // reads private branch bodies or other conversations' proposals.
        const result = await tx
            .execute(
                sql`
            select public.languon_propose_learning_blocks(
                ${turn.id}::uuid, ${turn.leaseToken}::uuid,
                ${JSON.stringify(blocks)}::jsonb
            ) as id
        `,
            )
            .catch((error: unknown) => {
                const cause = error instanceof Error ? error.cause : undefined;
                const duplicate = [error, cause].some(
                    (value) =>
                        value !== null &&
                        typeof value === 'object' &&
                        'code' in value &&
                        value.code === '23505',
                );

                // Drizzle errors include SQL parameters: never expose draft blocks
                // or private turn leases to model/tool messages or application logs.
                throw conflict(
                    duplicate
                        ? 'A block proposal was already generated for this response.'
                        : 'The proposal target is unavailable. Reload the note and request a new proposal.',
                );
            });
        const id = result[0]?.['id'];
        if (typeof id !== 'string')
            throw conflict('The proposal was not created.');

        return { id };
    });
}

export async function conversationListBlockProposals(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
) {
    return conversationTransaction(
        persistence,
        async (tx) => {
            await ownerContext(persistence, tx, access, id);
            const rows = await tx
                .select()
                .from(proposals)
                .where(eq(proposals.conversationId, id))
                .orderBy(desc(proposals.createdAt))
                .limit(100);

            return { proposals: rows.map(view) };
        },
        false,
    );
}

export async function conversationApplyBlockProposal(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    proposalId: string,
    expectedBranchVersion: number,
) {
    return conversationTransaction(persistence, async (tx) => {
        const { chat } = await ownerContext(persistence, tx, access, id);
        const [proposal] = await tx
            .select()
            .from(proposals)
            .where(
                and(
                    eq(proposals.id, proposalId),
                    eq(proposals.conversationId, id),
                    eq(proposals.noteId, chat.sourceId),
                ),
            )
            .for('update');

        if (!proposal) throw conversationUnavailable();
        const [note] = await tx
            .select()
            .from(knowledgeNotesTable)
            .where(
                and(
                    eq(knowledgeNotesTable.id, proposal.noteId),
                    eq(knowledgeNotesTable.ownerId, access.ownerId),
                ),
            )
            .for('update');
        const [branch] = await tx
            .select()
            .from(branches)
            .where(
                and(
                    eq(branches.id, proposal.branchId),
                    eq(branches.noteId, proposal.noteId),
                ),
            )
            .for('update');

        if (!note || !branch) throw conversationUnavailable();
        if (proposal.appliedAt)
            return {
                proposal: view(proposal),
                branch: KnowledgeWorkingBranchSchema.parse({
                    ...branch,
                    updatedAt: branch.updatedAt.toISOString(),
                }),
            };
        if (
            expectedBranchVersion !== proposal.baseBranchVersion ||
            branch.version !== proposal.baseBranchVersion
        )
            throw conflict(
                'The working document changed. Review it and request a new proposal.',
            );
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    ...(branch.content.body.document.content ?? []),
                    ...proposal.blocks.map((block) => ({
                        type: 'learningBlock',
                        attrs: { block },
                    })),
                ],
            },
        });

        await assertKnowledgeMediaGrants(tx, proposal.noteId, body);
        const now = persistence.now();
        const [updatedBranch] = await tx
            .update(branches)
            .set({
                content: { ...branch.content, body },
                version: branch.version + 1,
                updatedAt: now,
            })
            .where(eq(branches.id, branch.id))
            .returning();
        const [applied] = await tx
            .update(proposals)
            .set({
                appliedAt: now,
                appliedBranchVersion: updatedBranch!.version,
            })
            .where(eq(proposals.id, proposal.id))
            .returning();

        return {
            proposal: view(applied!),
            branch: KnowledgeWorkingBranchSchema.parse({
                ...updatedBranch!,
                updatedAt: updatedBranch!.updatedAt.toISOString(),
            }),
        };
    });
}
