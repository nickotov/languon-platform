import { generationCommandState } from './generation-command-state';
import { assertGenerationCapacity } from './generation-run-capacity';
import { and, eq } from 'drizzle-orm';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import {
    acknowledgedGenerationAttempts,
    type GenerationAdmission,
} from '../../../application/ports/generation-run';
import { ConversationError } from '../../../domain/conversation';
import { captureConversationBlockTarget } from './conversation-block-target';
import {
    generationContext,
    lockGenerationRun,
    emitGenerationRun,
} from './generation-run-context';
import {
    generationPlanRevisionsTable as revisions,
    generationRunActionsTable as actions,
    generationRunsTable as runs,
} from './conversation-generation-schema';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import { inspectGenerationSources } from './generation-source-refresh';
import {
    assertGenerationAutomaticAuthority,
    remainingGenerationAuthorization,
    createGenerationAuthorization,
} from './generation-run-authorization';

export async function prepareGenerationAdmission(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    access: ConversationAccess,
    conversationId: string,
    input: GenerationAdmission,
) {
    const run = await lockGenerationRun(
        tx,
        conversationId,
        input.runId,
        access.ownerId,
    );

    if (run.revision !== input.expectedRevision) {
        throw conflict(
            'The lesson plan changed. Review the current plan before continuing.',
        );
    }

    if (run.state !== 'paused' || run.activeTurnId) {
        throw conflict(
            'Stop the active response before changing or continuing this lesson.',
        );
    }

    const { uncertainTurnId, nextCommandNumber } = await generationCommandState(
        tx,
        run.id,
    );

    if (input.acknowledgedUncertainTurnId !== uncertainTurnId) {
        throw new ConversationError(
            'generation_acknowledgement_required',
            'Review the uncertain provider outcome before authorizing a new attempt.',
        );
    }

    if (input.kind === 'generation' && run.failure?.recoveryExhausted) {
        throw conflict(
            'The remaining lesson unit exhausted its generation strategies. Revise the plan to continue.',
        );
    }

    if (input.automatic) {
        const expected = input.automatic;
        const authorization = run.automation;
        if (
            authorization?.authorizationId !== expected.authorizationId ||
            authorization.stageCount !== expected.stageCount ||
            (authorization.admissionRetry?.count ?? 0) !== expected.retryCount
        ) {
            throw conflict('The automatic stage already changed.');
        }

        assertGenerationAutomaticAuthority(run, persistence.now());
    }

    const target = run.sourceSnapshot.blockTarget;
    if (!target) {
        throw conflict('The lesson document is unavailable.');
    }

    const currentTarget = await captureConversationBlockTarget(
        tx,
        run.noteId,
        target.branchId,
    );
    const context = await generationContext(tx, run, input.kind);
    const inspected =
        currentTarget.version !== target.version
            ? await inspectGenerationSources(
                  tx,
                  run.noteId,
                  target.branchId,
                  context,
              )
            : undefined;

    if (
        input.kind === 'generation' &&
        !!inspected?.changed.size &&
        input.sourceChoice !== 'keep-snapshot'
    ) {
        await tx
            .update(runs)
            .set({
                pauseReason: 'source-changed',
                automation: null,
                failure: {
                    code: 'admission-blocked',
                    admissionReason: 'source-changed',
                },
                updatedAt: persistence.now(),
            })
            .where(eq(runs.id, run.id));

        await emitGenerationRun(persistence, tx, run.id);

        return { sourceChanged: true as const };
    }

    if (input.sourceChoice === 'refresh') {
        throw new ConversationError(
            'source_changed',
            'Refresh the lesson sources before requesting a new allowance.',
        );
    }

    if (input.kind === 'generation') {
        assertGenerationCapacity(
            context.plan,
            context.sources,
            context.artifacts,
        );
    }

    const snapshot = { ...run.sourceSnapshot, blockTarget: currentTarget };
    const generationAuthorization = input.automatic
        ? await remainingGenerationAuthorization(tx, run)
        : undefined;

    if (input.automatic && !generationAuthorization) {
        throw new ConversationError(
            'generation_scope_change',
            'This lesson needs a fresh generation allowance.',
        );
    }

    return {
        sourceChanged: false as const,
        commandNumber: input.automatic ? undefined : nextCommandNumber,
        run,
        context,
        snapshot,
        generationAuthorization,
    };
}

export async function bindGenerationAdmission(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    turnId: string,
    execution: Record<string, unknown>,
    input: GenerationAdmission,
    prepared: Exclude<
        Awaited<ReturnType<typeof prepareGenerationAdmission>>,
        { sourceChanged: true }
    >,
) {
    const acknowledged = input.acknowledgedUncertainTurnId;
    if (
        acknowledged &&
        prepared.context.unitAttempts?.some(
            (attempt) =>
                attempt.turnId === acknowledged &&
                attempt.outcome === 'started',
        )
    ) {
        // Consent belongs to this admitted command and is committed with its quote and action.
        const history = acknowledgedGenerationAttempts(
            prepared.context.unitAttempts,
            acknowledged,
        );

        await tx
            .update(revisions)
            .set({ unitAttempts: history })
            .where(
                and(
                    eq(revisions.runId, input.runId),
                    eq(revisions.revision, input.expectedRevision),
                ),
            );
    }

    await tx.insert(actions).values({
        turnId,
        runId: input.runId,
        revision: input.expectedRevision,
        kind: input.kind,
        createdAt: persistence.now(),
    });

    await tx
        .update(runs)
        .set({
            state: 'running',
            activeTurnId: turnId,
            pauseReason: null,
            failure: null,
            sourceSnapshot: prepared.snapshot,
            automation:
                input.kind !== 'generation'
                    ? null
                    : input.automatic && prepared.run.automation
                      ? {
                            ...prepared.run.automation,
                            actionIds: [
                                ...prepared.run.automation.actionIds,
                                turnId,
                            ],
                            stageCount: prepared.run.automation.stageCount + 1,
                            admissionRetry: undefined,
                            ready: false,
                        }
                      : await createGenerationAuthorization(
                            tx,
                            { id: turnId, execution },
                            input.expectedRevision,
                            persistence.now(),
                            acknowledged
                                ? {
                                      ...prepared.context,
                                      unitAttempts:
                                          acknowledgedGenerationAttempts(
                                              prepared.context.unitAttempts ??
                                                  [],
                                              acknowledged,
                                          ),
                                  }
                                : prepared.context,
                        ),
            updatedAt: persistence.now(),
        })
        .where(eq(runs.id, input.runId));

    await emitGenerationRun(persistence, tx, input.runId);
}
