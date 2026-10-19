import { randomUUID } from 'node:crypto';
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
    return async (
        tx: Transaction,
        input: { ownerId: string; turnId: string; conversationId: string },
    ): Promise<Record<string, unknown>> => {
        await lockTextAiCapacity(tx);
        const now = new Date();
        const execution = await new DrizzleTextAiAdmissionParticipant(
            tx,
            policy,
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
                        'The selected model is unavailable for conversations. Choose Auto or DeepSeek Flash and try again.',
                    );
                throw error;
            });
        if (
            !execution.snapshot?.creditPricing ||
            execution.snapshot.modelId !== 'deepseek-flash'
        )
            throw new ConversationError(
                'model_unavailable',
                'The selected model does not support conversations. Choose Auto or DeepSeek Flash.',
            );
        const account = await new DrizzleAiCreditTransactionParticipant(
            tx,
        ).accountSummary(input.ownerId, now);
        const firstCallCredits = maximumTextPrice(
            {
                maxInputTokensPerAttempt:
                    execution.snapshot.perCallMaxInputTokens,
                maxOutputTokensPerAttempt: Math.min(
                    4096,
                    execution.snapshot.perCallMaxOutputTokens,
                ),
            },
            execution.snapshot.creditPricing,
        );
        if (
            account.policy.effectiveMode === 'limited' &&
            account.availableCredits < BigInt(firstCallCredits)
        )
            throw new ConversationError(
                'credits_exhausted',
                'You do not have enough AI credits for a response.',
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
            throw new ConversationError(
                'capacity_unavailable',
                'AI capacity is currently unavailable. Try again later.',
            );
        return { ...execution };
    };
}

/** The operation fence surrounds dispatch; numerical settlement survives content deletion. */
export function createConversationAccounting(input: {
    database: Database;
    withOperation<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
    ownerId: string;
    turnId: string;
    execution: TextAiAdmissionExecution;
}): TutorAccountingPort {
    const snapshot = input.execution.snapshot;
    if (!snapshot?.creditPricing || snapshot.modelId !== 'deepseek-flash')
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
