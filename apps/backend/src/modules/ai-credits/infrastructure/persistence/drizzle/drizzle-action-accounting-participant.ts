import { parseCreditMilli } from '../../../domain/exact-credit-amount';
import {
    DrizzleOperatorBudgetParticipant,
    OperatorBudgetUnavailableError,
    type OperatorBudgetSettings,
} from './drizzle-operator-budget-participant';
import { DrizzleCapabilityPolicyParticipant } from './drizzle-capability-policy-participant';
import type { TextAiProviderBudgetPolicy } from '../../../../text-ai/application/text-ai-provider-catalog';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { AiCreditTransaction } from './drizzle-ai-credit-participant';
import { AiCreditInsufficientBalanceError } from '../../../domain/ai-credit';
import type { ActionTariff } from '../../../domain/action-pricing';
import {
    aiCreditGrantBalancesTable as balances,
    aiCreditHistoryTable as history,
} from './schema';
import {
    aiCreditActionAllocationsTable as allocations,
    aiCreditActionAttemptsTable as attempts,
    aiCreditActionsTable as actions,
} from './action-accounting-schema';

/** Shares the wallet lock and compact projection with every legacy participant. */
export class DrizzleActionAccountingParticipant {
    constructor(private readonly tx: AiCreditTransaction) {}
    async lockForSettlement(ownerId: string) {
        await new DrizzleOperatorBudgetParticipant(this.tx).lockForSettlement(
            ownerId,
        );
    }

    private async lock(ownerId: string) {
        await this.tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, 1920424381))`,
        );
    }

    async reserve(input: {
        id: string;
        ownerId: string;
        capability: string;
        funding: 'customer' | 'operator' | 'unlimited';
        policyVersion: number;
        tariff: ActionTariff;
        budgetMilli: bigint;
        holdMaximumMilli?: bigint;
        outputLimit?: number;
        operatorMaximumMicros?: bigint;
        operatorSettings?: OperatorBudgetSettings;
        at: Date;
        deadlineAt: Date;
    }) {
        if (
            !Number.isSafeInteger(input.outputLimit ?? 10000) ||
            (input.outputLimit ?? 10000) < 1 ||
            (input.outputLimit ?? 10000) > 10000
        )
            throw new Error('Invalid action output allowance.');
        await this.lock(input.ownerId);
        const [previous] = await this.tx
            .select()
            .from(actions)
            .where(eq(actions.id, input.id))
            .for('update');

        if (previous) {
            if (
                previous.ownerId !== input.ownerId ||
                previous.capability !== input.capability ||
                previous.budgetMilli !== input.budgetMilli ||
                previous.outputLimit !== (input.outputLimit ?? 10000) ||
                previous.funding !== input.funding ||
                previous.policyVersion !== input.policyVersion ||
                JSON.stringify(previous.tariff) !== JSON.stringify(input.tariff)
            )
                throw new Error('Conflicting action admission identity.');

            return previous;
        }

        if (input.operatorMaximumMicros === undefined)
            throw new OperatorBudgetUnavailableError(
                'Operator execution allowance is required.',
            );
        await new DrizzleOperatorBudgetParticipant(this.tx).reserveAction({
            actionId: input.id,
            ownerId: input.ownerId,
            maximumMicros: input.operatorMaximumMicros,
            settings:
                input.operatorSettings ??
                (await new DrizzleCapabilityPolicyParticipant(
                    this.tx,
                ).settings()),
            at: input.at,
        });

        const grants =
            input.funding === 'customer'
                ? await this.tx
                      .select()
                      .from(balances)
                      .where(
                          and(
                              eq(balances.ownerId, input.ownerId),
                              gt(balances.remainingCredits, 0n),
                              or(
                                  isNull(balances.expiresAt),
                                  gt(balances.expiresAt, input.at),
                              ),
                          ),
                      )
                      .orderBy(
                          sql`${balances.expiresAt} asc nulls last`,
                          asc(balances.createdAt),
                          asc(balances.grantId),
                      )
                      .for('update')
                : [];
        const available = grants.reduce(
            (sum, grant) => sum + grant.remainingCredits,
            0n,
        );
        const maximumHold =
            input.holdMaximumMilli === undefined ||
            input.holdMaximumMilli > input.budgetMilli
                ? input.budgetMilli
                : input.holdMaximumMilli;
        const held =
            input.funding === 'customer'
                ? maximumHold < available
                    ? maximumHold
                    : available
                : 0n;
        const zeroTariff = [
            input.tariff.inputCreditsPerMillionTokens,
            input.tariff.outputCreditsPerMillionTokens,
            input.tariff.cachedInputCreditsPerMillionTokens ??
                input.tariff.inputCreditsPerMillionTokens,
        ].every((rate) => parseCreditMilli(rate) === 0n);

        if (input.funding === 'customer' && held <= 0n && !zeroTariff)
            throw new AiCreditInsufficientBalanceError();
        const [action] = await this.tx
            .insert(actions)
            .values({
                id: input.id,
                ownerId: input.ownerId,
                capability: input.capability,
                funding: input.funding,
                policyVersion: input.policyVersion,
                tariff: input.tariff,
                budgetMilli: input.budgetMilli,
                heldMilli: held,
                state: 'active',
                outputLimit: input.outputLimit ?? 10000,
                createdAt: input.at,
                deadlineAt: input.deadlineAt,
            })
            .returning();
        let remaining = held;
        for (const grant of grants) {
            if (remaining === 0n) break;
            const allocated =
                remaining < grant.remainingCredits
                    ? remaining
                    : grant.remainingCredits;

            await this.tx.insert(allocations).values({
                actionId: input.id,
                grantId: grant.grantId,
                allocatedMilli: allocated,
            });

            remaining -= allocated;
        }

        await this.tx.insert(history).values({
            id: randomUUID(),
            ownerId: input.ownerId,
            amount: -held,
            kind: 'reservation',
            createdAt: input.at,
        });

        return action!;
    }

    async read(actionId: string, ownerId: string) {
        const [action] = await this.tx
            .select()
            .from(actions)
            .where(and(eq(actions.id, actionId), eq(actions.ownerId, ownerId)))
            .for('update');

        if (!action) throw new Error('Admitted action is missing.');

        return action;
    }

    async admitAttempt(input: {
        actionId: string;
        ownerId: string;
        callId: string;
        purpose: string;
        inputTokens: number;
        maxOutputTokens: number;
        budget: TextAiProviderBudgetPolicy;
        executionWitness: {
            jobId: string;
            leaseToken?: string;
            workerId?: string;
            fencingToken?: string;
        };
        at: Date;
    }) {
        // The SQL admission acquires global capacity before wallet/job locks.
        const [admission] = await this.tx
            .select({ ownerId: actions.ownerId })
            .from(actions)
            .where(eq(actions.id, input.actionId));

        if (!admission || admission.ownerId !== input.ownerId)
            throw new Error('Admitted action is missing.');
        const witness = input.executionWitness;
        try {
            // SQL denial must roll back its savepoint before a legacy claimant
            // can publish failure and release its existing hold in this transaction.
            await this.tx.transaction(async (nested) => {
                await nested.execute(sql`select languon_admit_text_provider_attempt(
            ${input.actionId}::uuid, ${input.callId}::uuid, ${input.purpose},
            ${input.inputTokens}::integer, ${input.maxOutputTokens}::integer,
            ${witness.jobId}::uuid, ${witness.leaseToken ?? null}::text,
            ${witness.workerId ?? null}::text, ${witness.fencingToken ?? null}::bigint,
            ${input.at.toISOString()}::timestamptz)`);
            });
        } catch (error) {
            const cause = error instanceof Error ? error.cause : undefined;
            if (
                cause &&
                typeof cause === 'object' &&
                'code' in cause &&
                cause.code === '23514' &&
                'message' in cause
            ) {
                if (
                    cause.message ===
                    'Action affordable output allowance exhausted'
                )
                    throw new AiCreditInsufficientBalanceError();
                if (
                    typeof cause.message === 'string' &&
                    [
                        'Provider operational capacity is unavailable',
                        'Action execution allowance is unavailable',
                        'Action input execution allowance exceeded',
                    ].includes(cause.message)
                )
                    throw new OperatorBudgetUnavailableError(cause.message);
            }

            throw error;
        }

        const [attempt] = await this.tx
            .select()
            .from(attempts)
            .where(eq(attempts.id, input.callId));

        if (!attempt)
            throw new Error('Provider dispatch authorization is missing.');

        return attempt;
    }

    async recordAttempt(input: {
        actionId: string;
        ownerId: string;
        callId: string;
        successful: boolean;
        operatorCostMicros?: bigint | null;
        usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
        };
        at: Date;
    }) {
        await this.lock(input.ownerId);
        const action = await this.read(input.actionId, input.ownerId);
        const [attempt] = await this.tx
            .select()
            .from(attempts)
            .where(
                and(
                    eq(attempts.id, input.callId),
                    eq(attempts.actionId, action.id),
                ),
            )
            .for('update');

        if (!attempt) throw new Error('Provider attempt is missing.');
        if (action.state !== 'active' && attempt.state !== 'settled')
            throw new Error('Action is already terminal.');
        const cacheRead = input.usage?.cacheReadTokens ?? 0;
        const cacheWrite = input.usage?.cacheWriteTokens ?? 0;
        const valid =
            input.usage &&
            Number.isSafeInteger(input.usage.inputTokens) &&
            Number.isSafeInteger(input.usage.outputTokens) &&
            input.usage.inputTokens >= 0 &&
            input.usage.outputTokens >= 0 &&
            input.usage.inputTokens <= attempt.inputLimit &&
            input.usage.outputTokens <= attempt.outputLimit &&
            [cacheRead, cacheWrite].every(
                (value) => Number.isSafeInteger(value) && value >= 0,
            ) &&
            cacheRead + cacheWrite <= input.usage.inputTokens;

        await this.tx.execute(sql`select languon_settle_text_provider_attempt(
            ${attempt.id}::uuid, ${Boolean(input.successful && valid)},
            ${valid ? input.usage!.inputTokens : null}::integer,
            ${valid ? input.usage!.outputTokens : null}::integer,
            ${valid ? cacheRead : null}::integer, ${valid ? cacheWrite : null}::integer,
            ${input.at.toISOString()}::timestamptz)`);
    }

    async settle(input: {
        actionId: string;
        ownerId: string;
        outcome: 'success' | 'stopped' | 'failure';
        at: Date;
    }) {
        await this.lock(input.ownerId);
        await this.read(input.actionId, input.ownerId);
        await this.tx.execute(sql`select languon_settle_credit_action(
            ${input.actionId}::uuid, ${input.outcome}, ${input.at.toISOString()}::timestamptz)`);

        return this.read(input.actionId, input.ownerId);
    }
}
