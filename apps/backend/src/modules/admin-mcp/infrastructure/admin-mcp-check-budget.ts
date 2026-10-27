import { and, eq, isNull } from 'drizzle-orm';
import { DrizzleOperatorBudgetParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { DrizzleCapabilityPolicyParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { aiOperatorActionBudgetsTable } from '../../ai-credits/infrastructure/persistence/drizzle/operator-budget-schema';
import {
    AdminMcpError,
    amountUnits,
    requireAction,
    requirePermission,
    type AdminMcpActor,
} from '../domain/admin-mcp';
import { AdminMcpQuotaStore } from './persistence/drizzle/admin-mcp-quota-store';
import {
    requireActor,
    type AdminMcpDatabase,
    audit,
} from './persistence/drizzle/admin-mcp-persistence';
import {
    adminMcpReservationsTable,
    adminMcpTokensTable,
} from './persistence/drizzle/schema';

/** One authorization owns both the credential's quota and the shared operator counters. */
export class AdminMcpCheckBudget {
    private readonly quotas: AdminMcpQuotaStore;
    constructor(
        private readonly database: AdminMcpDatabase,
        private readonly now: () => Date = () => new Date(),
    ) {
        this.quotas = new AdminMcpQuotaStore(database, now);
    }

    async effectiveMaximum(
        actor: AdminMcpActor,
        configuredMicros: bigint,
    ): Promise<bigint> {
        const tokenMaximum = actor.limits.modelChecks?.perCheckUsd;
        const settings = await this.database.transaction(
            (tx) => new DrizzleCapabilityPolicyParticipant(tx).settings(),
            { accessMode: 'read only' },
        );
        if (!tokenMaximum || !settings.maxProviderCostUsdPerAction)
            throw new AdminMcpError(
                'quota_exceeded',
                'Explicit token and application operator limits must be configured before model checks.',
            );
        const maximum = [
            configuredMicros,
            amountUnits(tokenMaximum),
            amountUnits(settings.maxProviderCostUsdPerAction),
        ].reduce((minimum, value) => (value < minimum ? value : minimum));
        if (maximum <= 0n)
            throw new AdminMcpError(
                'quota_exceeded',
                'No operator spending allowance is available for this model check.',
            );
        return maximum;
    }

    async reserve(
        actor: AdminMcpActor,
        key: string,
        payload: unknown,
        maximumUsd: string,
    ) {
        return this.database.transaction(async (tx) => {
            const at = this.now();
            const reservation = await this.quotas.reserveInTransaction(
                tx,
                actor,
                key,
                payload,
                'model-check',
                maximumUsd,
                at,
            );
            if (reservation.replay) return reservation;
            const operator = new DrizzleOperatorBudgetParticipant(tx);
            const settings = await new DrizzleCapabilityPolicyParticipant(
                tx,
            ).settings();
            const maximum = amountUnits(maximumUsd);
            const authorization = await operator.reserveAction({
                actionId: reservation.id,
                ownerId: actor.userId,
                maximumMicros: maximum,
                settings,
                at,
            });
            if (authorization.reservedMicros !== maximum)
                throw new AdminMcpError(
                    'quota_exceeded',
                    'The model check exceeds the application operator action limit.',
                );
            await operator.reserveAttempt({
                actionId: reservation.id,
                attemptId: reservation.id,
                maximumMicros: maximum,
                at,
            });
            return reservation;
        });
    }

    /** Dispatch linearizes here against revocation; no browser session or learner wallet is involved. */
    async authorizeDispatch(actor: AdminMcpActor, reservationId: string) {
        return this.database.transaction(async (tx) => {
            const at = this.now();
            await requireActor(tx, actor, at);
            requirePermission(actor, 'model-checks.run');
            requireAction(actor, 'model-checks.run');
            const [reservation] = await tx
                .select()
                .from(adminMcpReservationsTable)
                .where(
                    and(
                        eq(adminMcpReservationsTable.id, reservationId),
                        eq(adminMcpReservationsTable.tokenId, actor.tokenId),
                    ),
                )
                .for('update');
            if (
                !reservation ||
                reservation.kind !== 'model-check' ||
                reservation.state !== 'reserved' ||
                reservation.dispatchAuthorizedAt !== null
            )
                throw new AdminMcpError(
                    'idempotency_conflict',
                    'The check cannot be dispatched again.',
                );
            await tx
                .update(adminMcpReservationsTable)
                .set({ dispatchAuthorizedAt: at })
                .where(
                    and(
                        eq(adminMcpReservationsTable.id, reservationId),
                        isNull(adminMcpReservationsTable.dispatchAuthorizedAt),
                    ),
                );
            await audit(
                tx,
                actor,
                'model-check.dispatch',
                reservationId,
                'Explicit bounded operator model check',
                at,
                { reservedMicros: reservation.reservedUnits.toString() },
            );
        });
    }

    /** Incurring expense must remain settleable after its credential is revoked. */
    async settle(
        actor: AdminMcpActor,
        reservationId: string,
        actualUsd: string | null,
        result?: unknown,
    ) {
        return this.database.transaction(async (tx) => {
            const at = this.now();
            await tx
                .select({ id: adminMcpTokensTable.id })
                .from(adminMcpTokensTable)
                .where(eq(adminMcpTokensTable.id, actor.tokenId))
                .for('update');
            const [reservation] = await tx
                .select()
                .from(adminMcpReservationsTable)
                .where(
                    and(
                        eq(adminMcpReservationsTable.id, reservationId),
                        eq(adminMcpReservationsTable.tokenId, actor.tokenId),
                    ),
                )
                .for('update');
            if (reservation && reservation.kind !== 'model-check')
                throw new AdminMcpError(
                    'not_found',
                    'Check reservation not found.',
                );
            const [authorization] = await tx
                .select()
                .from(aiOperatorActionBudgetsTable)
                .where(
                    eq(aiOperatorActionBudgetsTable.actionId, reservationId),
                );
            if (!authorization)
                throw new AdminMcpError(
                    'not_found',
                    'Operator authorization is missing.',
                );
            // Purge may remove private credentials and their reservations while
            // retained operator facts still need settlement. Never recreate them.
            if (
                authorization.ownerId !== actor.userId &&
                !(
                    authorization.ownerId === null &&
                    authorization.state === 'settled'
                )
            )
                throw new AdminMcpError(
                    'not_found',
                    'Operator authorization does not belong to this admitted check.',
                );
            if (authorization.state === 'active') {
                const operator = new DrizzleOperatorBudgetParticipant(tx);
                await operator.recordAttempt({
                    actionId: reservationId,
                    attemptId: reservationId,
                    measuredMicros:
                        actualUsd === null ? null : amountUnits(actualUsd),
                    at,
                });
                await operator.settleAction({ actionId: reservationId, at });
            }
            if (reservation) {
                await this.quotas.settleInTransaction(
                    tx,
                    reservationId,
                    actualUsd,
                    at,
                    result,
                );
            }
        });
    }
}
