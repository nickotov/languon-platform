import type {
    AdminAiCreditsQuery,
    AdminAiCreditsResponse,
    AdminUserDetail,
} from '@languon/contracts';
import { eq, sql } from 'drizzle-orm';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AdminAccessDeniedError,
    AdminAiCreditTargetUnavailableError,
    AdminUserNotFoundError,
} from '../../../application/administration-errors';
import type {
    AdminAiCreditAdjustmentMutationInput,
    AdminAiCreditMutationRejection,
    AdminAiCreditPolicyMutationInput,
} from '../../../application/ports/administration-store';
import {
    adminCreditsToMilli,
    milliToAdminCredits,
} from './admin-credit-amount';
import {
    aiCreditRejection,
    auditValues,
    isCreditManageableStatus,
    type AdministrationStoreContext,
    type AdministrationTransaction,
    type QueryDatabase,
} from './administration-persistence-support';
import { assertActorCanMutate } from './administration-user-mutations';
import { activeOwnerMutationLock } from './owner-lock';
import { adminAuditEventsTable } from './schema';

export async function aiCredits(
    persistence: AdministrationStoreContext,
    userId: string,
    query: AdminAiCreditsQuery,
    at: Date,
): Promise<AdminAiCreditsResponse> {
    return persistence.database.transaction(async (transaction) => {
        const target = await creditTarget(persistence, transaction, userId);
        if (!target) throw new AdminUserNotFoundError();

        return aiCreditsResponse(persistence, transaction, userId, query, at);
    });
}

export function updateAiCreditPolicy(
    persistence: AdministrationStoreContext,
    input: AdminAiCreditPolicyMutationInput,
) {
    return mutateAiCredits(persistence, input, 'ai_credit_policy_updated');
}

export function adjustAiCredits(
    persistence: AdministrationStoreContext,
    input: AdminAiCreditAdjustmentMutationInput,
) {
    return mutateAiCredits(persistence, input, 'ai_credits_adjusted');
}

export async function mutateAiCredits(
    persistence: AdministrationStoreContext,
    input:
        AdminAiCreditPolicyMutationInput | AdminAiCreditAdjustmentMutationInput,
    action: 'ai_credit_policy_updated' | 'ai_credits_adjusted',
) {
    return persistence.database.transaction(async (transaction) => {
        await transaction.execute(
            sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
        );

        const [clock] = await transaction
            .select({ value: sql<string>`clock_timestamp()::text` })
            .from(usersTable)
            .limit(1);
        const operationTime = new Date(clock?.value ?? Number.NaN);
        if (Number.isNaN(operationTime.getTime())) {
            throw new AdminAccessDeniedError();
        }

        let target: {
            id: string;
            status: AdminUserDetail['status'];
        } | null = null;
        let beforeVersion: number | null = null;
        let rejection: AdminAiCreditMutationRejection | null = null;
        let response: AdminAiCreditsResponse | null = null;
        try {
            await assertActorCanMutate(
                persistence,
                transaction,
                input,
                operationTime,
            );

            target = await creditTarget(
                persistence,
                transaction,
                input.targetUserId,
                true,
            );

            if (!target || !isCreditManageableStatus(target.status)) {
                throw new AdminAiCreditTargetUnavailableError();
            }

            const credits = new DrizzleAiCreditTransactionParticipant(
                transaction,
            );
            const before = await credits.accountSummary(
                target.id,
                operationTime,
            );

            beforeVersion = before.managementVersion;
            if (action === 'ai_credit_policy_updated') {
                const policy = input as AdminAiCreditPolicyMutationInput;
                await credits.updatePolicy({
                    at: operationTime,
                    expectedManagementVersion: policy.expectedVersion,
                    mode: policy.mode,
                    ownerId: target.id,
                    reason: policy.reason,
                    unlimitedUntil: policy.unlimitedUntil
                        ? new Date(policy.unlimitedUntil)
                        : null,
                });
            } else {
                const adjustment =
                    input as AdminAiCreditAdjustmentMutationInput;

                await credits.adjustByAdmin({
                    amount: adminCreditsToMilli(adjustment.amountCredits),
                    at: operationTime,
                    expectedManagementVersion: adjustment.expectedVersion,
                    expiresAt: adjustment.expiresAt
                        ? new Date(adjustment.expiresAt)
                        : null,
                    ownerId: target.id,
                    reason: adjustment.reason,
                    sourceReference: `admin:${input.audit.correlationId}`,
                });
            }

            response = await aiCreditsResponse(
                persistence,
                transaction,
                target.id,
                { page: 1, pageSize: 25 },
                operationTime,
            );
        } catch (error) {
            rejection = aiCreditRejection(error);
            if (rejection === null) throw error;
        }

        const afterVersion = response?.account.managementVersion ?? null;
        await transaction.insert(adminAuditEventsTable).values(
            auditValues({
                action,
                actorUserId: input.actorUserId,
                ...(afterVersion !== null && { afterVersion }),
                ...(beforeVersion !== null && { beforeVersion }),
                ...input.audit,
                expiresAt: new Date(
                    operationTime.getTime() +
                        (input.audit.expiresAt.getTime() -
                            input.audit.occurredAt.getTime()),
                ),
                metadata: {
                    expectedVersion: input.expectedVersion,
                    ...(action === 'ai_credit_policy_updated'
                        ? {
                              mode: (input as AdminAiCreditPolicyMutationInput)
                                  .mode,
                              unlimitedUntil: (
                                  input as AdminAiCreditPolicyMutationInput
                              ).unlimitedUntil,
                          }
                        : {
                              amountCredits: (
                                  input as AdminAiCreditAdjustmentMutationInput
                              ).amountCredits,
                              expiresAt: (
                                  input as AdminAiCreditAdjustmentMutationInput
                              ).expiresAt,
                          }),
                    ...(rejection ? { rejection } : {}),
                    requestedTargetUserId: input.targetUserId,
                    targetId: input.targetUserId,
                    targetKind: 'ai_credit_account',
                },
                occurredAt: operationTime,
                outcome: rejection ? 'rejected' : 'success',
                reason: input.reason,
                ...(target ? { targetUserId: target.id } : {}),
            }),
        );

        return rejection
            ? ({ ok: false, rejection } as const)
            : ({ ok: true, response: response! } as const);
    });
}

export async function creditTarget(
    persistence: AdministrationStoreContext,
    database: QueryDatabase,
    userId: string,
    lock = false,
) {
    let query = database
        .select({ id: usersTable.id, status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

    if (lock) {
        // QueryDatabase's union does not retain Drizzle's lock builder type.
        query = query.for('update') as typeof query;
    }

    const [target] = await query;

    return target ?? null;
}

export async function aiCreditsResponse(
    persistence: AdministrationStoreContext,
    transaction: AdministrationTransaction,
    userId: string,
    query: AdminAiCreditsQuery,
    at: Date,
): Promise<AdminAiCreditsResponse> {
    const credits = new DrizzleAiCreditTransactionParticipant(transaction);
    const summary = await credits.accountSummary(userId, at);
    const history = await credits.history({
        ownerId: userId,
        page: query.page,
        pageSize: query.pageSize,
    });

    return {
        account: {
            availableCredits: milliToAdminCredits(summary.availableCredits),
            configuredMode: summary.policy.configuredMode,
            effectiveMode: summary.policy.effectiveMode,
            enforcementEnabled:
                process.env.DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED === 'true',
            lifetimeConsumedCredits: milliToAdminCredits(
                summary.consumedCredits,
            ),
            managementVersion: summary.managementVersion,
            nextExpirationAt: summary.nextExpirationAt?.toISOString() ?? null,
            reservedCredits: milliToAdminCredits(summary.reservedCredits),
            unlimitedUntil:
                summary.policy.unlimitedUntil?.toISOString() ?? null,
            userId,
        },
        history: history.entries.map((entry) => ({
            amountCredits: milliToAdminCredits(entry.amount),
            expiresAt: entry.expiresAt?.toISOString() ?? null,
            id: entry.id,
            kind: entry.kind === 'admin_removal' ? 'removal' : entry.kind,
            measurementSource: entry.measurement,
            occurredAt: entry.createdAt.toISOString(),
            reason: entry.reason,
            sourceKind: entry.grantSource,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total: history.total,
    };
}
