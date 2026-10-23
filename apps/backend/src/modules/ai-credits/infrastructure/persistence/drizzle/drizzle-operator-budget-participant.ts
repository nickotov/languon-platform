import { and, eq, sql } from 'drizzle-orm';
import type { AiCreditTransaction } from './drizzle-ai-credit-participant';
import { parseFixed } from '../../../domain/accounting';
import {
    aiOperatorActionBudgetsTable as actions,
    aiOperatorAttemptCostsTable as attempts,
} from './operator-budget-schema';

export class OperatorBudgetUnavailableError extends Error {}
export interface OperatorBudgetSettings {
    maxProviderCostUsdPerAction: string | null;
    maxProviderCostUsdPerAccountDay: string | null;
    maxProviderCostUsdPerDay: string | null;
}
const MAX = 9_007_199_254_740_991n;
function amount(value: string | null) {
    if (!value)
        throw new OperatorBudgetUnavailableError(
            'Operator spending limits must be configured.',
        );
    const result = parseFixed(value, 6);
    if (result <= 0n || result > MAX)
        throw new OperatorBudgetUnavailableError(
            'Invalid operator spending limit.',
        );

    return result;
}

/** All model/capability cohorts use the same UTC daily counters in one transaction. */
export class DrizzleOperatorBudgetParticipant {
    constructor(private readonly tx: AiCreditTransaction) {}
    private async lockOwner(ownerId: string) {
        await this.tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${ownerId},1920424381))`,
        );
    }

    private async lockActionOwner(actionId: string) {
        const [action] = await this.tx
            .select({ ownerId: actions.ownerId })
            .from(actions)
            .where(eq(actions.actionId, actionId));

        if (!action?.ownerId)
            throw new OperatorBudgetUnavailableError(
                'Operator action authorization is missing.',
            );
        await this.lockOwner(action.ownerId);
    }

    private async lock() {
        await this.tx.execute(sql`select pg_advisory_xact_lock(1920424395)`);
    }

    /** Reserve settlement's global locks before a job status update fires capacity projections. */
    async lockForSettlement(ownerId: string) {
        await this.lockOwner(ownerId);
        await this.lock();
    }

    async reserveAction(input: {
        actionId: string;
        ownerId: string;
        maximumMicros: bigint;
        settings: OperatorBudgetSettings;
        at: Date;
    }) {
        await this.lockOwner(input.ownerId);
        await this.lock();
        const limits = {
            action: amount(input.settings.maxProviderCostUsdPerAction),
            owner: amount(input.settings.maxProviderCostUsdPerAccountDay),
            global: amount(input.settings.maxProviderCostUsdPerDay),
        };
        const maximum =
            input.maximumMicros < limits.action
                ? input.maximumMicros
                : limits.action;

        if (maximum < 0n || maximum > MAX)
            throw new OperatorBudgetUnavailableError(
                'Invalid operator action reservation.',
            );
        const [previous] = await this.tx
            .select()
            .from(actions)
            .where(eq(actions.actionId, input.actionId))
            .for('update');

        if (previous) {
            if (
                previous.ownerId !== input.ownerId ||
                previous.state !== 'active'
            )
                throw new OperatorBudgetUnavailableError(
                    'Conflicting operator action identity.',
                );

            return previous;
        }

        const day = input.at.toISOString().slice(0, 10);
        const [reservation] = await this.tx
            .insert(actions)
            .values({
                actionId: input.actionId,
                ownerId: input.ownerId,
                day,
                reservedMicros: maximum,
                ownerDayLimitMicros: limits.owner,
                globalDayLimitMicros: limits.global,
                state: 'active',
                createdAt: input.at,
            })
            .returning()
            .catch((error: unknown) => {
                const cause = error instanceof Error ? error.cause : undefined;
                if (
                    cause &&
                    typeof cause === 'object' &&
                    'code' in cause &&
                    cause.code === 'P0001'
                )
                    throw new OperatorBudgetUnavailableError(
                        'The operator spending allowance is unavailable.',
                    );

                throw error;
            });

        return reservation!;
    }

    async remaining(actionId: string): Promise<bigint> {
        await this.lockActionOwner(actionId);
        // Keep operator authorization before report-dirty locks during expense writes.
        await this.lock();
        const [action] = await this.tx
            .select()
            .from(actions)
            .where(eq(actions.actionId, actionId))
            .for('update');

        if (!action || action.state !== 'active')
            throw new OperatorBudgetUnavailableError(
                'Active operator authorization is missing.',
            );
        const [usage] = await this.tx
            .select({
                used: sql<string>`coalesce(sum(coalesce(${attempts.consumedMicros},${attempts.reservedMicros})),0)::text`,
            })
            .from(attempts)
            .where(eq(attempts.actionId, actionId));

        return action.reservedMicros - BigInt(usage?.used ?? '0');
    }

    async reserveAttempt(input: {
        actionId: string;
        attemptId: string;
        maximumMicros: bigint;
        at: Date;
    }) {
        const remaining = await this.remaining(input.actionId);
        if (input.maximumMicros < 0n || input.maximumMicros > remaining)
            throw new OperatorBudgetUnavailableError(
                'Provider attempt exceeds operator action authorization.',
            );
        await this.tx.insert(attempts).values({
            actionId: input.actionId,
            attemptId: input.attemptId,
            reservedMicros: input.maximumMicros,
            createdAt: input.at,
        });
    }

    async recordAttempt(input: {
        actionId: string;
        attemptId: string;
        measuredMicros: bigint | null;
        at: Date;
    }) {
        await this.remaining(input.actionId);
        const [attempt] = await this.tx
            .select()
            .from(attempts)
            .where(
                and(
                    eq(attempts.actionId, input.actionId),
                    eq(attempts.attemptId, input.attemptId),
                ),
            )
            .for('update');

        if (!attempt)
            throw new OperatorBudgetUnavailableError(
                'Provider attempt operator authorization is missing.',
            );
        if (attempt.settledAt) return;
        const valid =
            input.measuredMicros !== null &&
            input.measuredMicros >= 0n &&
            input.measuredMicros <= attempt.reservedMicros;

        await this.tx
            .update(attempts)
            .set({
                consumedMicros: valid
                    ? input.measuredMicros
                    : attempt.reservedMicros,
                measurement: valid ? 'measured' : 'conservative',
                settledAt: input.at,
            })
            .where(eq(attempts.attemptId, input.attemptId));
    }

    async settleAction(input: { actionId: string; at: Date }) {
        await this.lockActionOwner(input.actionId);
        await this.lock();
        const [action] = await this.tx
            .select()
            .from(actions)
            .where(eq(actions.actionId, input.actionId))
            .for('update');

        if (!action)
            throw new OperatorBudgetUnavailableError(
                'Operator action authorization is missing.',
            );
        if (action.state === 'settled') return action;
        await this.tx
            .update(attempts)
            .set({
                consumedMicros: sql`${attempts.reservedMicros}`,
                measurement: 'conservative',
                settledAt: input.at,
            })
            .where(
                and(
                    eq(attempts.actionId, input.actionId),
                    sql`${attempts.settledAt} is null`,
                ),
            );

        const [usage] = await this.tx
            .select({
                used: sql<string>`coalesce(sum(coalesce(${attempts.consumedMicros},${attempts.reservedMicros})),0)::text`,
            })
            .from(attempts)
            .where(eq(attempts.actionId, input.actionId));
        const consumed = BigInt(usage?.used ?? '0');
        const [result] = await this.tx
            .update(actions)
            .set({
                state: 'settled',
                consumedMicros: consumed,
                settledAt: input.at,
            })
            .where(eq(actions.actionId, action.actionId))
            .returning();

        return result!;
    }
}
