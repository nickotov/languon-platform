import { prospectiveLessonCalls } from '../../ai/generation-admission-input';
import type { GenerationExecutionContext } from '../../../application/ports/generation-run';
import { assertLessonEnvelopeFits } from './generation-lesson-envelope';
import { maximumAutomaticGenerationStages } from '../../../application/ports/generation-run';
import { listeningAllowances } from './listening-allowance-schema';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
    GenerationAutomationAuthorization,
    GenerationAutomaticAdmission,
} from '../../../application/ports/generation-run';
import { ConversationError } from '../../../domain/conversation';
import {
    aiCreditActionsTable as creditActions,
    aiCreditActionAttemptsTable as attempts,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { generationRunActionsTable as actions } from './conversation-generation-schema';
import type { GenerationRunRow } from './generation-run-context';
import type { ConversationsTransaction } from './conversation-source';
import type { TurnRow } from './conversation-persistence-context';

export async function createGenerationAuthorization(
    tx: ConversationsTransaction,
    turn: Pick<TurnRow, 'id' | 'execution'>,
    revision: number,
    now: Date,
    context: GenerationExecutionContext,
): Promise<GenerationAutomationAuthorization | null> {
    const execution = turn.execution;
    if (
        execution.actionAccountingVersion !== 1 ||
        typeof execution.generationAuthorizationFingerprint !== 'string' ||
        typeof execution.generationMaximumCreditsMilli !== 'string'
    ) {
        return null;
    }

    const [action] = await tx
        .select()
        .from(creditActions)
        .where(eq(creditActions.id, turn.id));
    const maximumProviderCostMicros =
        execution.generationMaximumProviderCostMicros;

    if (
        !action ||
        typeof maximumProviderCostMicros !== 'number' ||
        !Number.isSafeInteger(maximumProviderCostMicros) ||
        maximumProviderCostMicros < 1
    ) {
        return null;
    }

    const receipts = await tx
        .select({
            actualCostMicros: attempts.actualCostMicros,
            successful: attempts.successful,
            inputTokens: attempts.inputTokens,
            inputLimit: attempts.inputLimit,
            outputTokens: attempts.outputTokens,
            cacheReadTokens: attempts.cacheReadTokens,
        })
        .from(attempts)
        .where(eq(attempts.actionId, turn.id));

    assertLessonEnvelopeFits({
        budget: execution.budget,
        calls: prospectiveLessonCalls(context),
        maximumProviderCostMicros,
        maximumCreditsMilli: execution.generationMaximumCreditsMilli,
        tariff: action.tariff,
        funding: action.funding,
        receipts,
        now,
    });

    return {
        authorizationId: randomUUID(),
        revision,
        rootActionId: turn.id,
        actionIds: [turn.id],
        maximumCreditsMilli: execution.generationMaximumCreditsMilli,
        maximumProviderCostMicros,
        authorizationFingerprint: execution.generationAuthorizationFingerprint,
        expiresAt: new Date(
            Math.min(action.deadlineAt.getTime(), now.getTime() + 15 * 60_000),
        ).toISOString(),
        stageCount: 1,
        ready: false,
    };
}

export async function remainingGenerationAuthorization(
    tx: ConversationsTransaction,
    run: GenerationRunRow,
    projection = false,
): Promise<GenerationAutomaticAdmission | null> {
    const authorization = run.automation;
    if (!authorization || authorization.revision !== run.revision) {
        return null;
    }

    const stages = await tx
        .select()
        .from(creditActions)
        .where(
            and(
                eq(creditActions.ownerId, run.ownerId),
                inArray(creditActions.id, authorization.actionIds),
                inArray(
                    creditActions.id,
                    tx
                        .select({ id: actions.turnId })
                        .from(actions)
                        .where(
                            and(
                                eq(actions.runId, run.id),
                                eq(actions.kind, 'generation'),
                            ),
                        ),
                ),
            ),
        );

    // Unknown provider liability cannot authorize further automatic spending.
    if (stages.length !== authorization.actionIds.length) {
        return null;
    }

    if (
        !projection &&
        stages.some(
            (stage) =>
                stage.state !== 'settled' || stage.measurement === 'unknown',
        )
    ) {
        return null;
    }

    const calls = stages.length
        ? await tx
              .select({ cost: attempts.actualCostMicros })
              .from(attempts)
              .where(
                  inArray(
                      attempts.actionId,
                      stages.map((stage) => stage.id),
                  ),
              )
        : [];

    if (!projection && calls.some((call) => call.cost === null)) {
        return null;
    }

    const charged = stages.reduce(
        (sum, stage) => sum + (stage.chargedMilli ?? 0n),
        0n,
    );
    const providerSpent = calls.reduce(
        (sum, call) => sum + (call.cost ?? 0n),
        0n,
    );
    const credits = BigInt(authorization.maximumCreditsMilli) - charged;
    const provider =
        BigInt(authorization.maximumProviderCostMicros) - providerSpent;

    // Projection runs under the restricted worker as well. Only automatic admission needs the private grant.
    const target = run.sourceSnapshot.blockTarget;
    const [listening] =
        !projection &&
        target &&
        run.taskManifest.some((task) => task.kind === 'audio')
            ? await tx
                  .select({
                      preauthorizedCredits:
                          listeningAllowances.preauthorizedCredits,
                  })
                  .from(listeningAllowances)
                  .where(
                      and(
                          eq(
                              listeningAllowances.rootTurnId,
                              authorization.rootActionId,
                          ),
                          eq(listeningAllowances.ownerId, run.ownerId),
                          eq(
                              listeningAllowances.conversationId,
                              run.conversationId,
                          ),
                          eq(listeningAllowances.noteId, run.noteId),
                          eq(listeningAllowances.branchId, target.branchId),
                      ),
                  )
            : [];

    return {
        ...(listening?.preauthorizedCredits === null
            ? { permitsListeningRecording: true as const }
            : {}),
        ...(listening?.preauthorizedCredits != null
            ? {
                  recordingConsent: {
                      rootTurnId: authorization.rootActionId,
                      remainingCreditsMilli: (listening.preauthorizedCredits >
                      charged
                          ? listening.preauthorizedCredits - charged
                          : 0n
                      ).toString(),
                  },
              }
            : {}),
        expiresAt: authorization.expiresAt,
        maximumCreditsMilli: (credits > 0n ? credits : 0n).toString(),
        maximumProviderCostMicros: Number(provider > 0n ? provider : 0n),
        authorizationFingerprint: authorization.authorizationFingerprint,
    };
}

export function assertGenerationAutomaticAuthority(
    run: GenerationRunRow,
    now: Date,
) {
    const authorization = run.automation;
    if (
        !authorization?.ready ||
        authorization.revision !== run.revision ||
        authorization.stageCount >= maximumAutomaticGenerationStages ||
        new Date(authorization.expiresAt) <= now ||
        run.pauseReason !== 'budget'
    ) {
        throw new ConversationError(
            'generation_scope_change',
            'This lesson needs a fresh generation allowance.',
        );
    }
}
