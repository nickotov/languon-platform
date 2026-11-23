import {
    identifyListeningScript,
    listeningScriptSchema,
    type ListeningRecordingRequest,
} from '../../../application/listening-script';
import {
    GenerationFailureSchema,
    type GenerationFailure,
} from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import { aiCreditActionAttemptsTable as calls } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { aiCreditStructuredCallValidationsTable as validations } from '../../../../ai-credits/infrastructure/persistence/drizzle/staged-action-accounting-schema';
import { generationTaskFingerprints } from '../../../application/generation-run-revisions';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import {
    generationUnitStrategies,
    type GenerationAttemptEvent,
    type GenerationUnitAttempt,
} from '../../../application/ports/generation-run';
import { generationPlanRevisionsTable as revisions } from './conversation-generation-schema';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import { conversationWithOperation } from './conversation-worker-authority';
import type { ConversationsTransaction } from './conversation-source';
import {
    generationTurnContext,
    emitGenerationRun,
} from './generation-run-context';

/** The run lock serializes the history update with stop, revision and checkpoint. */
export function recordGenerationAttempt(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    event: GenerationAttemptEvent,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        const active = await generationTurnContext(tx, turn);
        if (!active || active.action.kind !== 'generation') {
            throw conflict('No generation action is active.');
        }

        const { context } = active;
        const task = context.plan.tasks.find(
            (item) => item.id === event.taskId,
        );

        if (
            !task ||
            !Number.isInteger(event.unitOrdinal) ||
            event.unitOrdinal < 1
        ) {
            throw conflict('The attempt does not identify a lesson unit.');
        }

        const complete = new Set(
            context.artifacts
                .filter((item) => item.taskComplete)
                .map((item) => item.taskId),
        );

        if (
            complete.has(task.id) ||
            task.inputs.some(
                (input) => input.kind === 'task' && !complete.has(input.taskId),
            )
        ) {
            throw conflict(
                'The lesson task has already finished or its dependencies are incomplete.',
            );
        }

        const { sourceHash } = generationTaskFingerprints(
            context.plan,
            task.id,
            context.sources,
            context.artifacts,
        );
        const history = [...(context.unitAttempts ?? [])];
        const candidates = history.filter(
            (attempt) =>
                attempt.outcome !== 'undispatched' &&
                attempt.outcome !== 'declined' &&
                attempt.taskId === task.id &&
                attempt.unitOrdinal === event.unitOrdinal &&
                attempt.sourceHash === sourceHash &&
                attempt.schemaVersion === event.schemaVersion,
        );

        if (event.outcome === 'started') {
            const strategy = generationUnitStrategies[candidates.length];
            if (
                strategy !== event.strategy ||
                candidates.some(
                    (attempt) =>
                        attempt.outcome === 'accepted' ||
                        attempt.outcome === 'started' ||
                        attempt.dependencyFingerprint !==
                            event.dependencyFingerprint,
                ) ||
                history.some(
                    (attempt) => attempt.validationId === event.validationId,
                )
            ) {
                throw conflict(
                    'The lesson unit attempt is unavailable or exhausted.',
                );
            }

            history.push({
                ...event,
                sourceHash,
                turnId: turn.id,
                recordedAt: persistence.now().toISOString(),
            });
        } else {
            const attempt = candidates.find(
                (item) =>
                    item.turnId === turn.id &&
                    item.validationId === event.validationId &&
                    item.strategy === event.strategy &&
                    item.dependencyFingerprint === event.dependencyFingerprint,
            );

            if (
                !attempt ||
                attempt.outcome === 'accepted' ||
                !event.diagnostic
            ) {
                throw conflict('The rejected lesson attempt is unavailable.');
            }

            if (turn.execution.actionAccountingVersion === 1) {
                const receipts = await tx
                    .select({
                        state: calls.state,
                        cost: calls.actualCostMicros,
                        accepted: validations.accepted,
                    })
                    .from(calls)
                    .innerJoin(validations, eq(validations.attemptId, calls.id))
                    .where(
                        and(
                            eq(calls.actionId, turn.id),
                            eq(validations.validationId, event.validationId),
                        ),
                    );

                if (
                    !receipts.length ||
                    receipts.some(
                        (receipt) =>
                            receipt.state !== 'settled' ||
                            receipt.cost === null ||
                            receipt.accepted !== false,
                    )
                ) {
                    throw conflict(
                        'Lesson recovery requires a settled rejected provider response.',
                    );
                }
            }

            const rejected: GenerationUnitAttempt = {
                ...attempt,
                outcome: 'rejected',
                concludedAt: persistence.now().toISOString(),
                diagnostic: GenerationFailureSchema.parse(event.diagnostic),
            };

            history[history.indexOf(attempt)] = rejected;
        }

        await tx
            .update(revisions)
            .set({ unitAttempts: history })
            .where(
                and(
                    eq(revisions.runId, context.runId),
                    eq(revisions.revision, context.revision),
                ),
            );

        await emitGenerationRun(persistence, tx, context.runId);
    });
}

/** Admission and structured receipt registration are atomic. A missing receipt
 * therefore proves that this candidate never acquired dispatch authority. */
export async function reconcileGenerationAttempts(
    tx: ConversationsTransaction,
    runId: string,
    revision: number,
    turnId: string,
    at: Date,
    failure?: GenerationFailure,
) {
    const scope = and(
        eq(revisions.runId, runId),
        eq(revisions.revision, revision),
    );
    const [row] = await tx
        .select({ history: revisions.unitAttempts })
        .from(revisions)
        .where(scope);
    const history = row?.history ?? [];
    if (
        !history.some(
            (attempt) =>
                attempt.turnId === turnId && attempt.outcome === 'started',
        )
    ) {
        return;
    }

    const receipts = await tx
        .select({
            validationId: validations.validationId,
            state: calls.state,
            cost: calls.actualCostMicros,
            successful: calls.successful,
            inputTokens: calls.inputTokens,
            outputTokens: calls.outputTokens,
        })
        .from(calls)
        .innerJoin(validations, eq(validations.attemptId, calls.id))
        .where(eq(calls.actionId, turnId));
    const reconciled = history.map((attempt): GenerationUnitAttempt => {
        if (attempt.turnId !== turnId || attempt.outcome !== 'started') {
            return attempt;
        }

        const matches = receipts.filter(
            (receipt) => receipt.validationId === attempt.validationId,
        );

        if (!matches.length) {
            return {
                ...attempt,
                outcome: 'undispatched',
                concludedAt: at.toISOString(),
            };
        }

        if (
            failure?.code === 'provider-outcome-unknown' ||
            matches.some(
                (receipt) =>
                    receipt.state !== 'settled' ||
                    (receipt.cost === null &&
                        failure?.code !== 'rate-limited' &&
                        failure?.code !== 'provider-rejected'),
            )
        ) {
            return attempt;
        }

        if (
            failure?.code === 'provider-rejected' ||
            failure?.code === 'rate-limited'
        ) {
            return {
                ...attempt,
                outcome: 'declined',
                concludedAt: at.toISOString(),
                diagnostic: { code: failure.code, taskId: attempt.taskId },
            };
        }

        return {
            ...attempt,
            outcome: 'abandoned',
            concludedAt: at.toISOString(),
            diagnostic: { code: 'interrupted', taskId: attempt.taskId },
        };
    });

    await tx.update(revisions).set({ unitAttempts: reconciled }).where(scope);
    const current = reconciled.filter((attempt) => attempt.turnId === turnId);
    const latestReceipts = receipts.filter(
        (receipt) => receipt.validationId === current.at(-1)?.validationId,
    );

    return {
        knownRateLimit:
            failure?.code === 'rate-limited' &&
            latestReceipts.length > 0 &&
            latestReceipts.every(
                (receipt) =>
                    receipt.state === 'settled' &&
                    receipt.successful === 0 &&
                    receipt.cost !== null &&
                    receipt.inputTokens === 0 &&
                    receipt.outputTokens === 0,
            ),
        uncertain: current.some((attempt) => attempt.outcome === 'started'),
        undispatched: current.at(-1)?.outcome === 'undispatched',
    };
}

/** Persist the exact speaking turns and operation IDs before any provider dispatch. */
export function freezeListeningScript(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    input: ListeningRecordingRequest,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        const active = await generationTurnContext(tx, turn);
        const task = active?.context.plan.tasks.find(
            (item) => item.id === input.taskId,
        );

        if (
            !active ||
            active.action.kind !== 'generation' ||
            active.context.runId !== input.runId ||
            active.context.revision !== input.revision ||
            task?.kind !== 'audio' ||
            task.language !== input.language
        ) {
            throw conflict(
                'The listening recording belongs to a different generation task.',
            );
        }

        const history = [...(active.context.unitAttempts ?? [])];
        const attempt = history.find(
            (item) =>
                item.taskId === task.id &&
                item.turnId === turn.id &&
                item.validationId === input.validationId &&
                item.outcome === 'started',
        );

        if (!attempt) {
            throw conflict('The listening candidate is no longer active.');
        }

        const previous = history.find(
            (item) =>
                item.taskId === task.id &&
                item.sourceHash === attempt.sourceHash &&
                item.listeningScript,
        )?.listeningScript;

        if (previous) {
            return previous;
        }

        const script = listeningScriptSchema.parse(input.script);
        if (
            new Set(script.utterances.map((item) => item.speaker)).size !==
            task.speakerCount
        ) {
            throw conflict(
                'The listening script uses the wrong number of speakers.',
            );
        }

        const frozen = identifyListeningScript(script);
        history[history.indexOf(attempt)] = {
            ...attempt,
            listeningScript: frozen,
        };

        await tx
            .update(revisions)
            .set({ unitAttempts: history })
            .where(
                and(
                    eq(revisions.runId, input.runId),
                    eq(revisions.revision, input.revision),
                ),
            );

        return frozen;
    });
}
