import { assertGenerationCapacity } from './generation-run-capacity';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
    type ApplyGenerationPlanRevisionRequest,
    type DiscardGenerationRunRequest,
    type ResolveGenerationRunSourceRequest,
} from '@languon/contracts';
import {
    compareGenerationPlans,
    generationFingerprint,
    invalidateGenerationDescendants,
} from '../../../application/generation-run-revisions';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { ConversationError } from '../../../domain/conversation';
import { conversationTransaction } from './conversation-persistence-authority';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import {
    emitGenerationRun,
    generationContext,
    generationOwnerContext,
    generationRunDetail,
    lockGenerationRun,
} from './generation-run-context';
import {
    generationRunsTable as runs,
    generationPlanRevisionsTable as revisions,
    generationRunArtifactsTable as artifacts,
    generationPlanCandidatesTable as candidates,
    generationRunMutationsTable as mutations,
    generationRunActionsTable as actions,
} from './conversation-generation-schema';
import { conversationContentProposalsTable as proposals } from './conversation-content-proposal-schema';
import { conversationEventsTable as events } from './schema';
import { captureConversationBlockTarget } from './conversation-block-target';
import {
    inspectGenerationSources,
    applyRefreshedGenerationSelection,
} from './generation-source-refresh';

type Mutation =
    | { kind: 'apply'; input: ApplyGenerationPlanRevisionRequest }
    | { kind: 'source'; input: ResolveGenerationRunSourceRequest }
    | { kind: 'discard'; input: DiscardGenerationRunRequest };

export function conversationMutateGeneration(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    conversationId: string,
    runId: string,
    mutation: Mutation,
) {
    return conversationTransaction(persistence, async (tx) => {
        await generationOwnerContext(persistence, tx, access, conversationId);
        const run = await lockGenerationRun(
            tx,
            conversationId,
            runId,
            access.ownerId,
        );
        const fingerprint = generationFingerprint(mutation);
        const [receipt] = await tx
            .select()
            .from(mutations)
            .where(
                and(
                    eq(mutations.runId, runId),
                    eq(mutations.requestId, mutation.input.requestId),
                ),
            );

        if (receipt) {
            if (receipt.fingerprint !== fingerprint) {
                throw new ConversationError(
                    'idempotency_conflict',
                    'This request identifier has already been used.',
                );
            }

            return generationRunDetail(tx, run);
        }

        if (run.revision !== mutation.input.expectedRevision) {
            throw conflict('The lesson plan changed. Review the current plan.');
        }

        if (run.state !== 'paused' || run.activeTurnId) {
            throw conflict(
                'Stop the active response before changing this lesson.',
            );
        }

        const context = await generationContext(tx, run);
        const now = persistence.now();
        if (mutation.kind === 'discard') {
            // Failed final publication can leave an intentionally hidden proposal.
            // A discarded run must not retain that private generated content either.
            await tx
                .delete(proposals)
                .where(
                    inArray(
                        proposals.turnId,
                        tx
                            .select({ id: actions.turnId })
                            .from(actions)
                            .where(eq(actions.runId, run.id)),
                    ),
                );

            await tx
                .update(actions)
                .set({ proposalId: null })
                .where(eq(actions.runId, run.id));

            await tx
                .delete(events)
                .where(
                    and(
                        eq(events.conversationId, conversationId),
                        eq(events.type, 'generation-run'),
                        sql`${events.data}->>'id' = ${run.id}`,
                    ),
                );

            await tx.delete(artifacts).where(eq(artifacts.runId, run.id));
            await tx.delete(candidates).where(eq(candidates.runId, run.id));
            await tx.delete(revisions).where(eq(revisions.runId, run.id));

            await tx
                .update(runs)
                .set({
                    state: 'discarded',
                    pauseReason: null,
                    // Model-supplied semantic IDs may themselves contain source text.
                    taskManifest: run.taskManifest.map((task, index) => ({
                        id: `discarded-task-${index + 1}`,
                        kind: task.kind,
                    })),
                    sourceSnapshot: {
                        version: 'discarded',
                        title: '',
                        description: null,
                        studiedLanguage: null,
                        provenance: 'draft',
                        material: [],
                    },
                    updatedAt: now,
                })
                .where(eq(runs.id, run.id));
        } else if (mutation.kind === 'apply') {
            const [candidate] = await tx
                .select()
                .from(candidates)
                .where(
                    and(
                        eq(candidates.id, mutation.input.candidateId),
                        eq(candidates.runId, run.id),
                        eq(candidates.baseRevision, run.revision),
                    ),
                );

            if (!candidate) {
                throw conflict('The reviewed plan is no longer available.');
            }

            assertGenerationCapacity(candidate.plan, context.sources);

            const changes = compareGenerationPlans(
                context.plan,
                candidate.plan,
            );
            const kept = new Set(changes.keptTaskIds);
            await tx.insert(revisions).values({
                runId: run.id,
                revision: run.revision + 1,
                plan: candidate.plan,
                sources: context.sources.filter((source) =>
                    candidate.plan.sources.some(
                        (item) => item.id === source.sourceId,
                    ),
                ),
                artifactIds: context.artifacts
                    .filter((artifact) => kept.has(artifact.taskId))
                    .map((artifact) => artifact.id),
                createdAt: now,
            });

            await tx
                .update(runs)
                .set({
                    revision: run.revision + 1,
                    taskManifest: candidate.plan.tasks.map(({ id, kind }) => ({
                        id,
                        kind,
                    })),
                    updatedAt: now,
                })
                .where(eq(runs.id, run.id));
        } else {
            const target = run.sourceSnapshot.blockTarget;
            if (!target) {
                throw conflict('The document source is unavailable.');
            }

            const currentTarget = await captureConversationBlockTarget(
                tx,
                run.noteId,
                target.branchId,
            );

            if (mutation.input.choice === 'refresh') {
                const { sources, changed, unavailable } =
                    applyRefreshedGenerationSelection(
                        context,
                        await inspectGenerationSources(
                            tx,
                            run.noteId,
                            target.branchId,
                            context,
                        ),
                        mutation.input,
                        currentTarget,
                    );

                if (unavailable.size) {
                    if (
                        context.plan.sources.some(
                            (source) =>
                                unavailable.has(source.id) &&
                                source.reference.kind !== 'selection',
                        )
                    ) {
                        throw conflict(
                            'A selected source block was removed. Revise the lesson plan before refreshing its sources.',
                        );
                    }

                    throw new ConversationError(
                        'source_selection_required',
                        'Select the current passage in the editor, then refresh the lesson sources.',
                    );
                }

                const invalidated = new Set(
                    context.plan.tasks
                        .filter((task) =>
                            task.inputs.some(
                                (input) =>
                                    input.kind === 'source' &&
                                    changed.has(input.sourceId),
                            ),
                        )
                        .map((task) => task.id),
                );

                invalidateGenerationDescendants(context.plan, invalidated);
                await tx.insert(revisions).values({
                    runId: run.id,
                    revision: run.revision + 1,
                    plan: context.plan,
                    sources,
                    artifactIds: context.artifacts
                        .filter((artifact) => !invalidated.has(artifact.taskId))
                        .map((artifact) => artifact.id),
                    createdAt: now,
                });
            }

            await tx
                .update(runs)
                .set({
                    revision:
                        run.revision +
                        (mutation.input.choice === 'refresh' ? 1 : 0),
                    sourceSnapshot: {
                        ...run.sourceSnapshot,
                        blockTarget: currentTarget,
                    },
                    pauseReason: 'budget',
                    updatedAt: now,
                })
                .where(eq(runs.id, run.id));
        }

        await tx.insert(mutations).values({
            runId,
            requestId: mutation.input.requestId,
            fingerprint,
            createdAt: now,
        });

        await emitGenerationRun(persistence, tx, run.id);

        return generationRunDetail(
            tx,
            await lockGenerationRun(tx, conversationId, runId, access.ownerId),
        );
    });
}
