import {
    ProviderExecutionFactsSchema,
    ProviderPriceSchema,
} from '@languon/contracts';
import { z } from 'zod';
import { maximumAutomaticGenerationStages } from '../../../application/ports/generation-run';
import {
    learningContentAuthoringCallLimit,
    learningContentActionOutputLimit,
} from '../../../application/learning-content-batches';
import {
    actionChargeNumerator,
    maximumActionChargeNumerator,
    roundActionChargeMilli,
    type ActionTariff,
} from '../../../../ai-credits/domain/action-pricing';
import { nativeTextProviderReservationMicros } from '../../../../ai-credits/domain/provider-cost-admission';
import { ConversationError } from '../../../domain/conversation';

const tokens = z.number().int().nonnegative().safe();
const lessonPricing = z.object({
    inputCostMicrosPerMillionTokens: tokens,
    outputCostMicrosPerMillionTokens: tokens,
    minimumCostMicrosPerRequest: tokens.optional(),
    nativeProviderPrice: ProviderPriceSchema.optional(),
    nativeExecutionFacts: ProviderExecutionFactsSchema.optional(),
});

export interface LessonPlanningReceipt {
    actualCostMicros: bigint | null;
    inputTokens: number | null;
    inputLimit: number;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    successful: number;
}

interface LessonEnvelopeInput {
    budget: unknown;
    calls: readonly {
        requestBytes: readonly number[];
        futureSourceTokens: number;
        outputTokens: number;
    }[];
    tariff: ActionTariff;
    receipts: readonly LessonPlanningReceipt[];
    now: Date;
}

function unavailable() {
    return new ConversationError(
        'generation_scope_change',
        'The planned lesson exceeds its available allowance. Request fewer units or a smaller lesson.',
    );
}

/** Estimate the complete text stage before splitting its finite operator allowance with speech. */
export function forecastLessonEnvelope(input: LessonEnvelopeInput) {
    if (!input.calls.length) {
        return { providerCostMicros: 0n, customerCreditsMilli: 0n };
    }

    const budget = lessonPricing.parse(input.budget);
    let customerNumerator = 0n;
    let provider = 0n;
    let callCount = input.receipts.length;
    let outputForecast = 0;
    let measuredInput = 0;
    let measuredBytes = 0;

    for (const receipt of input.receipts) {
        if (receipt.actualCostMicros === null) {
            throw new ConversationError(
                'generation_provider_outcome_unknown',
                'The planner cost requires reconciliation.',
            );
        }

        provider += receipt.actualCostMicros;
        outputForecast += receipt.outputTokens ?? 0;
        if (receipt.inputTokens && receipt.inputLimit > 0) {
            measuredInput += receipt.inputTokens;
            measuredBytes += receipt.inputLimit;
        }

        if (
            receipt.successful &&
            receipt.inputTokens !== null &&
            receipt.outputTokens !== null
        ) {
            customerNumerator += actionChargeNumerator(
                {
                    inputTokens: receipt.inputTokens,
                    outputTokens: receipt.outputTokens,
                    cacheReadTokens: receipt.cacheReadTokens ?? 0,
                },
                input.tariff,
            );
        }
    }

    // Every receipt carries both the gate's native request bytes and the provider's
    // metered tokens. With no comparable receipt use four UTF-8 bytes per token
    // for this price forecast. Dispatch always uses the exact conservative gate.
    const tokensPerByte = Math.min(
        1,
        Math.max(0.25, measuredBytes ? measuredInput / measuredBytes : 0.25),
    );

    for (const unit of input.calls) {
        let successfulCall = 0n;
        for (const bytes of unit.requestBytes) {
            const inputTokens =
                Math.ceil(bytes * tokensPerByte) + unit.futureSourceTokens;
            const usage = { inputTokens, outputTokens: unit.outputTokens };
            const native = budget.nativeProviderPrice;
            const cost = native?.nativeRules
                ? nativeTextProviderReservationMicros(
                      native,
                      budget.nativeExecutionFacts ?? {
                          dispatchedAt: input.now.toISOString(),
                      },
                      inputTokens,
                      unit.outputTokens,
                      1,
                  )
                : BigInt(
                      Math.max(
                          budget.minimumCostMicrosPerRequest ?? 0,
                          Math.ceil(
                              (inputTokens *
                                  budget.inputCostMicrosPerMillionTokens) /
                                  1_000_000,
                          ) +
                              Math.ceil(
                                  (unit.outputTokens *
                                      budget.outputCostMicrosPerMillionTokens) /
                                      1_000_000,
                              ),
                      ),
                  );

            if (cost === null) {
                throw unavailable();
            }

            provider += cost;
            callCount++;
            outputForecast += unit.outputTokens;
            const charge = maximumActionChargeNumerator(usage, input.tariff);
            if (charge > successfulCall) {
                successfulCall = charge;
            }
        }

        // Only one candidate can become this unit's accepted checkpoint.
        customerNumerator += successfulCall;
    }

    if (
        callCount >
            maximumAutomaticGenerationStages *
                learningContentAuthoringCallLimit ||
        outputForecast >
            maximumAutomaticGenerationStages * learningContentActionOutputLimit
    ) {
        throw unavailable();
    }

    return {
        providerCostMicros: provider,
        customerCreditsMilli: roundActionChargeMilli(customerNumerator),
    };
}

/** This preflight supplements the exact limits checked when each unit is dispatched. */
export function assertLessonEnvelopeFits(
    input: LessonEnvelopeInput & {
        maximumProviderCostMicros: number;
        maximumCreditsMilli: string;
        funding: 'customer' | 'operator' | 'unlimited';
    },
) {
    if (!input.calls.length) {
        return;
    }

    const forecast = forecastLessonEnvelope(input);
    if (
        forecast.providerCostMicros > BigInt(input.maximumProviderCostMicros) ||
        (input.funding === 'customer' &&
            forecast.customerCreditsMilli > BigInt(input.maximumCreditsMilli))
    ) {
        throw unavailable();
    }
}
