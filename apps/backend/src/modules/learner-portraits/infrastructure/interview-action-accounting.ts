import type { ProviderPrice } from '@languon/contracts';
import { providerTextExpenseMicros } from '../../ai-credits/domain/provider-expense';
import {
    readInterviewInputTokenLimit,
    readInterviewOutputTokenLimit,
    type InterviewExecution,
} from './ai/interview-request';
import {
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../infrastructure/text-ai/text-ai-capacity';
import { InterviewAccountingError } from './interview-accounting';
import { eq, sql } from 'drizzle-orm';
import type { AiCreditTransaction } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleActionAccountingParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { aiCreditActionAttemptsTable as attempts } from '../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { recordProviderExpense } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-accounting-store';
import type {
    TutorAccountingPort,
    TutorCallAdmission,
    TutorCallUsage,
} from '../../conversations/application/ports/tutor-runner';
import { learnerPortraitInterviewOperationsTable as operations } from './persistence/drizzle/schema';
import { assertLiveInterviewOperation } from './persistence/drizzle/drizzle-interview-store';

export type ActionInterviewExecution = InterviewExecution & {
    providerPrice: ProviderPrice | null;
    actionAccountingVersion: 1;
};
export function usesActionAccounting(
    execution: unknown,
): execution is ActionInterviewExecution {
    return (
        typeof execution === 'object' &&
        execution !== null &&
        'actionAccountingVersion' in execution &&
        execution.actionAccountingVersion === 1
    );
}
export function createInterviewActionAccounting(input: {
    withOperation<T>(work: (tx: AiCreditTransaction) => Promise<T>): Promise<T>;
    withTransaction<T>(
        work: (tx: AiCreditTransaction) => Promise<T>,
    ): Promise<T>;
    ownerId: string;
    operationId: string;
    leaseToken?: string;
    execution: ActionInterviewExecution;
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
                    cancelRequested: operations.cancelRequested,
                    errorCode: operations.errorCode,
                })
                .from(operations)
                .where(eq(operations.id, input.operationId))
                .for('update');
            const measuredStop =
                stopCandidate &&
                feature?.cancelRequested &&
                feature.errorCode === 'explicit_stop';
            const participant = new DrizzleActionAccountingParticipant(tx);
            await participant.recordAttempt({
                actionId: input.operationId,
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
            await recordProviderExpense(
                tx,
                {
                    attemptReference: `interview:${call.callId}`,
                    attemptId: call.callId,
                    actionId: input.operationId,
                    providerId: snapshot.providerId,
                    modelId: snapshot.modelId,
                    measurement: measured ? 'measured' : 'unknown',
                    costSource: expense !== null ? 'calculated' : 'unknown',
                    amountUsdMicros: expense,
                    occurredAt: attempt?.createdAt ?? new Date(),
                },
                { nativePrice: input.execution.providerPrice },
            );
        });
    }
    return {
        admit: (call) =>
            input.withOperation(async (tx) => {
                await assertLiveInterviewOperation(
                    tx,
                    input.operationId,
                    input.ownerId,
                );
                if (
                    !Number.isSafeInteger(call.inputTokenEstimate) ||
                    call.inputTokenEstimate < 0 ||
                    call.inputTokenEstimate >
                        readInterviewInputTokenLimit(input.execution) ||
                    !Number.isSafeInteger(call.maxOutputTokens) ||
                    call.maxOutputTokens < 1 ||
                    call.maxOutputTokens >
                        readInterviewOutputTokenLimit(input.execution)
                )
                    throw new Error('Interview request exceeds pinned limits.');
                if (call.purpose !== 'answer')
                    throw new Error('Interview memory calls are not enabled.');
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
                    throw new InterviewAccountingError(
                        'capacity_unavailable',
                        'AI capacity is currently unavailable. Try again later.',
                    );
                const previous = await tx
                    .select({ id: attempts.id })
                    .from(attempts)
                    .where(eq(attempts.actionId, input.operationId));
                if (previous.length >= 2)
                    throw new Error('Interview automatic retry limit reached.');
                if (!input.leaseToken)
                    throw new Error('Claimed execution lease is required.');
                const attempt = await new DrizzleActionAccountingParticipant(
                    tx,
                ).admitAttempt({
                    actionId: input.operationId,
                    executionWitness: {
                        jobId: input.operationId,
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

                return { maxOutputTokens: attempt.outputLimit };
            }),
        settle: (call, usage) => record(call, true, usage),
        fail: (call, reason, usage) =>
            record(call, false, usage, reason === 'aborted'),
    };
}

/** Terminal feature outcome and debit are committed together. Invalid schema is failure. */
export async function settleInterviewAction(
    tx: AiCreditTransaction,
    operation: Pick<
        typeof operations.$inferSelect,
        'id' | 'ownerId' | 'execution'
    > & { errorCode?: string | null },
    outcome: 'success' | 'stopped' | 'failure',
    at: Date,
) {
    if (!usesActionAccounting(operation.execution)) return;
    // Cleanup may revisit an expired or erased terminal operation. Preserve its
    // original settlement; the generic participant still rejects mismatched replays.
    await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${operation.ownerId},1920424381))`,
    );
    const participant = new DrizzleActionAccountingParticipant(tx);
    const action = await participant.read(operation.id, operation.ownerId);
    if (action.state !== 'active') return;
    const pending = await tx
        .select()
        .from(attempts)
        .where(eq(attempts.actionId, operation.id));
    for (const attempt of pending) {
        if (attempt.state !== 'dispatched') continue;
        await participant.recordAttempt({
            actionId: operation.id,
            ownerId: operation.ownerId,
            callId: attempt.id,
            successful: false,
            at,
        });
        const execution =
            operation.execution as unknown as ActionInterviewExecution;
        if (!execution.snapshot)
            throw new Error('Pinned interview execution is missing.');
        await recordProviderExpense(
            tx,
            {
                attemptReference: `interview:${attempt.id}`,
                attemptId: attempt.id,
                actionId: operation.id,
                providerId: execution.snapshot.providerId,
                modelId: execution.snapshot.modelId,
                measurement: 'unknown',
                costSource: 'unknown',
                amountUsdMicros: null,
                occurredAt: attempt.createdAt,
            },
            { nativePrice: execution.providerPrice },
        );
    }
    await participant.settle({
        actionId: operation.id,
        ownerId: operation.ownerId,
        outcome:
            outcome === 'failure' && operation.errorCode === 'explicit_stop'
                ? 'stopped'
                : outcome,
        at,
    });
}
