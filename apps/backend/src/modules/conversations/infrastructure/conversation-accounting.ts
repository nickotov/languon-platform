import { prepareAdminTextAiRouting } from '../../text-ai/infrastructure/persistence/drizzle/routing-admission';
import { defaultTextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import {
    reviewedTextProviderBudget,
    ProviderCostAdmissionUnavailableError,
    providerAffordableOutputTokens,
} from '../../ai-credits/domain/provider-cost-admission';
import { parseFixed } from '../../ai-credits/domain/accounting';
import { OperatorBudgetUnavailableError } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { DrizzleActionAccountingParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleCapabilityPolicyParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { pinProviderPrice } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import {
    maximumActionChargeNumerator,
    roundActionChargeMilli,
    affordableActionOutput,
} from '../../ai-credits/domain/action-pricing';
import { aiCreditActionQuotesTable as quotes } from '../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import {
    formatCreditMilli,
    parseCreditMilli,
} from '../../ai-credits/domain/exact-credit-amount';
import { textAiPreferencesTable } from '../../text-ai/infrastructure/persistence/drizzle/schema';
import { createHash, randomUUID } from 'node:crypto';
import {
    createConversationActionAccounting,
    usesActionAccounting,
} from './conversation-action-accounting';
import { and, eq, sql } from 'drizzle-orm';
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
import {
    TextAiSelectionUnavailableError,
    type TextAiAdmissionExecution,
} from '../../text-ai/application/text-ai-admission-participant';
import { aiCreditReservationsTable } from '../../ai-credits/infrastructure/persistence/drizzle/schema';
import type { TextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import type {
    TutorAccountingPort,
    TutorCallAdmission,
    TutorCallUsage,
} from '../application/ports/tutor-runner';
import { conversationTurnsTable as turns } from './persistence/drizzle/schema';
import { ConversationError } from '../domain/conversation';
import { conversationProviderCallsTable as calls } from './persistence/drizzle/conversation-provider-call-schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export function conversationAdmission(policy?: TextAiAvailabilityPolicy) {
    const availability = policy ?? defaultTextAiAvailabilityPolicy();
    const admit = async (
        tx: Transaction,
        input: {
            ownerId: string;
            turnId: string;
            conversationId: string;
            requestId?: string;
            fingerprint?: string;
            confirmedQuoteId?: string;
            inputTokenBound?: number;
        },
    ): Promise<Record<string, unknown>> => {
        await lockTextAiCapacity(tx);
        const now = new Date();
        const execution = await new DrizzleTextAiAdmissionParticipant(
            tx,
            availability,
        )
            .resolve({
                userId: input.ownerId,
                format: 'conversation:v1',
                now,
                legacyBudget: defaultTextAiProviderBudgetPolicy,
            })
            .catch((error: unknown) => {
                if (error instanceof TextAiSelectionUnavailableError)
                    throw new ConversationError(
                        'model_unavailable',
                        'AI is unavailable right now. Your messages are kept. Try again later.',
                    );
                throw error;
            });
        if (
            !execution.snapshot?.creditPricing ||
            !execution.snapshot.supportedFormats.includes('conversation:v1')
        )
            throw new ConversationError(
                'model_unavailable',
                'AI is unavailable right now. Your messages are kept. Try again later.',
            );
        const account = await new DrizzleAiCreditTransactionParticipant(
            tx,
        ).accountSummary(input.ownerId, now);
        const capability = new DrizzleCapabilityPolicyParticipant(tx);
        const charging = await capability.current('conversation');
        if (
            charging.funding !== 'operator' &&
            execution.snapshot.routingAuthority?.tariffPublished === false
        )
            throw new ConversationError(
                'model_unavailable',
                'AI is not configured for this action. Try again later.',
            );
        const funding =
            charging.funding === 'operator'
                ? 'operator'
                : account.policy.effectiveMode === 'unlimited'
                  ? 'unlimited'
                  : 'customer';
        const [preference] = await tx
            .select({
                maxCreditsPerAction: textAiPreferencesTable.maxCreditsPerAction,
            })
            .from(textAiPreferencesTable)
            .where(eq(textAiPreferencesTable.userId, input.ownerId));
        const settings = await capability.settings();
        const defaultBudget = settings.defaultMaxCreditsPerAction;
        const budget = preference?.maxCreditsPerAction ?? defaultBudget;
        const zeroCustomerTariff = [
            execution.snapshot.creditPricing.inputCreditsPerMillionTokens,
            execution.snapshot.creditPricing.outputCreditsPerMillionTokens,
            execution.snapshot.creditPricing
                .cachedInputCreditsPerMillionTokens ??
                execution.snapshot.creditPricing.inputCreditsPerMillionTokens,
        ].every((rate) => rate === 0);
        if (funding === 'customer' && !budget && !zeroCustomerTariff)
            throw new ConversationError(
                'action_budget_unconfigured',
                'An AI action budget must be configured before sending.',
            );
        const pinnedCandidate =
            execution.snapshot.routingAuthority?.candidates.find(
                (candidate) =>
                    candidate.snapshot.providerId ===
                        execution.snapshot.providerId &&
                    candidate.snapshot.modelId === execution.snapshot.modelId,
            );
        const providerPrice =
            pinnedCandidate?.providerPrice ??
            (await pinProviderPrice(tx, {
                providerId: execution.snapshot.providerId,
                modelId: execution.snapshot.modelId,
                meter: 'text-tokens',
                at: now,
            }));
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
            const operatorMaximum = parseFixed(
                settings.maxProviderCostUsdPerAction,
                6,
            );
            execution.budget.maxCostMicrosPerAttempt = Math.min(
                execution.budget.maxCostMicrosPerAttempt,
                Number(operatorMaximum),
            );
        } catch (error) {
            if (
                error instanceof ProviderCostAdmissionUnavailableError ||
                error instanceof OperatorBudgetUnavailableError
            )
                throw new ConversationError(
                    'model_unavailable',
                    'Reviewed provider pricing and operator spending limits must be configured before generation is enabled.',
                );
            throw error;
        }
        if (
            !Number.isSafeInteger(input.inputTokenBound) ||
            (input.inputTokenBound ?? 0) < 1
        )
            throw new ConversationError(
                'context_too_large',
                'A bounded conversation context is required for admission.',
            );
        const admittedMaxInputTokens = Math.min(
            execution.snapshot.perCallMaxInputTokens,
            input.inputTokenBound!,
        );
        const totalInputLimit = Math.min(
            execution.budget.maxInputTokensPerAttempt,
            admittedMaxInputTokens * 5,
        );
        execution.budget.maxCostMicrosPerAttempt = Math.min(
            execution.budget.maxCostMicrosPerAttempt,
            textAiProviderUsageCostMicros(execution.budget, {
                inputTokens: totalInputLimit,
                outputTokens: 10000,
            }) +
                (execution.budget.inputCostMicrosPerMillionTokens > 0 ? 4 : 0) +
                (execution.budget.outputCostMicrosPerMillionTokens > 0 ? 4 : 0),
        );
        if (
            providerAffordableOutputTokens({
                inputTokens: admittedMaxInputTokens,
                outputLimit: 10000,
                budget: execution.budget,
            }) < 1
        )
            throw new ConversationError(
                'capacity_unavailable',
                'The AI request exceeds the available execution allowance. Try again later.',
            );
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
                { inputTokens: totalInputLimit, outputTokens: 10000 },
                tariff,
            ),
        );
        const authorizedBudgetMilli = budget ? parseCreditMilli(budget) : 0n;
        let acceptedBudgetMilli =
            authorizedBudgetMilli < plannedMaximumMilli
                ? authorizedBudgetMilli
                : plannedMaximumMilli;
        if (funding === 'customer' && !zeroCustomerTariff) {
            const available = account.availableCredits;
            const held =
                acceptedBudgetMilli < available
                    ? acceptedBudgetMilli
                    : available;
            const customerAllowance = affordableActionOutput({
                budgetMilli: held,
                inputTokens: admittedMaxInputTokens,
                outputLimit: 10000,
                tariff,
            });
            if (customerAllowance < 1)
                throw new ConversationError(
                    'credits_exhausted',
                    'You do not have enough AI credits for input and any output.',
                );
            const allowance = providerAffordableOutputTokens({
                inputTokens: admittedMaxInputTokens,
                outputLimit: customerAllowance,
                budget: execution.budget,
            });
            if (allowance < 1)
                throw new ConversationError(
                    'credits_exhausted',
                    'You do not have enough AI credits for input and any output.',
                );
            const authorizationFingerprint = createHash('sha256')
                .update(
                    JSON.stringify({
                        execution,
                        charging,
                        budget,
                        providerPrice,
                    }),
                )
                .digest('hex');
            const [offered] = input.requestId
                ? await tx
                      .select()
                      .from(quotes)
                      .where(
                          and(
                              eq(quotes.ownerId, input.ownerId),
                              eq(quotes.conversationId, input.conversationId),
                              eq(quotes.requestId, input.requestId),
                          ),
                      )
                      .for('update')
                : [];
            if (offered && offered.fingerprint !== input.fingerprint)
                throw new ConversationError(
                    'idempotency_conflict',
                    'This request identifier has already been used for another message.',
                );
            if (
                !input.confirmedQuoteId &&
                offered &&
                offered.authorizationFingerprint === authorizationFingerprint &&
                offered.expiresAt > now &&
                offered.heldMilli <= held &&
                offered.outputAllowance <= allowance
            )
                return {
                    confirmationRequired: true,
                    quote: {
                        id: offered.id,
                        maximumCredits: formatCreditMilli(offered.heldMilli),
                        approximateOutputTokens: offered.outputAllowance,
                        expiresAt: offered.expiresAt.toISOString(),
                    },
                };
            const [confirmed] = input.confirmedQuoteId
                ? await tx
                      .select()
                      .from(quotes)
                      .where(eq(quotes.id, input.confirmedQuoteId))
                      .for('update')
                : [];
            const validQuote =
                confirmed &&
                confirmed.ownerId === input.ownerId &&
                confirmed.conversationId === input.conversationId &&
                confirmed.requestId === input.requestId &&
                confirmed.fingerprint === input.fingerprint &&
                confirmed.authorizationFingerprint ===
                    authorizationFingerprint &&
                confirmed.expiresAt > now &&
                confirmed.heldMilli <= held &&
                confirmed.outputAllowance <= allowance;
            if (
                (allowance < 10000 ||
                    held < acceptedBudgetMilli ||
                    input.confirmedQuoteId) &&
                !validQuote
            ) {
                if (!input.requestId || !input.fingerprint)
                    throw new ConversationError(
                        'action_confirmation_required',
                        'Confirm the available output allowance before sending.',
                    );
                const quote = {
                    id: randomUUID(),
                    ownerId: input.ownerId,
                    conversationId: input.conversationId,
                    requestId: input.requestId,
                    fingerprint: input.fingerprint,
                    authorizationFingerprint,
                    heldMilli: held,
                    outputAllowance: allowance,
                    expiresAt: new Date(now.getTime() + 5 * 60_000),
                };
                await tx
                    .insert(quotes)
                    .values(quote)
                    .onConflictDoUpdate({
                        target: [
                            quotes.ownerId,
                            quotes.conversationId,
                            quotes.requestId,
                        ],
                        set: quote,
                    });
                return {
                    confirmationRequired: true,
                    quote: {
                        id: quote.id,
                        maximumCredits: formatCreditMilli(held),
                        approximateOutputTokens: allowance,
                        expiresAt: quote.expiresAt.toISOString(),
                    },
                };
            }
            if (validQuote) acceptedBudgetMilli = confirmed.heldMilli;
        }
        const pinned = await capability.pinAction({
            jobId: input.turnId,
            jobKind: 'conversation-turn',
            ownerId: input.ownerId,
            at: now,
            policy: charging,
        });
        if (
            pinned.version !== charging.version ||
            pinned.funding !== charging.funding
        )
            throw new ConversationError(
                'model_unavailable',
                'The charging policy changed. Review the refreshed allowance and try again.',
            );
        const action = await new DrizzleActionAccountingParticipant(tx)
            .reserve({
                id: input.turnId,
                ownerId: input.ownerId,
                capability: 'conversation',
                funding,
                policyVersion: charging.version,
                tariff,
                budgetMilli: authorizedBudgetMilli,
                holdMaximumMilli: acceptedBudgetMilli,
                operatorMaximumMicros: BigInt(
                    execution.budget.maxCostMicrosPerAttempt,
                ),
                operatorSettings: settings,
                at: now,
                deadlineAt: new Date(now.getTime() + 15 * 60_000),
            })
            .catch((error: unknown) => {
                if (error instanceof OperatorBudgetUnavailableError)
                    throw new ConversationError(
                        'capacity_unavailable',
                        'The AI spending allowance is currently unavailable. Try again later.',
                    );
                throw error;
            });
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
            throw new ConversationError(
                'capacity_unavailable',
                'AI capacity is currently unavailable. Try again later.',
            );
        return {
            ...execution,
            actionAccountingVersion: 1,
            providerPrice,
            admittedMaxInputTokens,
            heldCreditsMilli: action.heldMilli.toString(),
            funding: action.funding,
        };
    };
    return Object.assign(admit, {
        prepare: async (tx: Transaction) => {
            if (
                !availability.routingEnabled ||
                availability.pricingAdmissionEnabled === false
            )
                return;
            await prepareAdminTextAiRouting(tx, {
                format: 'conversation:v1',
                now: new Date(),
                credentialConfigured: availability.credentialConfigured,
                ...(availability.routeFingerprint
                    ? { routeFingerprint: availability.routeFingerprint }
                    : {}),
            });
        },
    });
}

/** The operation fence surrounds dispatch; numerical settlement survives content deletion. */
export function createConversationAccounting(input: {
    database: Database;
    withOperation<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
    ownerId: string;
    turnId: string;
    leaseToken?: string;
    execution: TextAiAdmissionExecution;
}): TutorAccountingPort {
    if (usesActionAccounting(input.execution))
        return createConversationActionAccounting({
            ...input,
            execution: input.execution,
            withTransaction: (work) => input.database.transaction(work),
        });
    const snapshot = input.execution.snapshot;
    if (
        !snapshot?.creditPricing ||
        !snapshot.supportedFormats.includes('conversation:v1')
    )
        throw new Error('Conversation execution is unavailable.');
    const selected: TextAiExecutionSnapshot = snapshot;
    const pricing = snapshot.creditPricing;
    const policy = input.execution.budget;
    const purpose = {
        answer: 'actor',
        observation: 'observer',
        reflection: 'reflector',
    } as const;
    async function settle(call: TutorCallAdmission, usage?: TutorCallUsage) {
        await input.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            const [row] = await tx
                .select()
                .from(calls)
                .where(
                    and(
                        eq(calls.id, call.callId),
                        eq(calls.ownerId, input.ownerId),
                        eq(calls.turnId, input.turnId),
                    ),
                )
                .for('update');
            if (!row || row.state === 'settled') return;
            await settleConversationCall(tx, row, selected, usage);
        });
    }
    return {
        async admit(call) {
            await input.withOperation(async (tx) => {
                await lockTextAiCapacity(tx);
                const previous = await tx
                    .select()
                    .from(calls)
                    .where(eq(calls.turnId, input.turnId));
                if (previous.some((row) => row.id === call.callId))
                    throw new Error('Provider dispatch cannot be replayed.');
                const memoryCalls = previous.filter(
                    (row) => row.purpose !== 'actor',
                ).length;
                if (
                    previous.length >= 5 ||
                    (call.purpose !== 'answer' &&
                        (memoryCalls >= 2 || previous.length >= 4))
                )
                    throw new Error(
                        'Conversation provider-call limit reached.',
                    );
                const inputTokens = selected.perCallMaxInputTokens;
                const outputCap = Math.min(
                    selected.perCallMaxOutputTokens,
                    call.purpose === 'answer' ? 4096 : 2048,
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
                    throw new Error(
                        'Conversation request exceeds model limits.',
                    );
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
                        policy.maxOutputTokensPerAttempt ||
                    totals.cost + reservedCost > policy.maxCostMicrosPerAttempt
                )
                    throw new Error('Conversation turn budget reached.');
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
                    throw new ConversationError(
                        'capacity_unavailable',
                        'AI capacity is currently unavailable. Try again later.',
                    );
                const id = randomUUID(),
                    now = new Date();
                const credit = new DrizzleAiCreditTransactionParticipant(tx);
                await tx.insert(calls).values({
                    id: call.callId,
                    turnId: input.turnId,
                    ownerId: input.ownerId,
                    ordinal: previous.length + 1,
                    purpose: purpose[call.purpose],
                    reservationId: id,
                    state: 'dispatched',
                    createdAt: now,
                    dispatchedAt: now,
                    reservedInputTokens: inputTokens,
                    reservedOutputTokens: outputTokens,
                    reservedCostMicros: reservedCost,
                    ...policy,
                });
                await credit
                    .reserveAttempt({
                        at: now,
                        attempt: previous.length + 1,
                        jobId: input.turnId,
                        jobKind: 'conversation-turn',
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
                        if (error instanceof AiCreditInsufficientBalanceError)
                            throw new ConversationError(
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
                await tx
                    .update(turns)
                    .set({ providerDispatched: true })
                    .where(eq(turns.id, input.turnId));
            });
        },
        settle,
        fail: async (call) => settle(call),
    };
}

async function settleConversationCall(
    tx: Transaction,
    row: typeof calls.$inferSelect,
    snapshot: TextAiExecutionSnapshot,
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
    const [reservation] = await tx
        .select({ policyMode: aiCreditReservationsTable.policyMode })
        .from(aiCreditReservationsTable)
        .where(
            and(
                eq(aiCreditReservationsTable.id, row.reservationId),
                eq(aiCreditReservationsTable.ownerId, row.ownerId),
            ),
        );
    if (!reservation) throw new Error('Pinned credit reservation is missing.');
    const settlement = await credit.settleAttempt({
        ownerId: row.ownerId,
        reservationId: row.reservationId,
        settledAt: now,
        measurement: resolveAiCreditMeasurement(
            reservation.policyMode,
            Boolean(valid),
        ),
        measuredCredits: measured === null ? null : BigInt(measured),
    });
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
    await tx.execute(
        sql`update conversation_turns set usage=jsonb_build_object('inputTokens',coalesce((usage->>'inputTokens')::bigint,0)+${tokens.inputTokens},'outputTokens',coalesce((usage->>'outputTokens')::bigint,0)+${tokens.outputTokens},'chargedCredits',(coalesce((usage->>'chargedCredits')::bigint,0)+${settlement.chargedCredits.toString()}::bigint)::text,'estimated',coalesce((usage->>'estimated')::boolean,false) or ${!valid}) where id=${row.turnId}::uuid`,
    );
}

/** Lease recovery settles unknown dispatched calls once and never issues them again. */
export async function settleInterruptedConversationCalls(
    tx: Transaction,
    turn: typeof turns.$inferSelect,
) {
    if (usesActionAccounting(turn.execution)) {
        const { settleConversationAction } =
            await import('./conversation-action-accounting');
        await settleConversationAction(tx, turn);
        return;
    }
    const execution = turn.execution as unknown as TextAiAdmissionExecution;
    const rows = await tx
        .select()
        .from(calls)
        .where(and(eq(calls.turnId, turn.id), eq(calls.ownerId, turn.ownerId)))
        .for('update');
    for (const row of rows) {
        if (row.state === 'settled') continue;
        if (!execution.snapshot)
            throw new Error('Pinned execution is missing.');
        await settleConversationCall(tx, row, execution.snapshot);
    }
}
