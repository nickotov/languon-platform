import { lessonCopyNodes } from './lesson-copy-nodes';
import { readContentProposals } from './read-content-proposals';
import {
    contentProposalView,
    proposalBlocks,
    withProposalBlocks,
} from './content-proposal-view';
import {
    loadLessonPartLayouts,
    lessonPartsInDocument,
} from './lesson-proposal-parts';
import {
    completedLessonRunId,
    copyCompletedLesson,
} from './lesson-proposal-copy';
import { DrizzleActionAccountingParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { conversationTurnsTable as turns } from './schema';
import { isReadOnlyKnowledgeSource } from '../../../domain/conversation';
import { assertReferencedProposalTarget } from '../../../application/conversation-block-references';
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import {
    KnowledgeContentProposalSchema,
    KnowledgeBodySchema,
    KnowledgeWorkingBranchSchema,
    LearningContentProposalInputSchema,
    type LearningContentProposalInput,
    type LessonCopy,
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
    proposalId?: string,
) {
    return conversationTransaction(
        persistence,
        async (tx) => {
            await ownerContext(persistence, tx, access, id);

            return readContentProposals(tx, access.ownerId, id, proposalId);
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
    mode: 'proposal' | 'add-separately' | 'insert-lesson' = 'proposal',
    insertionPosition?: number,
    lessonCopy?: LessonCopy,
) {
    if (insertionPosition !== undefined && mode === 'proposal') {
        throw conflict('Cursor insertion requires adding an independent copy.');
    }

    return conversationTransaction(persistence, async (tx) => {
        const { chat } = await ownerContext(persistence, tx, access, id);
        const [proposal] = await tx
            .select({
                ...getTableColumns(proposals),
                completedRunId: completedLessonRunId(tx, access.ownerId),
            })
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

        const layout = proposal.completedRunId
            ? (await loadLessonPartLayouts(tx, [proposal.completedRunId])).get(
                  proposal.completedRunId,
              )
            : undefined;
        const partsFor = (body: typeof branch.content.body) =>
            layout
                ? lessonPartsInDocument(proposal, layout, body.document)
                : undefined;

        if (mode === 'insert-lesson') {
            if (!lessonCopy) {
                throw conflict('Choose a lesson material to insert.');
            }

            const updated = await copyCompletedLesson(tx, {
                proposal,
                branch,
                completedRunId: proposal.completedRunId,
                expectedBranchVersion,
                selection: lessonCopy,
                parts: partsFor(branch.content.body) ?? [],
                position: insertionPosition,
                now: persistence.now(),
            });

            return {
                proposal: contentProposalView(
                    proposal,
                    updated.content.body.document,
                    partsFor(updated.content.body),
                ),
                branch: KnowledgeWorkingBranchSchema.parse({
                    ...updated,
                    updatedAt: updated.updatedAt.toISOString(),
                }),
            };
        }

        if (proposal.appliedAt) {
            return {
                proposal: contentProposalView(
                    proposal,
                    branch.content.body.document,
                    partsFor(branch.content.body),
                ),
                branch: KnowledgeWorkingBranchSchema.parse({
                    ...branch,
                    updatedAt: branch.updatedAt.toISOString(),
                }),
            };
        }

        // Generic independent apply rewrites the proposal's IDs as a one-shot receipt.
        // A completed lesson must stay available with its original IDs for every copy.
        if (mode === 'add-separately' && proposal.completedRunId) {
            throw conflict(
                'Insert the lesson material from the completed lesson review.',
            );
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
        if (layout) {
            const current = branch.content.body.document;
            const nodes = lessonCopyNodes(
                proposal,
                partsFor(branch.content.body)!,
                current,
            );

            document = {
                ...current,
                content: [...(current.content ?? []), ...nodes],
            };
        } else if (isUpdate && mode === 'proposal') {
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
            proposal: contentProposalView(
                {
                    ...applied!,
                    completedRunId: proposal.completedRunId,
                },
                updatedBranch!.content.body.document,
                partsFor(updatedBranch!.content.body),
            ),
            branch: KnowledgeWorkingBranchSchema.parse({
                ...updatedBranch!,
                updatedAt: updatedBranch!.updatedAt.toISOString(),
            }),
        };
    });
}
