import { generationStageHasProgress } from './generation-stage-progress';
import { captureGenerationSources } from './generation-source-capture';
import { createGenerationAuthorization } from './generation-run-authorization';
import { assertGenerationCapacity } from './generation-run-capacity';
import { DrizzleActionAccountingParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import {
    conversationTurnsTable as turns,
    conversationMemoryTable as memory,
} from './schema';
import { tutorRequestStateKey } from '../../../application/tutor-request-contract';
import { conversationEvent } from './conversation-events';
import { turnView } from './conversation-persistence-context';
import { randomUUID } from 'node:crypto';
import {
    GenerationPlanSchema,
    KnowledgeContentFragmentSchema,
    type GenerationPlan,
    type LearningContentProposalInput,
} from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
    generationFingerprint,
    generationTaskFingerprints,
} from '../../../application/generation-run-revisions';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import type {
    GenerationArtifact,
    GenerationSourceSnapshot,
} from '../../../application/ports/generation-run';
import { generationValidationVersion } from '../../../application/ports/generation-run';
import { isReadOnlyKnowledgeSource } from '../../../domain/conversation';
import { conversationWithOperation } from './conversation-worker-authority';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import {
    generationContext,
    generationTurnContext,
    emitGenerationRun,
} from './generation-run-context';
import {
    generationRunsTable as runs,
    generationPlanRevisionsTable as revisions,
    generationRunArtifactsTable as artifacts,
    generationRunActionsTable as actions,
    generationPlanCandidatesTable as candidates,
} from './conversation-generation-schema';

const artifactSchema = z
    .object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        taskId: z.string().min(1).max(80),
        batchKey: z.string().min(1).max(160),
        taskComplete: z.boolean(),
        body: KnowledgeContentFragmentSchema,
        contentHash: z.string(),
        requirementsHash: z.string(),
        sourceHash: z.string(),
        validationVersion: z.literal(generationValidationVersion),
    })
    .strict();

export function conversationGenerationContext(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
) {
    return conversationWithOperation(
        persistence,
        turn,
        async (tx) => (await generationTurnContext(tx, turn))?.context,
    );
}

/** The prepared-plan entry point shares exactly the admitted worker authority of chat. */
export function conversationStartGeneration(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    candidate: GenerationPlan,
    evidence: GenerationSourceSnapshot[],
    validationIds?: string[],
) {
    const plan = GenerationPlanSchema.parse(candidate);
    const sources = captureGenerationSources(turn, plan, evidence);

    assertGenerationCapacity(plan, sources);

    return conversationWithOperation(persistence, turn, async (tx) => {
        if (
            turn.source.kind !== 'knowledge' ||
            isReadOnlyKnowledgeSource(turn.source) ||
            !turn.sourceSnapshot.blockTarget ||
            turn.authority.sourceOwnerId !== turn.ownerId
        ) {
            throw conflict(
                'This conversation cannot generate document content.',
            );
        }

        if (turn.execution.actionAccountingVersion === 1) {
            for (const validationId of validationIds ?? []) {
                await new DrizzleActionAccountingParticipant(
                    tx,
                ).acceptStructuredValidation({
                    actionId: turn.id,
                    ownerId: turn.ownerId,
                    leaseToken: turn.leaseToken,
                    validationId,
                });
            }
        }

        const existing = await generationTurnContext(tx, turn);
        if (existing) {
            if (
                generationFingerprint(existing.context.plan) !==
                generationFingerprint(plan)
            ) {
                throw conflict(
                    'The active plan cannot be replaced during generation.',
                );
            }

            return existing.context;
        }

        // A durable run becomes the sole authority for unfinished work. Transfer
        // ownership atomically so Stop/failure cannot retain replayable private
        // plan sources in the conversational planner cache.
        await tx
            .update(memory)
            .set({
                value: sql`(${memory.value} - 'pending' - 'pendingSources' - 'pendingProposalIds' - 'pendingExplanationOverrides') || '{"pending":null}'::jsonb`,
                updatedAt: persistence.now(),
            })
            .where(
                and(
                    eq(memory.conversationId, turn.conversationId),
                    eq(memory.key, tutorRequestStateKey),
                ),
            );

        const now = persistence.now();
        const runId = randomUUID();
        const [run] = await tx
            .insert(runs)
            .values({
                id: runId,
                conversationId: turn.conversationId,
                ownerId: turn.ownerId,
                noteId: turn.source.id,
                revision: 1,
                state: 'running',
                pauseReason:
                    plan.tasks.some((task) => task.kind === 'audio') &&
                    turn.execution.permitsListeningRecording !== true
                        ? 'recording-confirmation'
                        : null,
                taskManifest: plan.tasks.map(({ id, kind }) => ({ id, kind })),
                activeTurnId: turn.id,
                automation: await createGenerationAuthorization(
                    tx,
                    turn,
                    1,
                    now,
                    {
                        runId,
                        revision: 1,
                        plan,
                        sources,
                        artifacts: [],
                        purpose: 'generation',
                    },
                ),
                sourceSnapshot: turn.sourceSnapshot,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        await tx.insert(revisions).values({
            runId: run!.id,
            revision: 1,
            plan,
            sources,
            artifactIds: [],
            createdAt: now,
        });

        await tx.insert(actions).values({
            turnId: turn.id,
            runId: run!.id,
            revision: 1,
            kind: 'generation',
            createdAt: now,
        });

        const [updatedTurn] = await tx
            .update(turns)
            .set({ generationRunId: run!.id })
            .where(eq(turns.id, turn.id))
            .returning();

        await conversationEvent(
            persistence,
            tx,
            turn.conversationId,
            'turn',
            turnView(updatedTurn!),
        );

        await emitGenerationRun(persistence, tx, run!.id);

        return generationContext(tx, run!);
    });
}

export function conversationCheckpointGeneration(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    values: GenerationArtifact[],
    validationId: string,
) {
    const parsed = artifactSchema.array().min(1).max(25).parse(values);
    z.string().min(1).max(200).parse(validationId);

    return conversationWithOperation(persistence, turn, async (tx) => {
        const active = await generationTurnContext(tx, turn);
        if (!active || active.action.kind !== 'generation') {
            throw conflict('No generation action is active.');
        }

        const { context, run } = active;
        const attempt = context.unitAttempts?.find(
            (item) => item.validationId === validationId,
        );

        if (
            attempt &&
            (attempt.turnId !== turn.id ||
                (attempt.outcome !== 'started' &&
                    attempt.outcome !== 'accepted') ||
                !parsed.some((artifact) => artifact.taskId === attempt.taskId))
        ) {
            throw conflict(
                'This checkpoint does not match the active lesson candidate.',
            );
        }

        const accumulated = [...context.artifacts];
        for (const value of parsed) {
            if (value.revision !== run.revision) {
                throw conflict(
                    'The generated result belongs to an obsolete plan revision.',
                );
            }

            const task = context.plan.tasks.find(
                (item) => item.id === value.taskId,
            );

            if (!task) {
                throw conflict(
                    'The generated task does not belong to this plan.',
                );
            }

            const existing = accumulated.find(
                (item) =>
                    item.taskId === value.taskId &&
                    item.batchKey === value.batchKey,
            );

            if (existing) {
                if (
                    existing.id !== value.id ||
                    existing.contentHash !== generationFingerprint(value.body)
                ) {
                    throw conflict(
                        'The checkpoint conflicts with a completed result.',
                    );
                }

                continue;
            }

            if (
                accumulated.some(
                    (item) => item.taskId === task.id && item.taskComplete,
                )
            ) {
                throw conflict('This task has already completed.');
            }

            if (
                task.inputs.some(
                    (input) =>
                        input.kind === 'task' &&
                        !accumulated.some(
                            (artifact) =>
                                artifact.taskId === input.taskId &&
                                artifact.taskComplete,
                        ),
                )
            ) {
                throw conflict(
                    'The generated task dependencies are incomplete.',
                );
            }

            const artifact: GenerationArtifact = {
                ...value,
                contentHash: generationFingerprint(value.body),
                ...generationTaskFingerprints(
                    context.plan,
                    task.id,
                    context.sources,
                    accumulated,
                ),
            };

            accumulated.push(artifact);
            if (
                JSON.stringify([
                    ...new Map(
                        accumulated.map((item) => [item.taskId, item.body]),
                    ).values(),
                ]).length > 100_000
            ) {
                throw conflict('The generated content is too large.');
            }

            await tx.insert(artifacts).values({
                id: artifact.id,
                runId: run.id,
                revision: run.revision,
                turnId: turn.id,
                taskId: artifact.taskId,
                batchKey: artifact.batchKey,
                artifact,
                createdAt: persistence.now(),
            });
        }

        if (turn.execution.actionAccountingVersion === 1) {
            await new DrizzleActionAccountingParticipant(
                tx,
            ).acceptStructuredValidation({
                actionId: turn.id,
                ownerId: turn.ownerId,
                leaseToken: turn.leaseToken,
                validationId,
            });
        }

        await tx
            .update(revisions)
            .set({
                artifactIds: accumulated.map((artifact) => artifact.id),
                unitAttempts: (context.unitAttempts ?? []).map((attempt) =>
                    attempt.turnId === turn.id &&
                    attempt.validationId === validationId
                        ? {
                              ...attempt,
                              outcome: 'accepted' as const,
                              concludedAt: persistence.now().toISOString(),
                          }
                        : attempt,
                ),
            })
            .where(
                and(
                    eq(revisions.runId, run.id),
                    eq(revisions.revision, run.revision),
                ),
            );

        await tx
            .update(runs)
            .set({ updatedAt: persistence.now() })
            .where(eq(runs.id, run.id));

        await emitGenerationRun(persistence, tx, run.id);
    });
}

export function conversationPauseGeneration(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        const active = await generationTurnContext(tx, turn);
        if (!active) {
            throw conflict('No generation action is active.');
        }

        if (!(await generationStageHasProgress(tx, active.run, turn.id))) {
            throw conflict(
                'The response allowance could not complete a generation step.',
            );
        }

        // The running action remains fenced until terminal settlement commits.
        await tx
            .update(runs)
            .set({ pauseReason: 'budget', updatedAt: persistence.now() })
            .where(eq(runs.id, active.run.id));
    });
}

export function conversationProposeGenerationRevision(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    candidate: GenerationPlan,
    validationIds?: string[],
) {
    const plan = GenerationPlanSchema.parse(candidate);

    return conversationWithOperation(persistence, turn, async (tx) => {
        const active = await generationTurnContext(tx, turn);
        if (!active || active.action.kind !== 'revision') {
            throw conflict('No plan revision is active.');
        }

        assertGenerationCapacity(plan, active.context.sources);

        // New private references must be explicitly selected in a new request.
        const authorized = new Set(
            active.context.plan.sources.map((source) =>
                generationFingerprint(source),
            ),
        );

        if (
            plan.sources.some(
                (source) => !authorized.has(generationFingerprint(source)),
            )
        ) {
            throw conflict(
                'Select new source material in a new lesson request.',
            );
        }

        if (turn.execution.actionAccountingVersion === 1) {
            for (const validationId of validationIds ?? []) {
                await new DrizzleActionAccountingParticipant(
                    tx,
                ).acceptStructuredValidation({
                    actionId: turn.id,
                    ownerId: turn.ownerId,
                    leaseToken: turn.leaseToken,
                    validationId,
                });
            }
        }

        const id = randomUUID();
        await tx.insert(candidates).values({
            id,
            runId: active.run.id,
            baseRevision: active.run.revision,
            plan,
            createdAt: persistence.now(),
        });

        return { id };
    });
}

export function conversationLinkGenerationProposal(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    proposalId: string,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        const active = await generationTurnContext(tx, turn);
        if (!active) {
            return;
        }

        if (active.action.kind !== 'generation') {
            throw conflict('A plan revision cannot publish content.');
        }

        if (
            active.action.proposalId &&
            active.action.proposalId !== proposalId
        ) {
            throw conflict('This action already published its content.');
        }

        await tx
            .update(actions)
            .set({ proposalId })
            .where(eq(actions.turnId, turn.id));
    });
}

/** Final publication must be exactly the ordered union of validated completed tasks. */
export function conversationAssertGenerationProposal(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    input: LearningContentProposalInput,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        const active = await generationTurnContext(tx, turn);
        if (!active) {
            return;
        }

        if (active.action.kind !== 'generation' || input.targetBlockId) {
            throw conflict('A lesson plan publishes one complete insertion.');
        }

        const latest = new Map(
            active.context.artifacts.map((artifact) => [
                artifact.taskId,
                artifact,
            ]),
        );
        const content = active.context.plan.outputOrder.flatMap((taskId) => {
            const artifact = latest.get(taskId);
            if (!artifact?.taskComplete) {
                throw conflict('The lesson has unfinished sections.');
            }

            return artifact.body.document.content ?? [];
        });
        const expected = {
            schemaVersion: 2,
            document: { type: 'doc', content },
        };

        if (
            generationFingerprint(expected) !==
            generationFingerprint(input.body)
        ) {
            throw conflict(
                'The lesson proposal does not match its completed sections.',
            );
        }
    });
}
