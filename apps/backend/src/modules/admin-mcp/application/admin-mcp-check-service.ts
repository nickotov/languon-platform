import { z } from 'zod';
import {
    TextAiProbeRequestSchema,
    adminMcpReasonSchema,
} from '@languon/contracts';
import type { AdminMcpCredentialService } from './admin-mcp-credential-service';
import type { TextAiProbeService } from '../../text-ai/application/text-ai-probe-service';
import {
    AdminMcpError,
    amountUnits,
    unitsAmount,
    requirePermission,
    requireAction,
    assertSafeAuditContext,
    type AdminMcpActor,
    type AdminMcpReservation,
} from '../domain/admin-mcp';

export const adminMcpCheckRequestSchema = z
    .object({
        operationKey: z.uuid(),
        request: TextAiProbeRequestSchema,
        reason: adminMcpReasonSchema,
    })
    .strict();
export interface AdminMcpCheckDependencies {
    credentials: Pick<AdminMcpCredentialService, 'authenticate'>;
    probes: Pick<TextAiProbeService, 'run' | 'limits'>;
    budget: {
        effectiveMaximum(
            actor: AdminMcpActor,
            configured: bigint,
        ): Promise<bigint>;
        reserve(
            actor: AdminMcpActor,
            key: string,
            payload: unknown,
            maximumUsd: string,
        ): Promise<AdminMcpReservation>;
        authorizeDispatch(actor: AdminMcpActor, id: string): Promise<void>;
        settle(
            actor: AdminMcpActor,
            id: string,
            amount: string | null,
            result?: unknown,
        ): Promise<void>;
    };
    quotas: {
        get(actor: AdminMcpActor, key: string): Promise<unknown>;
        recordOutcome(
            actor: AdminMcpActor,
            action: string,
            target: string,
            reason: string,
            metadata: Record<string, unknown>,
            outcome?: 'success' | 'rejected',
        ): Promise<void>;
    };
    rejectionAudit: {
        record(
            actor: AdminMcpActor,
            operation: string,
            input: unknown,
            error: unknown,
        ): Promise<void>;
    };
    expenseId(id: string): Promise<string | null>;
}
/** Coordinates delegated authorization, bounded execution, settlement and audit without transport/database dependencies. */
export class AdminMcpCheckService {
    constructor(private readonly dependencies: AdminMcpCheckDependencies) {}
    async limits(actor: AdminMcpActor) {
        requirePermission(actor, 'model-checks.run');
        requireAction(actor, 'model-checks.status');
        const effective = await this.dependencies.budget.effectiveMaximum(
            actor,
            this.dependencies.probes.limits.maximumCostMicros,
        );
        const tomorrow = new Date();
        tomorrow.setUTCHours(24, 0, 0, 0);
        return {
            maximumCostUsd: unitsAmount(effective),
            applicationMaximumCostUsd: unitsAmount(
                this.dependencies.probes.limits.maximumCostMicros,
            ),
            applicationDailyMaximumCostUsd: unitsAmount(
                this.dependencies.probes.limits.dailyMaximumCostMicros,
            ),
            tokenDailyMaximumCostUsd: actor.limits.modelChecks?.perDayUsd,
            cooldownSeconds: this.dependencies.probes.limits.cooldownSeconds,
            evidenceHours: this.dependencies.probes.limits.evidenceHours,
            resetsAt: tomorrow.toISOString(),
        };
    }

    async status(actor: AdminMcpActor, operationKey?: string) {
        requirePermission(actor, 'model-checks.run');
        requireAction(actor, 'model-checks.status');
        if (operationKey) z.uuid().parse(operationKey);
        return {
            limits: await this.limits(actor),
            reservation: operationKey
                ? await this.dependencies.quotas.get(actor, operationKey)
                : null,
        };
    }
    async run(
        actor: AdminMcpActor,
        secret: string,
        raw: unknown,
    ): Promise<unknown> {
        try {
            const { operationKey, request, reason } =
                adminMcpCheckRequestSchema.parse(raw);
            requirePermission(actor, 'model-checks.run');
            requireAction(actor, 'model-checks.run');
            assertSafeAuditContext(reason);
            const cap = actor.limits.modelChecks;
            const effectiveMaximum =
                await this.dependencies.budget.effectiveMaximum(
                    actor,
                    this.dependencies.probes.limits.maximumCostMicros,
                );
            const amount = unitsAmount(effectiveMaximum);
            if (!cap || amountUnits(amount) > amountUnits(cap.perCheckUsd))
                throw new AdminMcpError(
                    'quota_exceeded',
                    'Configured model-check maximum exceeds this token ceiling. An administrator must lower the application check maximum or issue a replacement token.',
                );
            if (
                amountUnits(request.approvedMaximumCostUsd) !==
                amountUnits(amount)
            )
                throw new AdminMcpError(
                    'stale_preview',
                    `Review the current per-check maximum: USD ${amount}.`,
                );
            const reservation = await this.dependencies.budget.reserve(
                actor,
                operationKey,
                { request, reason },
                amount,
            );
            if (reservation.replay)
                return this.dependencies.quotas.get(actor, operationKey);
            let dispatchAuthorized = false;
            const controller = new AbortController();
            // Authority monitoring only exists while an explicit check is executing.
            let polling = false;
            const timer = setInterval(() => {
                if (polling) return;
                polling = true;
                void this.dependencies.credentials
                    .authenticate(secret, 'model-checks.run')
                    .catch(() => controller.abort())
                    .finally(() => {
                        polling = false;
                    });
            }, 1000);
            timer.unref();
            try {
                await this.dependencies.credentials.authenticate(
                    secret,
                    'model-checks.run',
                );
                const check = await this.dependencies.probes.run(
                    actor.userId,
                    request,
                    controller.signal,
                    async () => {
                        await this.dependencies.budget.authorizeDispatch(
                            actor,
                            reservation.id,
                        );
                        dispatchAuthorized = true;
                    },
                    effectiveMaximum,
                );
                await this.dependencies.budget.settle(
                    actor,
                    reservation.id,
                    check.providerCostUsd,
                    check,
                );
                const providerExpenseId = await this.dependencies.expenseId(
                    check.id,
                );
                await this.dependencies.quotas.recordOutcome(
                    actor,
                    check.state === 'passed'
                        ? 'model-check.completed'
                        : 'model-check.failed',
                    check.id,
                    reason,
                    {
                        reservationId: reservation.id,
                        probeId: check.id,
                        providerExpenseId,
                        measurement: check.measurement,
                        costUsd: check.providerCostUsd,
                    },
                    check.state === 'passed' ? 'success' : 'rejected',
                );
                return { reservationId: reservation.id, check };
            } catch (error) {
                const notDispatched = !dispatchAuthorized;
                await this.dependencies.budget.settle(
                    actor,
                    reservation.id,
                    notDispatched ? '0' : null,
                    {
                        state: 'failed',
                        code: notDispatched
                            ? 'check_not_dispatched'
                            : 'execution_unknown',
                    },
                );
                await this.dependencies.quotas.recordOutcome(
                    actor,
                    'model-check.failed',
                    reservation.id,
                    reason,
                    {
                        reservationId: reservation.id,
                        state: notDispatched ? 'not_dispatched' : 'unknown',
                    },
                    'rejected',
                );
                throw error;
            } finally {
                clearInterval(timer);
            }
        } catch (error) {
            await this.dependencies.rejectionAudit.record(
                actor,
                'model-check.rejected',
                raw,
                error,
            );
            throw error;
        }
    }
}
