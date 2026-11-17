import {
    GenerationRunDetailSchema,
    GenerationRunSummarySchema,
} from '@languon/contracts';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
    compareGenerationPlans,
    generationFingerprint,
    generationTaskFingerprints,
} from '../../../application/generation-run-revisions';
import { generationValidationVersion } from '../../../application/ports/generation-run';
import type {
    ConversationAccess,
    ClaimedConversationTurn,
} from '../../../application/ports/conversation-store';
import type { GenerationExecutionContext } from '../../../application/ports/generation-run';
import {
    conversationUnavailable,
    isReadOnlyKnowledgeSource,
} from '../../../domain/conversation';
import { conversationAuthorize } from './conversation-persistence-authority';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import {
    generationRunsTable as runs,
    generationPlanRevisionsTable as revisions,
    generationRunArtifactsTable as artifacts,
    generationRunActionsTable as actions,
    generationPlanCandidatesTable as candidates,
} from './conversation-generation-schema';
import { conversationTurnsTable as turns } from './schema';
import { conversationEvent } from './conversation-events';

export type GenerationRunRow = typeof runs.$inferSelect;

export async function generationOwnerContext(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    access: ConversationAccess,
    conversationId: string,
    write = true,
) {
    const authorized = await conversationAuthorize(
        persistence,
        tx,
        access,
        conversationId,
        false,
        '',
        write,
    );

    if (
        authorized.chat.source.kind !== 'knowledge' ||
        isReadOnlyKnowledgeSource(authorized.chat.source) ||
        authorized.authority.sourceOwnerId !== access.ownerId
    ) {
        throw conversationUnavailable();
    }

    return authorized;
}

export async function lockGenerationRun(
    tx: ConversationsTransaction,
    conversationId: string,
    runId: string,
    ownerId?: string,
) {
    const [run] = await tx
        .select()
        .from(runs)
        .where(
            and(
                eq(runs.id, runId),
                eq(runs.conversationId, conversationId),
                ownerId ? eq(runs.ownerId, ownerId) : undefined,
            ),
        )
        .for('update');

    if (!run) {
        throw conversationUnavailable();
    }

    return run;
}

export async function generationContext(
    tx: ConversationsTransaction,
    run: GenerationRunRow,
    purpose: 'generation' | 'revision' = 'generation',
): Promise<GenerationExecutionContext> {
    const [revision] = await tx
        .select()
        .from(revisions)
        .where(
            and(
                eq(revisions.runId, run.id),
                eq(revisions.revision, run.revision),
            ),
        );

    if (!revision) {
        throw conflict('The generation plan is unavailable.');
    }

    const rows = revision.artifactIds.length
        ? await tx
              .select()
              .from(artifacts)
              .where(
                  and(
                      eq(artifacts.runId, run.id),
                      inArray(artifacts.id, revision.artifactIds),
                  ),
              )
        : [];
    const byId = new Map(rows.map((row) => [row.id, row.artifact]));
    const accepted = revision.artifactIds.map((id) => {
        const artifact = byId.get(id);
        if (!artifact) {
            throw conflict('A completed lesson checkpoint is unavailable.');
        }

        return artifact;
    });

    for (const artifact of accepted) {
        const fingerprints = generationTaskFingerprints(
            revision.plan,
            artifact.taskId,
            revision.sources,
            accepted,
        );

        if (
            artifact.validationVersion !== generationValidationVersion ||
            artifact.contentHash !== generationFingerprint(artifact.body) ||
            artifact.requirementsHash !== fingerprints.requirementsHash ||
            artifact.sourceHash !== fingerprints.sourceHash
        ) {
            throw conflict(
                'A completed lesson checkpoint no longer matches this plan. Start a new lesson request.',
            );
        }
    }

    return {
        runId: run.id,
        revision: run.revision,
        plan: revision.plan,
        sources: revision.sources,
        artifacts: accepted,
        purpose,
    };
}

export async function generationTurnContext(
    tx: ConversationsTransaction,
    turn: ClaimedConversationTurn,
) {
    const [action] = await tx
        .select()
        .from(actions)
        .where(eq(actions.turnId, turn.id));

    if (!action) {
        return undefined;
    }

    const run = await lockGenerationRun(
        tx,
        turn.conversationId,
        action.runId,
        turn.ownerId,
    );

    if (
        run.state !== 'running' ||
        run.activeTurnId !== turn.id ||
        run.revision !== action.revision
    ) {
        throw conflict('This generation action is no longer active.');
    }

    return {
        run,
        action,
        context: await generationContext(tx, run, action.kind),
    };
}

export async function generationRunView(
    tx: ConversationsTransaction,
    run: GenerationRunRow,
) {
    const [revision] =
        run.state === 'discarded'
            ? []
            : await tx
                  .select({
                      plan: revisions.plan,
                      artifactIds: revisions.artifactIds,
                  })
                  .from(revisions)
                  .where(
                      and(
                          eq(revisions.runId, run.id),
                          eq(revisions.revision, run.revision),
                      ),
                  );

    if (run.state !== 'discarded' && !revision) {
        throw conflict('The generation plan is unavailable.');
    }

    // Summary reads project completion flags only; private generated bodies stay inside worker reads.
    const completeRows = revision?.artifactIds.length
        ? await tx
              .select({ taskId: artifacts.taskId })
              .from(artifacts)
              .where(
                  and(
                      eq(artifacts.runId, run.id),
                      inArray(artifacts.id, revision.artifactIds),
                      sql`${artifacts.artifact}->>'taskComplete' = 'true'`,
                  ),
              )
        : [];
    const completed = new Set(completeRows.map((artifact) => artifact.taskId));
    const stages = await tx
        .select({ charged: turns.usage })
        .from(actions)
        .innerJoin(turns, eq(turns.id, actions.turnId))
        .where(and(eq(actions.runId, run.id), eq(actions.kind, 'generation')));
    const chargedMilli = stages.reduce((sum, stage) => {
        const [whole, decimals = ''] = stage.charged.chargedCredits.split('.');

        return sum + BigInt(whole!) * 1000n + BigInt(decimals.padEnd(3, '0'));
    }, 0n);
    const chargedCredits = `${chargedMilli / 1000n}.${String(chargedMilli % 1000n).padStart(3, '0')}`;

    return GenerationRunSummarySchema.parse({
        id: run.id,
        conversationId: run.conversationId,
        noteId: run.noteId,
        revision: run.revision,
        state: run.state,
        ...(run.state === 'paused'
            ? { pauseReason: run.pauseReason ?? 'technical-failure' }
            : {}),
        tasks: (revision?.plan.tasks ?? run.taskManifest).map((task) => ({
            id: task.id,
            kind: task.kind,
            label:
                'instruction' in task && typeof task.instruction === 'string'
                    ? task.instruction.slice(0, 200)
                    : task.kind,
            status: completed.has(task.id) ? 'completed' : 'pending',
        })),
        completedTaskCount: completed.size,
        totalTaskCount: revision?.plan.tasks.length ?? run.taskManifest.length,
        activeTurnId: run.activeTurnId,
        proposalId: run.proposalId,
        chargedCredits,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
    });
}

export async function generationRunDetail(
    tx: ConversationsTransaction,
    run: GenerationRunRow,
) {
    if (run.state === 'discarded') {
        return GenerationRunDetailSchema.parse({
            run: await generationRunView(tx, run),
        });
    }

    const [context] = await tx
        .select({ plan: revisions.plan })
        .from(revisions)
        .where(
            and(
                eq(revisions.runId, run.id),
                eq(revisions.revision, run.revision),
            ),
        );

    if (!context) {
        throw conflict('The generation plan is unavailable.');
    }

    const [candidate] = await tx
        .select()
        .from(candidates)
        .where(
            and(
                eq(candidates.runId, run.id),
                eq(candidates.baseRevision, run.revision),
            ),
        )
        .orderBy(desc(candidates.createdAt))
        .limit(1);

    return GenerationRunDetailSchema.parse({
        run: await generationRunView(tx, run),
        plan: context.plan,
        ...(candidate && run.state === 'paused'
            ? {
                  revisionCandidate: {
                      id: candidate.id,
                      baseRevision: candidate.baseRevision,
                      plan: candidate.plan,
                      ...compareGenerationPlans(context.plan, candidate.plan),
                  },
              }
            : {}),
    });
}

export async function emitGenerationRun(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    runId: string,
) {
    const [run] = await tx.select().from(runs).where(eq(runs.id, runId));
    if (run) {
        await conversationEvent(
            persistence,
            tx,
            run.conversationId,
            'generation-run',
            await generationRunView(tx, run),
        );
    }
}
