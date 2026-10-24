import { authorizeActionAllowance } from '../../ai-credits/infrastructure/action-allowance-consent';
import {
    reviewedTextProviderBudget,
    providerAffordableOutputTokens,
    ProviderCostAdmissionUnavailableError,
} from '../../ai-credits/domain/provider-cost-admission';
import { OperatorBudgetUnavailableError } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { parseFixed } from '../../ai-credits/domain/accounting';
import { pinProviderPrice } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import {
    createInterviewActionAccounting,
    settleInterviewAction,
    usesActionAccounting,
} from './interview-action-accounting';
import { DrizzleActionAccountingParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import {
    affordableActionOutput,
    maximumActionChargeNumerator,
    roundActionChargeMilli,
} from '../../ai-credits/domain/action-pricing';
import { parseCreditMilli } from '../../ai-credits/domain/exact-credit-amount';
import { ensureActionBudgetDefault } from '../../text-ai/infrastructure/persistence/drizzle/action-budget-default';
import { randomUUID } from 'node:crypto';
import { DrizzleCapabilityPolicyParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../infrastructure/text-ai/text-ai-capacity';
import { DrizzleAiCreditTransactionParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { maximumTextPrice } from '../../ai-credits/domain/model-price';
import {
    AiCreditInsufficientBalanceError,
    resolveAiCreditMeasurement,
} from '../../ai-credits/domain/ai-credit';
import { DrizzleTextAiAdmissionParticipant } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import {
    defaultTextAiProviderBudgetPolicy,
    textAiProviderUsageCostMicros,
    type TextAiExecutionSnapshot,
} from '../../text-ai/application/text-ai-provider-catalog';
import { TextAiSelectionUnavailableError } from '../../text-ai/application/text-ai-admission-participant';
import { aiCreditReservationsTable } from '../../ai-credits/infrastructure/persistence/drizzle/schema';
import type { TextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import type {
    TutorAccountingPort,
    TutorCallAdmission,
    TutorCallUsage,
} from '../../conversations/application/ports/tutor-runner';
import type { learnerPortraitInterviewOperationsTable as operations } from './persistence/drizzle/schema';
import type { InterviewOperation } from '../application/ports/interview-store';
import {
    interviewInputTokenLimit,
    INTERVIEW_MIN_OUTPUT_TOKENS,
    readInterviewOutputTokenLimit,
    readInterviewInputTokenLimit,
    type InterviewExecution,
} from './ai/interview-request';

export class InterviewAccountingError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'InterviewAccountingError';
    }
}
import { portraitInterviewProviderCallsTable as calls } from './persistence/drizzle/provider-call-schema';
import { assertLiveInterviewOperation } from './persistence/drizzle/drizzle-interview-store';
import { usersTable } from '../../users/infrastructure/persistence/drizzle/schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export function createInterviewAdmission(options: {
    selectionPolicy?: TextAiAvailabilityPolicy;
}) {
    return async (
        tx: Transaction,
        operation: InterviewOperation,
        paidAcknowledged: boolean,
        now: Date,
        request?: { requestKey: string; fingerprint: string },
    ): Promise<Record<string, unknown>> => {
        await lockTextAiCapacity(tx);
        const chargingPolicy = await new DrizzleCapabilityPolicyParticipant(
            tx,
        ).pinAction({
            jobId: operation.id,
            jobKind: 'portrait-interview',
            ownerId: operation.ownerId,
            at: now,
        });
        const operatorFunded = chargingPolicy.funding === 'operator';
        if (!operatorFunded && !paidAcknowledged)
            throw new InterviewAccountingError(
                'billing_notice_required',
                'Review the current interview credit notice before continuing.',
            );
        const input = { ownerId: operation.ownerId, operationId: operation.id };
        const execution = await new DrizzleTextAiAdmissionParticipant(
            tx,
            options.selectionPolicy,
        )
            .resolve({
                userId: input.ownerId,
                format: 'portrait-interview:v1',
                now,
                legacyBudget: defaultTextAiProviderBudgetPolicy,
            })
            .catch((error: unknown) => {
                if (error instanceof TextAiSelectionUnavailableError)
                    throw new InterviewAccountingError(
                        'model_unavailable',
                        'The selected model is unavailable for interviews. Choose Auto or DeepSeek Flash and try again.',
                    );
                throw error;
            });
        if (
            !execution.snapshot?.creditPricing ||
            execution.snapshot.modelId !== 'deepseek-flash'
        )
            throw new InterviewAccountingError(
                'model_unavailable',
                'The selected model does not support interviews. Choose Auto or DeepSeek Flash.',
            );
        if (
            execution.snapshot.perCallMaxOutputTokens <
            INTERVIEW_MIN_OUTPUT_TOKENS
        )
            throw new InterviewAccountingError(
                'model_unavailable',
                'The selected model cannot provide a useful interview response.',
            );
        const account = operatorFunded
            ? null
            : await new DrizzleAiCreditTransactionParticipant(
                  tx,
              ).accountSummary(input.ownerId, now);
        const inputTokenLimit = interviewInputTokenLimit(
            operation,
            execution.snapshot.perCallMaxInputTokens,
        );
        const capability = new DrizzleCapabilityPolicyParticipant(tx);
        const preference = await ensureActionBudgetDefault(
            tx,
            input.ownerId,
            now,
        );
        const settings = await capability.settings();
        const budget = preference?.maxCreditsPerAction ?? null;
        const funding = operatorFunded
            ? 'operator'
            : account?.policy.effectiveMode === 'unlimited'
              ? 'unlimited'
              : 'customer';
        const zeroCustomerTariff = [
            execution.snapshot.creditPricing.inputCreditsPerMillionTokens,
            execution.snapshot.creditPricing.outputCreditsPerMillionTokens,
            execution.snapshot.creditPricing
                .cachedInputCreditsPerMillionTokens ??
                execution.snapshot.creditPricing.inputCreditsPerMillionTokens,
        ].every((rate) => rate === 0);
        if (funding === 'customer' && !budget && !zeroCustomerTariff)
            throw new InterviewAccountingError(
                'action_budget_unconfigured',
                'Configure an AI action budget before starting paid work.',
            );
        const providerPrice = await pinProviderPrice(tx, {
            providerId: execution.snapshot.providerId,
            modelId: execution.snapshot.modelId,
            meter: 'text-tokens',
            at: now,
        });
        try {
            execution.budget = reviewedTextProviderBudget(
                providerPrice,
                execution.budget,
                { read: 'input-price-upper-bound', write: 'none' },
            );
            if (
                !settings.maxProviderCostUsdPerAction ||
                !settings.maxProviderCostUsdPerAccountDay ||
                !settings.maxProviderCostUsdPerDay
            )
                throw new OperatorBudgetUnavailableError(
                    'Operator spending limits must be configured.',
                );
            const inputLimitTotal = Math.min(
                execution.budget.maxInputTokensPerAttempt,
                inputTokenLimit * 2,
            );
            execution.budget.maxCostMicrosPerAttempt = Math.min(
                execution.budget.maxCostMicrosPerAttempt,
                Number(parseFixed(settings.maxProviderCostUsdPerAction, 6)),
                textAiProviderUsageCostMicros(execution.budget, {
                    inputTokens: inputLimitTotal,
                    outputTokens: 10000,
                }) +
                    (execution.budget.inputCostMicrosPerMillionTokens > 0
                        ? 1
                        : 0) +
                    (execution.budget.outputCostMicrosPerMillionTokens > 0
                        ? 1
                        : 0),
            );
        } catch (error) {
            if (
                error instanceof ProviderCostAdmissionUnavailableError ||
                error instanceof OperatorBudgetUnavailableError
            )
                throw new InterviewAccountingError(
                    'model_unavailable',
                    'Reviewed provider pricing and operator spending limits must be configured before interviews are enabled.',
                );
            throw error;
        }
        const tariff = {
            ...(execution.snapshot.creditPricing
                .cachedInputCreditsPerMillionTokens != null
                ? {
                      cachedInputCreditsPerMillionTokens: String(
                          execution.snapshot.creditPricing
                              .cachedInputCreditsPerMillionTokens,
                      ),
                  }
                : {}),
            inputCreditsPerMillionTokens: String(
                execution.snapshot.creditPricing.inputCreditsPerMillionTokens,
            ),
            outputCreditsPerMillionTokens: String(
                execution.snapshot.creditPricing.outputCreditsPerMillionTokens,
            ),
        };
        const plannedMaximumMilli = roundActionChargeMilli(
            maximumActionChargeNumerator(
                {
                    inputTokens: Math.min(
                        execution.budget.maxInputTokensPerAttempt,
                        inputTokenLimit * 2,
                    ),
                    outputTokens: Math.min(
                        10000,
                        execution.snapshot.perCallMaxOutputTokens,
                    ),
                },
                tariff,
            ),
        );
        const accepted = await authorizeActionAllowance(tx, {
            ownerId: operation.ownerId,
            scope: `portrait-interview:${operation.interviewId}`,
            requestKey: request?.requestKey ?? operation.id,
            fingerprint:
                request?.fingerprint ?? JSON.stringify(operation.input),
            authorization: {
                snapshot: execution.snapshot,
                chargingPolicy,
                budget,
                providerPrice,
                inputTokenLimit,
            },
            funding,
            tariff,
            budgetMilli: budget ? parseCreditMilli(budget) : 0n,
            maximumMilli: plannedMaximumMilli,
            inputTokens: inputTokenLimit,
            outputLimit: Math.min(
                10000,
                execution.snapshot.perCallMaxOutputTokens,
            ),
            providerBudget: execution.budget,
            at: now,
        }).catch((error: unknown) => {
            // Allowance admission can reject before a reservation is attempted.
            if (error instanceof AiCreditInsufficientBalanceError)
                throw new InterviewAccountingError(
                    'credits_exhausted',
                    'You do not have enough AI credits for input and any output.',
                );
            throw error;
        });
        const action = await new DrizzleActionAccountingParticipant(tx)
            .reserve({
                id: operation.id,
                ownerId: operation.ownerId,
                capability: 'portrait-interview',
                funding,
                policyVersion: chargingPolicy.version,
                tariff,
                budgetMilli: budget ? parseCreditMilli(budget) : 0n,
                holdMaximumMilli: accepted.holdMaximumMilli,
                outputLimit: accepted.outputLimit,
                operatorMaximumMicros: BigInt(
                    execution.budget.maxCostMicrosPerAttempt,
                ),
                at: now,
                deadlineAt: new Date(now.getTime() + 15 * 60_000),
            })
            .catch((error: unknown) => {
                if (error instanceof AiCreditInsufficientBalanceError)
                    throw new InterviewAccountingError(
                        'credits_exhausted',
                        'You do not have enough AI credits for input and any output.',
                    );
                if (error instanceof OperatorBudgetUnavailableError)
                    throw new InterviewAccountingError(
                        'capacity_unavailable',
                        'The AI spending allowance is currently unavailable. Try again later.',
                    );
                throw error;
            });
        const modelOutputLimit = Math.min(
            10_000,
            execution.snapshot.perCallMaxOutputTokens,
            action.outputLimit,
        );
        const creditOutputLimit =
            funding === 'customer'
                ? affordableActionOutput({
                      budgetMilli: action.heldMilli,
                      inputTokens: inputTokenLimit,
                      outputLimit: modelOutputLimit,
                      tariff,
                  })
                : modelOutputLimit;
        if (creditOutputLimit < 1)
            throw new InterviewAccountingError(
                'credits_exhausted',
                'You do not have enough AI credits for input and any output.',
            );
        const outputTokenLimit = providerAffordableOutputTokens({
            inputTokens: inputTokenLimit,
            outputLimit: creditOutputLimit,
            budget: execution.budget,
        });
        if (outputTokenLimit < 1)
            throw new InterviewAccountingError(
                'capacity_unavailable',
                'The selected model exceeds the available execution allowance. Try another model or try again later.',
            );
        const capacity = await readTextAiCapacity(tx, {
            actorId: input.ownerId,
            now,
            budget: execution.budget,
        });
        if (
            capacity.globalQueued >= 100 ||
            capacity.actorQueued >= 5 ||
            !textAiProviderBudgetAllows(
                capacity.providerUsage,
                true,
                execution.budget,
            )
        )
            throw new InterviewAccountingError(
                'capacity_unavailable',
                'AI capacity is currently unavailable. Try again later.',
            );
        return {
            ...execution,
            chargingPolicy,
            actionAccountingVersion: 1,
            providerPrice,
            heldCreditsMilli: action.heldMilli.toString(),
            funding: action.funding,
            interviewInputTokenLimit: inputTokenLimit,
            interviewOutputTokenLimit: outputTokenLimit,
        };
    };
}

/** The operation fence surrounds dispatch; numerical settlement survives content deletion. */
export function createInterviewAccounting(input: {
    database: Database;
    withOperation<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
    ownerId: string;
    operationId: string;
    leaseToken?: string;
    execution: InterviewExecution;
}): TutorAccountingPort {
    if (usesActionAccounting(input.execution))
        return createInterviewActionAccounting({
            ...input,
            execution: input.execution,
            withTransaction: (work) => input.database.transaction(work),
        });
    const snapshot = input.execution.snapshot;
    if (!snapshot?.creditPricing || snapshot.modelId !== 'deepseek-flash')
        throw new Error('Interview execution is unavailable.');
    const selected: TextAiExecutionSnapshot = snapshot;
    const pricing = snapshot.creditPricing;
    const policy = input.execution.budget;
    const inputTokenLimit = readInterviewInputTokenLimit(input.execution);
    const outputTokenLimit = readInterviewOutputTokenLimit(input.execution);
    async function settle(call: TutorCallAdmission, usage?: TutorCallUsage) {
        await input.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            // Erasure takes owner before provider-call rows. Settlement must use
            // that order too, including for an inactive owner with live liability.
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');
            const [row] = await tx
                .select()
                .from(calls)
                .where(
                    and(
                        eq(calls.id, call.callId),
                        eq(calls.ownerId, input.ownerId),
                        eq(calls.operationId, input.operationId),
                    ),
                )
                .for('update');
            if (!row || row.state === 'settled') return;
            await settleInterviewCall(
                tx,
                row,
                selected,
                input.execution.chargingPolicy?.funding === 'operator' ||
                    input.execution.interviewCreditsBypass === true,
                usage,
            );
        });
    }
    return {
        async admit(call) {
            if (call.purpose !== 'answer')
                throw new InterviewAccountingError(
                    'invalid_call',
                    'Interview memory calls are not enabled.',
                );
            await input.withOperation(async (tx) => {
                await assertLiveInterviewOperation(
                    tx,
                    input.operationId,
                    input.ownerId,
                );
                await lockTextAiCapacity(tx);
                const previous = await tx
                    .select()
                    .from(calls)
                    .where(eq(calls.operationId, input.operationId));
                if (previous.some((row) => row.id === call.callId))
                    throw new Error('Provider dispatch cannot be replayed.');
                const memoryCalls = previous.filter(
                    (row) => row.purpose !== 'actor',
                ).length;
                if (
                    previous.length >= 2 ||
                    (call.purpose !== 'answer' &&
                        (memoryCalls >= 2 || previous.length >= 4))
                )
                    throw new Error('Interview provider-call limit reached.');
                const inputTokens = inputTokenLimit;
                const outputCap = Math.min(
                    selected.perCallMaxOutputTokens,
                    call.purpose === 'answer' ? outputTokenLimit : 2048,
                );
                const outputTokens = Math.min(outputCap, call.maxOutputTokens);
                if (
                    !Number.isSafeInteger(call.inputTokenEstimate) ||
                    call.inputTokenEstimate < 0 ||
                    call.inputTokenEstimate > inputTokens ||
                    !Number.isSafeInteger(call.maxOutputTokens) ||
                    call.maxOutputTokens > outputCap ||
                    !Number.isSafeInteger(outputTokens) ||
                    outputTokens <= 0
                )
                    throw new Error('Interview request exceeds model limits.');
                const reservedCost = textAiProviderUsageCostMicros(policy, {
                    inputTokens,
                    outputTokens,
                });
                const totals = previous.reduce(
                    (sum, row) => ({
                        input:
                            sum.input +
                            (row.state === 'settled'
                                ? row.actualInputTokens
                                : row.reservedInputTokens),
                        output:
                            sum.output +
                            (row.state === 'settled'
                                ? row.actualOutputTokens
                                : row.reservedOutputTokens),
                        cost:
                            sum.cost +
                            (row.state === 'settled'
                                ? row.actualCostMicros
                                : row.reservedCostMicros),
                    }),
                    { input: 0, output: 0, cost: 0 },
                );
                if (
                    totals.input + inputTokens >
                        policy.maxInputTokensPerAttempt ||
                    totals.output + outputTokens >
                        Math.min(10_000, policy.maxOutputTokensPerAttempt) ||
                    totals.cost + reservedCost > policy.maxCostMicrosPerAttempt
                )
                    throw new Error('Interview response budget reached.');
                const capacity = await readTextAiCapacity(tx, {
                    actorId: input.ownerId,
                    now: new Date(),
                    budget: policy,
                });
                if (
                    !textAiProviderBudgetAllows(
                        capacity.providerUsage,
                        true,
                        policy,
                    )
                )
                    throw new InterviewAccountingError(
                        'capacity_unavailable',
                        'AI capacity is currently unavailable. Try again later.',
                    );
                const id = randomUUID(),
                    now = new Date();
                const credit = new DrizzleAiCreditTransactionParticipant(tx);
                await tx.insert(calls).values({
                    id: call.callId,
                    operationId: input.operationId,
                    ownerId: input.ownerId,
                    ordinal: previous.length + 1,
                    purpose: 'actor',
                    reservationId: id,
                    state: 'dispatched',
                    createdAt: now,
                    dispatchedAt: now,
                    reservedInputTokens: inputTokens,
                    reservedOutputTokens: outputTokens,
                    reservedCostMicros: reservedCost,
                    ...policy,
                });
                if (!(
                    input.execution.chargingPolicy?.funding === 'operator' ||
                    input.execution.interviewCreditsBypass === true
                )) {
                    await credit
                        .reserveAttempt({
                            at: now,
                            attempt: previous.length + 1,
                            jobId: input.operationId,
                            jobKind: 'portrait-interview',
                            maximumCredits: BigInt(
                                maximumTextPrice(
                                    {
                                        maxInputTokensPerAttempt: inputTokens,
                                        maxOutputTokensPerAttempt: outputTokens,
                                    },
                                    pricing,
                                ),
                            ),
                            ownerId: input.ownerId,
                            reservationId: id,
                        })
                        .catch((error: unknown) => {
                            if (
                                error instanceof
                                AiCreditInsufficientBalanceError
                            )
                                throw new InterviewAccountingError(
                                    'credits_exhausted',
                                    'You do not have enough AI credits to continue this response.',
                                );
                            throw error;
                        });
                    await credit.markProviderDispatched({
                        dispatchedAt: now,
                        ownerId: input.ownerId,
                        reservationId: id,
                    });
                }
            });
        },
        settle,
        fail: async (call) => settle(call),
    };
}

async function settleInterviewCall(
    tx: Transaction,
    row: typeof calls.$inferSelect,
    snapshot: TextAiExecutionSnapshot,
    operatorFunded: boolean,
    usage?: TutorCallUsage,
) {
    if (!snapshot.creditPricing)
        throw new Error('Pinned credit pricing is missing.');
    const valid =
        usage &&
        Number.isSafeInteger(usage.inputTokens) &&
        Number.isSafeInteger(usage.outputTokens) &&
        usage.inputTokens >= 0 &&
        usage.outputTokens >= 0 &&
        usage.inputTokens <= row.reservedInputTokens &&
        usage.outputTokens <= row.reservedOutputTokens;
    const tokens = valid
        ? usage
        : {
              inputTokens: row.reservedInputTokens,
              outputTokens: row.reservedOutputTokens,
          };
    const measured =
        valid &&
        ((tokens.inputTokens > 0 &&
            snapshot.creditPricing.inputCreditsPerMillionTokens > 0) ||
            (tokens.outputTokens > 0 &&
                snapshot.creditPricing.outputCreditsPerMillionTokens > 0))
            ? maximumTextPrice(
                  {
                      maxInputTokensPerAttempt: tokens.inputTokens,
                      maxOutputTokensPerAttempt: tokens.outputTokens,
                  },
                  snapshot.creditPricing,
              )
            : valid
              ? 0
              : null;
    const credit = new DrizzleAiCreditTransactionParticipant(tx);
    const now = new Date();
    if (!operatorFunded) {
        const [reservation] = await tx
            .select({ policyMode: aiCreditReservationsTable.policyMode })
            .from(aiCreditReservationsTable)
            .where(
                and(
                    eq(aiCreditReservationsTable.id, row.reservationId),
                    eq(aiCreditReservationsTable.ownerId, row.ownerId),
                ),
            );
        if (!reservation)
            throw new Error('Pinned credit reservation is missing.');
        await credit.settleAttempt({
            ownerId: row.ownerId,
            reservationId: row.reservationId,
            settledAt: now,
            measurement: resolveAiCreditMeasurement(
                reservation.policyMode,
                Boolean(valid),
            ),
            measuredCredits: measured === null ? null : BigInt(measured),
        });
    }
    await tx
        .update(calls)
        .set({
            state: 'settled',
            settledAt: now,
            actualInputTokens: tokens.inputTokens,
            actualOutputTokens: tokens.outputTokens,
            actualCostMicros: textAiProviderUsageCostMicros(row, tokens),
        })
        .where(eq(calls.id, row.id));
}

/** Lease recovery settles unknown dispatched calls once and never issues them again. */
export async function settleInterruptedInterviewCalls(
    tx: Transaction,
    turn: Pick<typeof operations.$inferSelect, 'id' | 'ownerId' | 'execution'> &
        Partial<
            Pick<
                typeof operations.$inferSelect,
                'cancelRequested' | 'errorCode'
            >
        >,
) {
    if (usesActionAccounting(turn.execution)) {
        await settleInterviewAction(
            tx,
            turn,
            turn.cancelRequested && turn.errorCode === 'explicit_stop'
                ? 'stopped'
                : 'failure',
            new Date(),
        );
        return;
    }
    const execution = turn.execution as unknown as InterviewExecution;
    const rows = await tx
        .select()
        .from(calls)
        .where(
            and(
                eq(calls.operationId, turn.id),
                eq(calls.ownerId, turn.ownerId),
            ),
        )
        .for('update');
    for (const row of rows) {
        if (row.state === 'settled') continue;
        if (!execution.snapshot)
            throw new Error('Pinned execution is missing.');
        await settleInterviewCall(
            tx,
            row,
            execution.snapshot,
            execution.chargingPolicy?.funding === 'operator' ||
                execution.interviewCreditsBypass === true,
        );
    }
}
