import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
    AdminMcpError,
    amountUnits,
    requirePermission,
    requireAction,
    requireOperationKey,
    assertSafeAuditContext,
    unitsAmount,
    utcDay,
    type AdminMcpActor,
    type AdminMcpReservation,
} from '../../../domain/admin-mcp';
import {
    audit,
    payloadHash,
    requireActor,
    type AdminMcpDatabase,
    type AdminMcpTransaction,
} from './admin-mcp-persistence';
import { adminMcpReservationsTable } from './schema';
export type AdminMcpQuotaKind =
    'model-check' | 'credit-grant' | 'credit-revoke';
export class AdminMcpQuotaStore {
    public constructor(
        private readonly database: AdminMcpDatabase,
        private readonly now: () => Date = () => new Date(),
    ) {}

    public reserve(
        actor: AdminMcpActor,
        key: string,
        payload: unknown,
        kind: AdminMcpQuotaKind,
        amount: string,
    ): Promise<AdminMcpReservation> {
        return this.database.transaction((tx) =>
            this.reserveInTransaction(
                tx,
                actor,
                key,
                payload,
                kind,
                amount,
                this.now(),
            ),
        );
    }

    public async reserveInTransaction(
        tx: AdminMcpTransaction,
        actor: AdminMcpActor,
        key: string,
        payload: unknown,
        kind: AdminMcpQuotaKind,
        amount: string,
        at = this.now(),
    ): Promise<AdminMcpReservation> {
        requirePermission(
            actor,
            kind === 'model-check'
                ? 'model-checks.run'
                : kind === 'credit-grant'
                  ? 'credits.grant'
                  : 'credits.revoke',
        );

        requireAction(
            actor,
            kind === 'model-check'
                ? 'model-checks.run'
                : kind === 'credit-grant'
                  ? 'credits.grant'
                  : 'credits.revoke',
        );

        await requireActor(tx, actor, at);
        requireOperationKey(key);
        assertSafeAuditContext(payload);
        const hash = payloadHash({ kind, amount, payload });
        const [existing] = await tx
            .select()
            .from(adminMcpReservationsTable)
            .where(
                and(
                    eq(adminMcpReservationsTable.tokenId, actor.tokenId),
                    eq(adminMcpReservationsTable.operationKey, key),
                ),
            );

        if (existing) {
            if (existing.payloadHash !== hash)
                throw new AdminMcpError(
                    'idempotency_conflict',
                    'Operation key already used for different input.',
                );

            return {
                id: existing.id,
                replay: true,
                state: existing.state,
                amount: unitsAmount(
                    existing.settledUnits ?? existing.reservedUnits,
                ),
            };
        }

        const limits =
            kind === 'model-check'
                ? actor.limits.modelChecks
                : kind === 'credit-grant'
                  ? actor.limits.creditGrants
                  : actor.limits.creditRevocations;

        if (!limits)
            throw new AdminMcpError(
                'permission_denied',
                'Explicit limits are required.',
            );
        const perOperation =
            'perCheckUsd' in limits ? limits.perCheckUsd : limits.perOperation;
        const perDay = 'perDayUsd' in limits ? limits.perDayUsd : limits.perDay;
        const units = amountUnits(amount);
        if (units <= 0n || units > amountUnits(perOperation))
            throw new AdminMcpError(
                'quota_exceeded',
                'The operation exceeds the credential ceiling.',
            );
        const [usage] = await tx
            .select({
                total: sql<string>`coalesce(sum(coalesce(${adminMcpReservationsTable.settledUnits},${adminMcpReservationsTable.reservedUnits})),0)::text`,
            })
            .from(adminMcpReservationsTable)
            .where(
                and(
                    eq(adminMcpReservationsTable.tokenId, actor.tokenId),
                    eq(adminMcpReservationsTable.kind, kind),
                    eq(adminMcpReservationsTable.day, utcDay(at)),
                ),
            );

        if (BigInt(usage?.total ?? '0') + units > amountUnits(perDay))
            throw new AdminMcpError(
                'quota_exceeded',
                'The credential daily ceiling is exhausted.',
            );
        if (kind === 'model-check') {
            // Include all days: an uncertain upstream outcome still occupies capacity.
            const [active] = await tx
                .select({ count: sql<number>`count(*)::integer` })
                .from(adminMcpReservationsTable)
                .where(
                    and(
                        eq(adminMcpReservationsTable.tokenId, actor.tokenId),
                        eq(adminMcpReservationsTable.kind, kind),
                        sql`${adminMcpReservationsTable.state} in ('reserved','unknown')`,
                    ),
                );

            if (
                (active?.count ?? 0) >=
                (actor.limits.modelChecks?.concurrency ?? 1)
            )
                throw new AdminMcpError(
                    'quota_exceeded',
                    'The credential already has its maximum active checks.',
                );
        }

        const id = randomUUID();
        await tx.insert(adminMcpReservationsTable).values({
            id,
            tokenId: actor.tokenId,
            operationKey: key,
            payloadHash: hash,
            kind,
            day: utcDay(at),
            state: 'reserved',
            reservedUnits: units,
            createdAt: at,
        });

        return {
            id,
            replay: false,
            state: 'reserved',
            amount: unitsAmount(units),
        };
    }

    public async get(
        actor: AdminMcpActor,
        operationKey: string,
    ): Promise<{
        id: string;
        state: 'reserved' | 'settled' | 'unknown';
        amount: string;
        result: unknown;
        createdAt: string;
        settledAt: string | null;
    } | null> {
        requireOperationKey(operationKey);
        requirePermission(actor, 'model-checks.run');
        requireAction(actor, 'model-checks.status');

        return this.database.transaction(async (tx) => {
            await requireActor(tx, actor, this.now());
            const [row] = await tx
                .select()
                .from(adminMcpReservationsTable)
                .where(
                    and(
                        eq(adminMcpReservationsTable.tokenId, actor.tokenId),
                        eq(
                            adminMcpReservationsTable.operationKey,
                            operationKey,
                        ),
                        eq(adminMcpReservationsTable.kind, 'model-check'),
                    ),
                );

            return row
                ? {
                      id: row.id,
                      state: row.state,
                      amount: unitsAmount(
                          row.settledUnits ?? row.reservedUnits,
                      ),
                      result: row.result,
                      createdAt: row.createdAt.toISOString(),
                      settledAt: row.settledAt?.toISOString() ?? null,
                  }
                : null;
        });
    }

    /** Safe metadata only; caller must not pass prompts, credentials or user content. */
    public async recordOutcome(
        actor: AdminMcpActor,
        action: string,
        target: string,
        reason: string,
        metadata: Record<string, unknown>,
        outcome: 'success' | 'rejected' = 'success',
    ): Promise<void> {
        await this.database.transaction(async (tx) => {
            await audit(
                tx,
                actor,
                action,
                target,
                reason,
                this.now(),
                metadata,
                outcome,
            );
        });
    }

    /** Null expense is unknown: keep the reservation, never settle it as zero. */
    public settle(
        id: string,
        amount: string | null,
        result?: unknown,
    ): Promise<void> {
        return this.database.transaction((tx) =>
            this.settleInTransaction(tx, id, amount, this.now(), result),
        );
    }

    public async settleInTransaction(
        tx: AdminMcpTransaction,
        id: string,
        amount: string | null,
        at = this.now(),
        result?: unknown,
    ): Promise<void> {
        const [reservation] = await tx
            .select()
            .from(adminMcpReservationsTable)
            .where(eq(adminMcpReservationsTable.id, id))
            .for('update');

        if (!reservation)
            throw new AdminMcpError('not_found', 'Reservation not found.');
        const units = amount === null ? null : amountUnits(amount);
        if (reservation.state === 'settled') {
            if (reservation.settledUnits !== units)
                throw new AdminMcpError(
                    'idempotency_conflict',
                    'Reservation already settled differently.',
                );

            return;
        }

        // Record actual incurred expense even when it exceeds a conservative estimate.
        await tx
            .update(adminMcpReservationsTable)
            .set({
                ...(result === undefined ? {} : { result }),
                state: units === null ? 'unknown' : 'settled',
                settledUnits: units,
                settledAt: units === null ? null : at,
            })
            .where(eq(adminMcpReservationsTable.id, id));
    }
}
