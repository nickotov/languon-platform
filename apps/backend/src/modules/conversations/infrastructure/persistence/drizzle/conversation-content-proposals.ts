import { DrizzleActionAccountingParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { conversationTurnsTable as turns } from './schema';
import { isReadOnlyKnowledgeSource } from '../../../domain/conversation';
import { assertReferencedProposalTarget } from '../../../application/conversation-block-references';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
    KnowledgeContentProposalSchema,
    KnowledgeBodySchema,
    KnowledgeWorkingBranchSchema,
    LearningContentProposalInputSchema,
    type LearningContentProposalInput,
    type KnowledgeBody,
    type LearningBlock,
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
import { conversationContentProposalsTable as proposals } from './conversation-content-proposal-schema';
import {
    blockContentHash,
    findProposalBlock,
    freshProposalBlocks,
    replaceProposalBlock,
} from './block-proposal-content';
import { insertProposalBlocks } from './block-proposal-insertion';
import type { ConversationsTransaction } from './conversation-source';

/** Only top-level typed nodes are blocks; prose order is retained separately. */
function proposalBlocks(body: KnowledgeBody): LearningBlock[] {
    return (body.document.content ?? []).flatMap((node) =>
        node.type === 'learningBlock'
            ? [node.attrs!.block as LearningBlock]
            : [],
    );
}

function withProposalBlocks(
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

function view(row: typeof proposals.$inferSelect, currentDocument?: unknown) {
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
    ) {
        throw conflict('Only the document owner can use block proposals.');
    }

    return authorized;
}

/** Every caller, including a revision cohort, keeps the canonical privileged guards. */
async function proposeContentInTransaction(
    tx: ConversationsTransaction,
    turn: ClaimedConversationTurn,
    input: LearningContentProposalInput,
    signal?: AbortSignal,
) {
    signal?.throwIfAborted();
    const target = turn.sourceSnapshot.blockTarget;
    if (
        turn.source.kind !== 'knowledge' ||
        isReadOnlyKnowledgeSource(turn.source) ||
        turn.authority.sourceOwnerId !== turn.ownerId ||
        !target
    ) {
        throw conflict(
            'This conversation has no authorized block proposal target.',
        );
    }

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

    if (!branch || branch.version !== target.version) {
        throw conflict(
            'The working document changed during generation. Request a new proposal.',
        );
    }

    const parsed = LearningContentProposalInputSchema.parse(input);
    assertReferencedProposalTarget(turn.sourceSnapshot, parsed.targetBlockId);

    const blocks = parsed.targetBlockId
        ? proposalBlocks(parsed.body).map((block) => ({
              ...block,
              id: parsed.targetBlockId!,
          }))
        : freshProposalBlocks(proposalBlocks(parsed.body));
    const body = withProposalBlocks(parsed.body, blocks);

    // A worker can propose only against its active admitted turn. It never
    // reads private branch bodies or other conversations' proposals.
    const result = await tx
        .execute(
            sql`
        select public.languon_propose_learning_content_change(
            ${turn.id}::uuid, ${turn.leaseToken}::uuid,
            ${JSON.stringify(body)}::jsonb, ${parsed.targetBlockId ?? null}::uuid
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
    if (typeof id !== 'string') {
        throw conflict('The proposal was not created.');
    }

    // Validate the complete persisted fragment, including captured dependencies,
    // before committing. A malformed or oversized aggregate rolls back publication.
    const snapshot =
        await tx.execute(sql`select public.languon_read_learning_content_proposal(
        ${turn.id}::uuid, ${turn.leaseToken}::uuid, ${id}::uuid
    ) as snapshot`);

    KnowledgeContentProposalSchema.parse(snapshot[0]?.['snapshot']);

    return { id };
}

export async function conversationProposeContentBatch(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    inputs: LearningContentProposalInput[],
    signal?: AbortSignal,
    validationIds?: string[],
) {
    signal?.throwIfAborted();
    const parsed = LearningContentProposalInputSchema.array()
        .min(1)
        .max(8)
        .parse(inputs);

    if (
        new Set(parsed.map((input) => input.targetBlockId ?? 'append')).size !==
        parsed.length
    ) {
        throw conflict(
            'Each proposal target must appear exactly once in a publication.',
        );
    }

    return conversationWithOperation(persistence, turn, async (tx) => {
        const receipts: { id: string }[] = [];
        for (const input of parsed) {
            signal?.throwIfAborted();
            receipts.push(
                await proposeContentInTransaction(tx, turn, input, signal),
            );
        }

        // Receipt eligibility and the complete proposal cohort commit together.
        // Stop cannot retain reusable output while excluding its validated calls.
        const accounting = new DrizzleActionAccountingParticipant(tx);
        for (const validationId of new Set(validationIds ?? [])) {
            await accounting.acceptStructuredValidation({
                actionId: turn.id,
                ownerId: turn.ownerId,
                leaseToken: turn.leaseToken,
                validationId,
            });
        }

        // This check remains inside the transaction: cancellation after any
        // successful member rolls the complete unpublished cohort back.
        signal?.throwIfAborted();

        return receipts;
    });
}

export async function conversationProposeContent(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    input: LearningContentProposalInput,
    signal?: AbortSignal,
    validationIds?: string[],
) {
    const [receipt] = await conversationProposeContentBatch(
        persistence,
        turn,
        [input],
        signal,
        validationIds,
    );

    return receipt!;
}

export async function conversationListContentProposals(
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
                .where(
                    and(
                        eq(proposals.conversationId, id),
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
                branchRows.map((branch) => [
                    branch.id,
                    branch.content.body.document,
                ]),
            );

            return {
                proposals: rows.map((row) => view(row, byId.get(row.branchId))),
            };
        },
        false,
    );
}

export async function conversationApplyContentProposal(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    proposalId: string,
    expectedBranchVersion: number,
    mode: 'proposal' | 'add-separately' = 'proposal',
    insertionPosition?: number,
) {
    if (insertionPosition !== undefined && mode !== 'add-separately') {
        throw conflict('Cursor insertion requires adding an independent copy.');
    }

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
                    inArray(
                        proposals.turnId,
                        tx
                            .select({ id: turns.id })
                            .from(turns)
                            .where(eq(turns.status, 'succeeded')),
                    ),
                ),
            )
            .for('update');

        if (!proposal) {
            throw conversationUnavailable();
        }

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

        if (!note || !branch) {
            throw conversationUnavailable();
        }

        if (proposal.appliedAt) {
            return {
                proposal: view(proposal),
                branch: KnowledgeWorkingBranchSchema.parse({
                    ...branch,
                    updatedAt: branch.updatedAt.toISOString(),
                }),
            };
        }

        if (branch.version !== expectedBranchVersion) {
            throw conflict(
                'The working document changed. Review it before applying.',
            );
        }

        const isUpdate = Boolean(
            proposal.targetBlockId && proposal.targetSnapshot,
        );

        if (mode === 'proposal') {
            for (const captured of proposal.dependencySnapshots) {
                const current = findProposalBlock(
                    branch.content.body.document,
                    captured.id,
                );

                if (
                    !current ||
                    blockContentHash(current) !== blockContentHash(captured)
                ) {
                    throw conflict(
                        'The source passage changed. Request a new proposal or add it separately with its captured source.',
                    );
                }
            }
        }

        let document: unknown;
        let appliedBody = proposal.body;
        let appliedDependencies = proposal.dependencySnapshots;
        const blocks = proposalBlocks(proposal.body);
        if (isUpdate && mode === 'proposal') {
            const current = findProposalBlock(
                branch.content.body.document,
                proposal.targetBlockId!,
            );

            if (
                !current ||
                blockContentHash(current) !==
                    blockContentHash(proposal.targetSnapshot!)
            ) {
                throw conflict(
                    'The target block changed. Request a new proposal or add it separately.',
                );
            }

            const replacement = blocks[0]!;
            if (current.type !== replacement.type || blocks.length !== 1) {
                throw conflict('An update must keep the existing block type.');
            }

            document = replaceProposalBlock(
                branch.content.body.document,
                current.id,
                { ...replacement, id: current.id },
            );
        } else {
            const sources =
                mode === 'add-separately' ? proposal.dependencySnapshots : [];
            const added =
                mode === 'add-separately'
                    ? freshProposalBlocks([...sources, ...blocks])
                    : blocks;

            const mixed = proposal.body.document.content?.some(
                (node) => node.type !== 'learningBlock',
            );

            if (mode === 'add-separately' && mixed) {
                throw conflict(
                    'Mixed content must be inserted as the complete proposal.',
                );
            }

            appliedBody = withProposalBlocks(
                proposal.body,
                added.slice(sources.length),
            );

            if (mode === 'add-separately') {
                appliedDependencies = added.slice(0, sources.length);
            }

            document =
                insertionPosition !== undefined
                    ? insertProposalBlocks(
                          branch.content.body.document,
                          added,
                          insertionPosition,
                      )
                    : {
                          ...branch.content.body.document,
                          content: [
                              ...(branch.content.body.document.content ?? []),
                              ...added
                                  .slice(0, sources.length)
                                  .map((block) => ({
                                      type: 'learningBlock',
                                      attrs: { block },
                                  })),
                              ...(appliedBody.document.content ?? []),
                          ],
                      };
        }

        const body = KnowledgeBodySchema.parse({ schemaVersion: 2, document });

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
                body: appliedBody,
                dependencySnapshots: appliedDependencies,
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
