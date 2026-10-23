import { authorizeActionAllowance } from '../../action-allowance-consent';
import {
    readProviderTokenUsage,
    type ProviderTokenUsage,
} from '../../../../text-ai/infrastructure/ai/provider-token-usage';
import {
    maximumActionChargeNumerator,
    roundActionChargeMilli,
} from '../../../domain/action-pricing';
import { OperatorBudgetUnavailableError } from './drizzle-operator-budget-participant';
import { ProviderCostAdmissionUnavailableError } from '../../../domain/provider-cost-admission';
import { reviewedTextProviderBudget } from '../../../domain/provider-cost-admission';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { ProviderPrice } from '@languon/contracts';
import type { AiCreditJobKind } from '../../../application/ai-credit-participant';
import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import { ensureActionBudgetDefault } from '../../../../text-ai/infrastructure/persistence/drizzle/action-budget-default';
import { providerTextExpenseMicros } from '../../../domain/provider-expense';
import { parseCreditMilli } from '../../../domain/exact-credit-amount';
import { AiCreditInsufficientBalanceError } from '../../../domain/ai-credit';
import {
    DrizzleAiCreditTransactionParticipant,
    type AiCreditTransaction,
} from './drizzle-ai-credit-participant';
import {
    DrizzleCapabilityPolicyParticipant,
    capabilityForJob,
} from './drizzle-capability-policy-participant';
import { DrizzleActionAccountingParticipant } from './drizzle-action-accounting-participant';
import { aiCreditActionAttemptsTable as attempts } from './action-accounting-schema';
import { pinProviderPrice } from './drizzle-provider-prices';
import { recordProviderExpense } from './drizzle-accounting-store';

/** Versioned only on new feature admissions; immutable old jobs retain their accounting path. */
export type LegacyActionSnapshot = TextAiExecutionSnapshot & {
    actionAccountingVersion: 1;
    actionParentId?: string;
    actionBudgetMilli: string;
    actionFunding: 'customer' | 'operator' | 'unlimited';
    actionPolicyVersion: number;
    actionProviderPrice: ProviderPrice | null;
};
export function usesLegacyAction(
    snapshot: TextAiExecutionSnapshot | null,
): snapshot is LegacyActionSnapshot {
    return (
        !!snapshot &&
        'actionAccountingVersion' in snapshot &&
        snapshot.actionAccountingVersion === 1
    );
}

export async function prepareLegacyAction(
    tx: AiCreditTransaction,
    ownerId: string,
    kind: AiCreditJobKind,
    snapshot: TextAiExecutionSnapshot,
    at: Date,
): Promise<LegacyActionSnapshot> {
    const capability = new DrizzleCapabilityPolicyParticipant(tx);
    const policy = await capability.current(capabilityForJob(kind));
    const account = await new DrizzleAiCreditTransactionParticipant(
        tx,
    ).accountSummary(ownerId, at);
    const funding =
        policy.funding === 'operator'
            ? 'operator'
            : account.policy.effectiveMode === 'unlimited'
              ? 'unlimited'
              : 'customer';
    const preference = await ensureActionBudgetDefault(tx, ownerId, at);
    const settings = await capability.settings();
    const budget = preference?.maxCreditsPerAction ?? null;
    if (
        !settings.maxProviderCostUsdPerAction ||
        !settings.maxProviderCostUsdPerAccountDay ||
        !settings.maxProviderCostUsdPerDay
    )
        throw new OperatorBudgetUnavailableError(
            'Operator spending limits must be configured.',
        );
    const zeroCustomerTariff =
        snapshot.creditPricing &&
        [
            snapshot.creditPricing.inputCreditsPerMillionTokens,
            snapshot.creditPricing.outputCreditsPerMillionTokens,
            snapshot.creditPricing.cachedInputCreditsPerMillionTokens ??
                snapshot.creditPricing.inputCreditsPerMillionTokens,
        ].every((rate) => rate === 0);

    if (funding === 'customer' && !budget && !zeroCustomerTariff)
        throw new OperatorBudgetUnavailableError(
            'An action budget must be configured.',
        );
    const price = await pinProviderPrice(tx, {
        providerId: snapshot.providerId,
        modelId: snapshot.modelId,
        meter: 'text-tokens',
        at,
    });

    if (!price)
        throw new ProviderCostAdmissionUnavailableError(
            'Reviewed provider pricing is required before paid generation.',
        );
    if (!snapshot.creditPricing)
        throw new Error('Action customer tariff is missing.');

    return {
        ...snapshot,
        aggregateBudget: reviewedTextProviderBudget(
            price,
            snapshot.aggregateBudget,
            snapshot.providerId === 'deepseek'
                ? { read: 'input-price-upper-bound', write: 'none' }
                : { read: 'priced', write: 'priced' },
        ),
        actionAccountingVersion: 1,
        actionBudgetMilli: budget ? parseCreditMilli(budget).toString() : '0',
        actionFunding: funding,
        actionPolicyVersion: policy.version,
        actionProviderPrice: price,
    };
}

export async function reserveLegacyAction(
    tx: AiCreditTransaction,
    input: {
        id: string;
        requestKey: string;
        fingerprint: string;
        scope?: string;
        ownerId: string;
        kind: AiCreditJobKind;
        snapshot: LegacyActionSnapshot;
        inputPayload: unknown;
        inputOverheadTokens?: number;
        holdMaximumInputTokens?: number;
        at: Date;
    },
) {
    const policy = await new DrizzleCapabilityPolicyParticipant(tx).pinAction({
        jobId: input.id,
        jobKind: input.kind,
        ownerId: input.ownerId,
        at: input.at,
    });

    if (
        policy.version !== input.snapshot.actionPolicyVersion ||
        (policy.funding === 'operator') !==
            (input.snapshot.actionFunding === 'operator')
    )
        throw new Error('Action funding policy changed before admission.');
    const tariff = input.snapshot.creditPricing!;
    const actionTariff = {
        inputCreditsPerMillionTokens: String(
            tariff.inputCreditsPerMillionTokens,
        ),
        outputCreditsPerMillionTokens: String(
            tariff.outputCreditsPerMillionTokens,
        ),
        ...(tariff.cachedInputCreditsPerMillionTokens == null
            ? {}
            : {
                  cachedInputCreditsPerMillionTokens: String(
                      tariff.cachedInputCreditsPerMillionTokens,
                  ),
              }),
    };

    if (
        input.holdMaximumInputTokens !== undefined &&
        (!Number.isSafeInteger(input.holdMaximumInputTokens) ||
            input.holdMaximumInputTokens < 0 ||
            input.holdMaximumInputTokens >
                input.snapshot.aggregateBudget.maxInputTokensPerAttempt)
    )
        throw new Error('Invalid aggregate action input allowance.');
    const maximum = roundActionChargeMilli(
        maximumActionChargeNumerator(
            {
                inputTokens: Math.min(
                    input.snapshot.aggregateBudget.maxInputTokensPerAttempt,
                    input.holdMaximumInputTokens ??
                        Buffer.byteLength(
                            JSON.stringify(input.inputPayload) ?? '',
                            'utf8',
                        ) + (input.inputOverheadTokens ?? 8192),
                ),
                outputTokens: Math.min(
                    10000,
                    input.snapshot.aggregateBudget.maxOutputTokensPerAttempt,
                ),
            },
            actionTariff,
        ),
    );
    const accepted = await authorizeActionAllowance(tx, {
        ownerId: input.ownerId,
        scope: input.scope ?? input.kind,
        requestKey: input.requestKey,
        fingerprint: input.fingerprint,
        authorization: input.snapshot,
        funding: input.snapshot.actionFunding,
        tariff: actionTariff,
        budgetMilli: BigInt(input.snapshot.actionBudgetMilli),
        maximumMilli: maximum,
        inputTokens: Math.min(
            input.snapshot.aggregateBudget.maxInputTokensPerAttempt,
            Buffer.byteLength(
                JSON.stringify(input.inputPayload) ?? '',
                'utf8',
            ) + (input.inputOverheadTokens ?? 8192),
        ),
        outputLimit: Math.min(
            10000,
            input.snapshot.aggregateBudget.maxOutputTokensPerAttempt,
        ),
        providerBudget: input.snapshot.aggregateBudget,
        at: input.at,
    });

    return new DrizzleActionAccountingParticipant(tx).reserve({
        id: input.id,
        ownerId: input.ownerId,
        capability: capabilityForJob(input.kind),
        funding: input.snapshot.actionFunding,
        policyVersion: policy.version,
        tariff: actionTariff,
        holdMaximumMilli: accepted.holdMaximumMilli,
        outputLimit: accepted.outputLimit,
        budgetMilli: BigInt(input.snapshot.actionBudgetMilli),
        operatorMaximumMicros: BigInt(
            input.snapshot.aggregateBudget.maxCostMicrosPerAttempt,
        ),
        at: input.at,
        deadlineAt: new Date(input.at.getTime() + 15 * 60_000),
    });
}

function attemptId(id: string, attempt: number) {
    const hash = createHash('sha256')
        .update(`legacy-action:${id}:${attempt}`)
        .digest('hex');

    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Reserve before returning provider limits to the worker. Call ids are stable across process recovery. */
export async function admitLegacyAttempt(
    tx: AiCreditTransaction,
    input: {
        id: string;
        actionId?: string;
        workerId: string;
        fencingToken: string;
        ownerId: string;
        attempt: number;
        inputPayload: unknown;
        inputOverheadTokens?: number;
        budget: TextAiProviderBudgetPolicy;
        at: Date;
    },
) {
    if (input.attempt > 2)
        throw new Error('Action safe attempt limit reached.');
    // This is an execution ceiling enforced by provider preflight, rather than an exact tokenizer claim.
    const inputLimit = Math.min(
        input.budget.maxInputTokensPerAttempt,
        Buffer.byteLength(JSON.stringify(input.inputPayload) ?? '', 'utf8') +
            (input.inputOverheadTokens ?? 8192),
    );
    const callId = attemptId(input.id, input.attempt);
    const [previous] = await tx
        .select()
        .from(attempts)
        .where(
            and(
                eq(attempts.id, callId),
                eq(attempts.actionId, input.actionId ?? input.id),
            ),
        );

    if (previous)
        throw new Error('Provider attempt cannot be dispatched twice.');
    try {
        const attempt = await new DrizzleActionAccountingParticipant(
            tx,
        ).admitAttempt({
            actionId: input.actionId ?? input.id,
            ownerId: input.ownerId,
            callId,
            purpose: 'answer',
            executionWitness: {
                jobId: input.id,
                workerId: input.workerId,
                fencingToken: input.fencingToken,
            },
            inputTokens: inputLimit,
            maxOutputTokens: Math.min(
                10000,
                input.budget.maxOutputTokensPerAttempt,
            ),
            budget: input.budget,
            at: input.at,
        });

        return {
            ...input.budget,
            maxInputTokensPerAttempt: inputLimit,
            maxOutputTokensPerAttempt: attempt.outputLimit,
        };
    } catch (error) {
        if (
            error instanceof AiCreditInsufficientBalanceError ||
            error instanceof OperatorBudgetUnavailableError ||
            error instanceof ProviderCostAdmissionUnavailableError ||
            (error instanceof Error &&
                [
                    'Action execution deadline reached.',
                    'Action call limit reached.',
                    'Action operator execution allowance exceeded.',
                ].includes(error.message))
        )
            return null;

        throw error;
    }
}

export async function recordLegacyAttempt(
    tx: AiCreditTransaction,
    input: {
        id: string;
        ownerId: string;
        attempt: number;
        snapshot: LegacyActionSnapshot;
        successful: boolean;
        dispatched: boolean;
        usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
        };
        at: Date;
    },
) {
    const callId = attemptId(input.id, input.attempt);
    const [attempt] = await tx
        .select()
        .from(attempts)
        .where(
            and(
                eq(attempts.id, callId),
                eq(
                    attempts.actionId,
                    input.snapshot.actionParentId ?? input.id,
                ),
            ),
        );

    if (!attempt || attempt.state === 'settled') return;
    let usage: ProviderTokenUsage | undefined;
    if (!input.dispatched) usage = { inputTokens: 0, outputTokens: 0 };
    else if (input.usage) {
        try {
            usage = readProviderTokenUsage(input.usage, {
                maxInputTokens: attempt.inputLimit,
                maxOutputTokens: attempt.outputLimit,
            });
        } catch {
            if (input.successful)
                throw new Error(
                    'Provider usage exceeds admitted action allowance.',
                );
        }
    }

    const measured = usage !== undefined;
    const expense = !input.dispatched
        ? 0n
        : measured && usage
          ? providerTextExpenseMicros(input.snapshot.actionProviderPrice, usage)
          : null;

    await new DrizzleActionAccountingParticipant(tx).recordAttempt({
        actionId: input.snapshot.actionParentId ?? input.id,
        ownerId: input.ownerId,
        callId,
        successful: input.successful && input.dispatched,
        ...(usage ? { usage } : {}),
        operatorCostMicros: expense,
        at: input.at,
    });

    await recordProviderExpense(tx, {
        attemptReference: `legacy:${callId}`,
        attemptId: callId,
        actionId: input.snapshot.actionParentId ?? input.id,
        providerId: input.snapshot.providerId,
        modelId: input.snapshot.modelId,
        measurement: measured ? 'measured' : 'unknown',
        costSource: expense === null ? 'unknown' : 'calculated',
        amountUsdMicros: expense,
        occurredAt: attempt.createdAt,
    });
}

export async function settleLegacyAction(
    tx: AiCreditTransaction,
    input: {
        id: string;
        ownerId: string;
        outcome: 'success' | 'stopped' | 'failure';
        at: Date;
    },
) {
    return new DrizzleActionAccountingParticipant(tx).settle({
        actionId: input.id,
        ownerId: input.ownerId,
        outcome: input.outcome,
        at: input.at,
    });
}
