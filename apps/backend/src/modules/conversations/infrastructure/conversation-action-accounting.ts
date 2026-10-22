import {
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../infrastructure/text-ai/text-ai-capacity';
import { ConversationError } from '../domain/conversation';
import type { ProviderPrice } from '@languon/contracts';
import { providerTextExpenseMicros } from '../../ai-credits/domain/provider-expense';
import { eq, sql } from 'drizzle-orm';
import type { AiCreditTransaction } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleActionAccountingParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { aiCreditActionAttemptsTable as attempts } from '../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { recordProviderExpense } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-accounting-store';
import { formatCreditMilli } from '../../ai-credits/domain/exact-credit-amount';
import type { TextAiExecutionSnapshot } from '../../text-ai/application/text-ai-provider-catalog';
import type {
    TutorAccountingPort,
    TutorCallAdmission,
    TutorCallUsage,
} from '../application/ports/tutor-runner';
import { conversationTurnsTable as turns } from './persistence/drizzle/schema';
import type { TextAiAdmissionExecution } from '../../text-ai/application/text-ai-admission-participant';

export type ActionConversationExecution = TextAiAdmissionExecution & {
    actionAccountingVersion: 1;
    providerPrice: ProviderPrice | null;
    admittedMaxInputTokens: number;
};
export function usesActionAccounting(
    execution: unknown,
): execution is ActionConversationExecution {
    return (
        typeof execution === 'object' &&
        execution !== null &&
        'actionAccountingVersion' in execution &&
        execution.actionAccountingVersion === 1
    );
}
export function createConversationActionAccounting(input: {
    withOperation<T>(work: (tx: AiCreditTransaction) => Promise<T>): Promise<T>;
    withTransaction<T>(
        work: (tx: AiCreditTransaction) => Promise<T>,
    ): Promise<T>;
    ownerId: string;
    turnId: string;
    leaseToken?: string;
    execution: ActionConversationExecution;
}): TutorAccountingPort {
    async function record(
        call: TutorCallAdmission,
        successful: boolean,
        usage?: TutorCallUsage,
        stopCandidate = false,
    ) {
        await input.withTransaction(async (tx) => {
            const [feature] = await tx
                .select({
                    cancelRequested: turns.cancelRequested,
                    failureCode: turns.failureCode,
                })
                .from(turns)
                .where(eq(turns.id, input.turnId))
                .for('update');
            const measuredStop =
                stopCandidate &&
                feature?.cancelRequested &&
                feature.failureCode === 'explicit_stop';
            const participant = new DrizzleActionAccountingParticipant(tx);
            await participant.recordAttempt({
                actionId: input.turnId,
                ownerId: input.ownerId,
                callId: call.callId,
                successful: successful || Boolean(measuredStop),
                ...(usage ? { usage } : {}),
                operatorCostMicros: usage
                    ? providerTextExpenseMicros(
                          input.execution.providerPrice,
                          usage,
                      )
                    : null,
                at: new Date(),
            });
            const snapshot = input.execution.snapshot;
            if (!snapshot)
                throw new Error('Action provider snapshot is missing.');
            const [attempt] = await tx
                .select()
                .from(attempts)
                .where(eq(attempts.id, call.callId));
            const measured = Boolean(
                attempt &&
                attempt.inputTokens !== null &&
                attempt.outputTokens !== null,
            );
            const expense =
                measured && usage
                    ? providerTextExpenseMicros(
                          input.execution.providerPrice,
                          usage,
                      )
                    : null;
            if (
                call.purpose === 'answer' &&
                (call.outputLimitReached || usage?.outputLimitReached)
            )
                await tx
                    .update(turns)
                    .set({
                        usage: sql`jsonb_set(${turns.usage}, '{outputLimitReached}', 'true'::jsonb)`,
                    })
                    .where(eq(turns.id, input.turnId));
            await recordProviderExpense(tx, {
                attemptReference: `conversation:${call.callId}`,
                attemptId: call.callId,
                actionId: input.turnId,
                providerId: snapshot.providerId,
                modelId: snapshot.modelId,
                measurement: measured ? 'measured' : 'unknown',
                costSource: expense !== null ? 'calculated' : 'unknown',
                amountUsdMicros: expense,
                occurredAt: attempt?.createdAt ?? new Date(),
            });
        });
    }
    return {
        admit: (call) =>
            input.withOperation(async (tx) => {
                if (
                    !Number.isSafeInteger(
                        input.execution.admittedMaxInputTokens,
                    ) ||
                    call.inputTokenEstimate >
                        input.execution.admittedMaxInputTokens
                )
                    throw new ConversationError(
                        'context_too_large',
                        'The request exceeds its admitted context allowance.',
                    );
                const capacity = await readTextAiCapacity(tx, {
                    actorId: input.ownerId,
                    now: new Date(),
                    budget: input.execution.budget,
                });
                if (
                    !textAiProviderBudgetAllows(
                        capacity.providerUsage,
                        true,
                        input.execution.budget,
                    )
                )
                    throw new ConversationError(
                        'capacity_unavailable',
                        'AI capacity is currently unavailable. Try again later.',
                    );
                if (!input.leaseToken)
                    throw new Error('Claimed execution lease is required.');
                const attempt = await new DrizzleActionAccountingParticipant(
                    tx,
                ).admitAttempt({
                    actionId: input.turnId,
                    executionWitness: {
                        jobId: input.turnId,
                        leaseToken: input.leaseToken,
                    },
                    ownerId: input.ownerId,
                    callId: call.callId,
                    purpose: call.purpose,
                    inputTokens: call.inputTokenEstimate,
                    maxOutputTokens: call.maxOutputTokens,
                    budget: input.execution.budget,
                    at: new Date(),
                });
                await tx
                    .update(turns)
                    .set({ providerDispatched: true })
                    .where(eq(turns.id, input.turnId));
                return { maxOutputTokens: attempt.outputLimit };
            }),
        settle: (call, usage) => record(call, true, usage),
        fail: (call, reason, usage) =>
            record(call, false, usage, reason === 'aborted'),
    };
}

/** Called after the terminal outcome is durable, in the same transaction, before public events. */
export async function settleConversationAction(
    tx: AiCreditTransaction,
    turn: typeof turns.$inferSelect,
    explicitStop = turn.failureCode === 'explicit_stop',
) {
    if (!usesActionAccounting(turn.execution)) return;
    const outcome =
        turn.status === 'succeeded'
            ? 'success'
            : explicitStop
              ? 'stopped'
              : 'failure';
    const participant = new DrizzleActionAccountingParticipant(tx);
    const pending = await tx
        .select()
        .from(attempts)
        .where(eq(attempts.actionId, turn.id));
    for (const attempt of pending) {
        if (attempt.state !== 'dispatched') continue;
        await participant.recordAttempt({
            actionId: turn.id,
            ownerId: turn.ownerId,
            callId: attempt.id,
            successful: false,
            at: new Date(),
        });
        const snapshot = turn.execution.snapshot as
            TextAiExecutionSnapshot | undefined;
        if (!snapshot) throw new Error('Pinned provider execution is missing.');
        await recordProviderExpense(tx, {
            attemptReference: `conversation:${attempt.id}`,
            attemptId: attempt.id,
            actionId: turn.id,
            providerId: snapshot.providerId,
            modelId: snapshot.modelId,
            measurement: 'unknown',
            costSource: 'unknown',
            amountUsdMicros: null,
            occurredAt: attempt.createdAt,
        });
    }
    const action = await new DrizzleActionAccountingParticipant(tx).settle({
        actionId: turn.id,
        ownerId: turn.ownerId,
        outcome,
        at: new Date(),
    });
    const [usage] = await tx
        .select({
            inputTokens: sql<number>`coalesce(sum(${attempts.inputTokens}),0)::integer`,
            outputTokens: sql<number>`coalesce(sum(${attempts.outputTokens}),0)::integer`,
        })
        .from(attempts)
        .where(eq(attempts.actionId, turn.id));
    const projection = {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        chargedCredits: formatCreditMilli(action.chargedMilli ?? 0n),
        estimated: false,
        ...(turn.usage.outputLimitReached ? { outputLimitReached: true } : {}),
    };
    const billing = {
        state:
            action.funding !== 'customer'
                ? ('free' as const)
                : (action.chargedMilli ?? 0n) > 0n
                  ? ('charged' as const)
                  : ('released' as const),
        heldCredits: formatCreditMilli(action.heldMilli),
        chargedCredits: formatCreditMilli(action.chargedMilli ?? 0n),
        measurement: action.measurement,
    };
    await tx
        .update(turns)
        .set({ usage: projection, billing })
        .where(eq(turns.id, turn.id));
    turn.usage = projection;
    turn.billing = billing;
}

/** Acquire operator locks before the turn status update changes capacity projections. */
export async function prepareConversationActionSettlement(
    tx: AiCreditTransaction,
    turn: typeof turns.$inferSelect,
) {
    if (!usesActionAccounting(turn.execution)) return;
    await new DrizzleActionAccountingParticipant(tx).lockForSettlement(
        turn.ownerId,
    );
}
