import { generationCommandState } from './generation-command-state';
import type { GenerationFailureDiagnostic } from '../../../application/generation-failure';
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
import {
    generationValidationVersion,
    maximumAutomaticGenerationStages,
} from '../../../application/ports/generation-run';
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
import { remainingGenerationAuthorization } from './generation-run-authorization';
import { formatCreditMilli } from '../../../../ai-credits/domain/exact-credit-amount';

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
        ...(run.pauseReason === 'recording-confirmation'
            ? { awaitingRecordingAuthorization: true as const }
            : {}),
        artifacts: accepted,
        unitAttempts: revision.unitAttempts,
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
    now: Date,
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
                      unitAttempts: revisions.unitAttempts,
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

    // Only numeric progress leaves artifact storage; summaries never expose bodies.
    const completeRows = revision?.artifactIds.length
        ? await tx
              .select({
                  id: artifacts.id,
                  taskId: artifacts.taskId,
                  complete: sql<boolean>`(${artifacts.artifact}->>'taskComplete')::boolean`,
                  units: sql<number>`(select count(*)::integer from jsonb_array_elements(coalesce(${artifacts.artifact}->'body'->'document'->'content','[]'::jsonb)) node where node->>'type'='learningBlock' and node->'attrs'->'block'->>'type'='exercise')`,
                  vocabularyEntries: sql<number>`(select coalesce(sum(jsonb_array_length(coalesce(node->'attrs'->'block'->'entries','[]'::jsonb))),0)::integer from jsonb_array_elements(coalesce(${artifacts.artifact}->'body'->'document'->'content','[]'::jsonb)) node where node->>'type'='learningBlock' and node->'attrs'->'block'->>'type'='vocabulary')`,
              })
              .from(artifacts)
              .where(
                  and(
                      eq(artifacts.runId, run.id),
                      inArray(artifacts.id, revision.artifactIds),
                  ),
              )
        : [];
    const latest = new Map<string, (typeof completeRows)[number]>();
    for (const id of revision?.artifactIds ?? []) {
        const row = completeRows.find((artifact) => artifact.id === id);
        if (row) {
            latest.set(row.taskId, row);
        }
    }

    const completed = new Set(
        [...latest.values()]
            .filter((artifact) => artifact.complete)
            .map((artifact) => artifact.taskId),
    );
    const stages = await tx
        .select({
            charged: turns.usage,
            id: turns.id,
            status: turns.status,
            failureCode: turns.failureCode,
            revision: actions.revision,
            createdAt: turns.createdAt,
        })
        .from(actions)
        .innerJoin(turns, eq(turns.id, actions.turnId))
        .where(and(eq(actions.runId, run.id), eq(actions.kind, 'generation')));
    const speechCharge = run.taskManifest.some((task) => task.kind === 'audio')
        ? await tx.execute(
              sql`select public.languon_listening_charged_milli(${run.id}::uuid,${run.ownerId}::uuid) as milli`,
          )
        : [];
    const chargedMilli = stages.reduce(
        (sum, stage) => {
            const [whole, decimals = ''] =
                stage.charged.chargedCredits.split('.');

            return (
                sum + BigInt(whole!) * 1000n + BigInt(decimals.padEnd(3, '0'))
            );
        },
        BigInt(String(speechCharge[0]?.milli ?? 0)),
    );
    const chargedCredits = `${chargedMilli / 1000n}.${String(chargedMilli % 1000n).padStart(3, '0')}`;
    const failureVisible =
        run.state === 'paused' &&
        (run.pauseReason === 'technical-failure' ||
            run.pauseReason === 'interrupted' ||
            run.failure?.code === 'admission-blocked');
    const failedStage = failureVisible
        ? stages
              .filter(
                  (stage) =>
                      stage.revision === run.revision &&
                      ['failed', 'cancelled'].includes(stage.status),
              )
              .sort(
                  (left, right) =>
                      right.createdAt.getTime() - left.createdAt.getTime(),
              )[0]
        : undefined;
    const failure: GenerationFailureDiagnostic | undefined = failureVisible
        ? run.failure
            ? { ...run.failure }
            : {
                  code:
                      failedStage?.failureCode === 'generation_output_limit'
                          ? 'output-limit'
                          : failedStage?.failureCode ===
                              'generation_invalid_output'
                            ? 'content-invalid'
                            : run.pauseReason === 'interrupted'
                              ? 'interrupted'
                              : 'unknown',
              }
        : undefined;

    if (
        failure &&
        !failure.referenceId &&
        failure.code !== 'admission-blocked' &&
        failedStage
    ) {
        failure.referenceId = failedStage.id;
    }

    const commandState =
        run.state === 'discarded'
            ? undefined
            : await generationCommandState(tx, run.id);
    const uncertainTurnId =
        run.state === 'paused' ? commandState?.uncertainTurnId : undefined;
    const authorization = run.automation;
    const lastAttempt = revision?.unitAttempts.at(-1);
    const recoveringTaskId =
        lastAttempt &&
        lastAttempt.outcome !== 'accepted' &&
        (lastAttempt.strategy !== 'initial' ||
            lastAttempt.outcome === 'rejected')
            ? lastAttempt.taskId
            : undefined;
    const remaining = authorization
        ? await remainingGenerationAuthorization(tx, run, true)
        : null;

    return GenerationRunSummarySchema.parse({
        id: run.id,
        conversationId: run.conversationId,
        noteId: run.noteId,
        revision: run.revision,
        state: run.state,
        ...(run.state === 'paused'
            ? { pauseReason: run.pauseReason ?? 'technical-failure' }
            : {}),
        ...(run.state === 'paused' &&
        run.pauseReason === 'recording-confirmation' &&
        authorization?.recordingApproval
            ? { recordingApproval: authorization.recordingApproval }
            : {}),
        ...(failure ? { failure } : {}),
        ...(uncertainTurnId ? { uncertainTurnId } : {}),
        ...(commandState?.lastCommandRequestId
            ? { lastCommandRequestId: commandState.lastCommandRequestId }
            : {}),
        ...(authorization && run.state !== 'discarded'
            ? {
                  automation: {
                      ...(recoveringTaskId ? { recoveringTaskId } : {}),
                      enabled:
                          (run.state === 'running' ||
                              (run.state === 'paused' &&
                                  run.pauseReason === 'budget' &&
                                  authorization.ready)) &&
                          authorization.stageCount <
                              maximumAutomaticGenerationStages &&
                          new Date(authorization.expiresAt) > now,
                      ...(authorization.ready && authorization.admissionRetry
                          ? { retryAt: authorization.admissionRetry.retryAt }
                          : {}),
                      maximumCredits: formatCreditMilli(
                          BigInt(authorization.maximumCreditsMilli),
                      ),
                      remainingCredits: formatCreditMilli(
                          BigInt(remaining?.maximumCreditsMilli ?? '0'),
                      ),
                  },
              }
            : {}),
        tasks: (revision
            ? revision.plan.outputOrder.map((id) =>
                  revision.plan.tasks.find((task) => task.id === id)!,
              )
            : run.taskManifest
        ).map((task) => {
            const planned = revision?.plan.tasks.find(
                (candidate) => candidate.id === task.id,
            );

            return {
                id: task.id,
                kind: task.kind,
                label:
                    'instruction' in task &&
                    typeof task.instruction === 'string'
                        ? task.instruction.slice(0, 200)
                        : task.kind,
                status: completed.has(task.id)
                    ? 'completed'
                    : run.failure?.taskId === task.id && run.state === 'paused'
                      ? 'failed'
                      : run.state === 'running' &&
                          lastAttempt?.turnId === run.activeTurnId &&
                          lastAttempt?.outcome === 'started' &&
                          lastAttempt.taskId === task.id
                        ? 'running'
                        : 'pending',
                ...(planned?.kind === 'exercises'
                    ? {
                          completedUnitCount: latest.get(task.id)?.units ?? 0,
                          totalUnitCount: planned.activities.reduce(
                              (sum, activity) => sum + activity.count,
                              0,
                          ),
                      }
                    : planned?.kind === 'vocabulary'
                      ? {
                            completedUnitCount:
                                latest.get(task.id)?.vocabularyEntries ?? 0,
                            totalUnitCount:
                                planned.words?.length ?? planned.count ?? 10,
                        }
                      : {}),
            };
        }),
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
    now: Date,
    tx: ConversationsTransaction,
    run: GenerationRunRow,
) {
    if (run.state === 'discarded') {
        return GenerationRunDetailSchema.parse({
            run: await generationRunView(now, tx, run),
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
        run: await generationRunView(now, tx, run),
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
            await generationRunView(persistence.now(), tx, run),
        );
    }
}
