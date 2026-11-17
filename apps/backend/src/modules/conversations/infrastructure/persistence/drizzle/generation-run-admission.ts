import { assertGenerationCapacity } from './generation-run-capacity';
import { eq } from 'drizzle-orm';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import type { GenerationAdmission } from '../../../application/ports/generation-run';
import { ConversationError } from '../../../domain/conversation';
import { captureConversationBlockTarget } from './conversation-block-target';
import {
    generationContext,
    lockGenerationRun,
    emitGenerationRun,
} from './generation-run-context';
import {
    generationRunActionsTable as actions,
    generationRunsTable as runs,
} from './conversation-generation-schema';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import { inspectGenerationSources } from './generation-source-refresh';

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

    const minimumOutputTokens =
        input.kind === 'generation'
            ? assertGenerationCapacity(
                  context.plan,
                  context.sources,
                  context.artifacts,
              )
            : undefined;
    const snapshot = { ...run.sourceSnapshot, blockTarget: currentTarget };

    return {
        sourceChanged: false as const,
        run,
        context,
        snapshot,
        minimumOutputTokens,
    };
}

export async function bindGenerationAdmission(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    turnId: string,
    input: GenerationAdmission,
    prepared: Exclude<
        Awaited<ReturnType<typeof prepareGenerationAdmission>>,
        { sourceChanged: true }
    >,
) {
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
            sourceSnapshot: prepared.snapshot,
            updatedAt: persistence.now(),
        })
        .where(eq(runs.id, input.runId));

    await emitGenerationRun(persistence, tx, input.runId);
}
