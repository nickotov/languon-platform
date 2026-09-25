import {
    and,
    count,
    desc,
    eq,
    gt,
    ilike,
    isNull,
    or,
    sql,
    type SQL,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type {
    AdminAiSettingsResponse,
    AdminAiCreditsQuery,
    AdminAiCreditsResponse,
    AdminAuditEvent,
    AdminAuditEventsQuery,
    AdminDashboardResponse,
    AdminUserDetail,
    AdminUsersQuery,
    AdminUsersResponse,
} from '@languon/contracts';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    authPasskeysTable,
    authSessionsTable,
} from '../../../../authentication/infrastructure/persistence/drizzle/schema';
import { User } from '../../../../users/domain/user';
import {
    AiCreditIdempotencyConflictError,
    AiCreditInsufficientBalanceError,
    AiCreditInvalidAmountError,
    AiCreditManagementConflictError,
} from '../../../../ai-credits/domain/ai-credit';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import type { AccountDeletionRecoveryJournal } from '../../../../users/application/ports/account-deletion-recovery-journal';
import { accountDeletionRequestsTable } from '../../../../users/infrastructure/persistence/drizzle/account-deletion-schema';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AdminAccessDeniedError,
    AdminAiCreditTargetUnavailableError,
    AdminAiSettingsConflictError,
    AdminAiSettingsUnavailableError,
    AdminCancellationJournalUnavailableError,
    AdminDeletionCancellationUnavailableError,
    AdminLastOwnerForbiddenError,
    AdminUserNotFoundError,
    AdminUserStateConflictError,
} from '../../../application/administration-errors';
import { RecentAuthenticationRequiredError } from '../../../../authentication/application/authentication-errors';
import type {
    AdministrationStore,
    AdminAiCreditAdjustmentMutationInput,
    AdminAiCreditMutationRejection,
    AdminAiCreditPolicyMutationInput,
    AdminAiSettingsMutationInput,
    AdminAuditWrite,
    AdminUserMutationInput,
} from '../../../application/ports/administration-store';
import { adminAuditEventsTable, adminMembershipsTable } from './schema';
import { activeOwnerMutationLock } from './owner-lock';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    dictionaryAiModelCatalog,
    dictionaryAiTextFormats,
    findDictionaryAiModel,
} from '../../../../dictionaries/application/dictionary-ai-provider-catalog';

type AdministrationDatabase = PostgresJsDatabase<typeof databaseSchema>;
type AdministrationTransaction = Parameters<
    Parameters<AdministrationDatabase['transaction']>[0]
>[0];
type QueryDatabase = AdministrationDatabase | AdministrationTransaction;
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDictionaryAiCredentialConfigured(providerId: 'deepseek' | 'kie') {
    const variable =
        providerId === 'deepseek'
            ? 'DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED'
            : 'DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED';
    return process.env[variable] === 'true';
}

export class DrizzleAdministrationStore implements AdministrationStore {
    public constructor(
        private readonly database: AdministrationDatabase,
        private readonly cancellationJournal: Pick<
            AccountDeletionRecoveryJournal,
            'recordCancellation'
        >,
    ) {}

    public async findActiveMembership(userId: string) {
        const [membership] = await this.database
            .select({
                grantedAt: adminMembershipsTable.grantedAt,
                id: adminMembershipsTable.id,
                role: adminMembershipsTable.role,
                userId: adminMembershipsTable.userId,
            })
            .from(adminMembershipsTable)
            .where(
                and(
                    eq(adminMembershipsTable.userId, userId),
                    isNull(adminMembershipsTable.revokedAt),
                ),
            )
            .limit(1);
        return membership ?? null;
    }

    public async aiSettings(): Promise<AdminAiSettingsResponse> {
        const [[row], observations] = await Promise.all([
            this.database
                .select({
                    activeRevisionId:
                        dictionaryAiConfigurationTable.activeRevisionId,
                    snapshot:
                        dictionaryAiConfigurationRevisionsTable.catalogSnapshot,
                    updatedAt: dictionaryAiConfigurationTable.updatedAt,
                    version: dictionaryAiConfigurationTable.version,
                })
                .from(dictionaryAiConfigurationTable)
                .leftJoin(
                    dictionaryAiConfigurationRevisionsTable,
                    eq(
                        dictionaryAiConfigurationRevisionsTable.id,
                        dictionaryAiConfigurationTable.activeRevisionId,
                    ),
                )
                .where(eq(dictionaryAiConfigurationTable.id, 'global'))
                .limit(1),
            this.database
                .select()
                .from(dictionaryAiWorkerObservationsTable)
                .orderBy(desc(dictionaryAiWorkerObservationsTable.checkedAt)),
        ]);
        return this.aiSettingsResponse(
            row
                ? {
                      snapshot: row.snapshot,
                      updatedAt: row.updatedAt,
                      version: row.version,
                  }
                : null,
            observations,
        );
    }

    public async aiCredits(
        userId: string,
        query: AdminAiCreditsQuery,
        at: Date,
    ): Promise<AdminAiCreditsResponse> {
        return this.database.transaction(async (transaction) => {
            const target = await this.creditTarget(transaction, userId);
            if (!target) throw new AdminUserNotFoundError();
            return this.aiCreditsResponse(transaction, userId, query, at);
        });
    }

    public updateAiCreditPolicy(input: AdminAiCreditPolicyMutationInput) {
        return this.mutateAiCredits(input, 'ai_credit_policy_updated');
    }

    public adjustAiCredits(input: AdminAiCreditAdjustmentMutationInput) {
        return this.mutateAiCredits(input, 'ai_credits_adjusted');
    }

    public async updateAiSettings(
        input: AdminAiSettingsMutationInput,
    ): Promise<AdminAiSettingsResponse> {
        const enabledModels = [...new Set(input.enabledModels)];
        if (enabledModels.length !== input.enabledModels.length) {
            throw new AdminAiSettingsUnavailableError(
                'Enabled AI models must be unique.',
            );
        }
        const catalogById = new Map(
            dictionaryAiModelCatalog.map((model) => [model.id, model]),
        );
        if (enabledModels.some((modelId) => !catalogById.has(modelId))) {
            throw new AdminAiSettingsUnavailableError(
                'One or more selected AI models are unsupported.',
            );
        }
        const selected = findDictionaryAiModel(
            input.activeProvider,
            input.defaultModel,
        );
        if (!selected || !enabledModels.includes(selected.id)) {
            throw new AdminAiSettingsUnavailableError(
                'The default model must be enabled for the active provider.',
            );
        }
        if (
            dictionaryAiTextFormats.some(
                (format) => !selected.supportedFormats.includes(format),
            )
        ) {
            throw new AdminAiSettingsUnavailableError(
                'The default model does not support every dictionary text-generation format.',
            );
        }
        if (!isDictionaryAiCredentialConfigured(selected.providerId)) {
            throw new AdminAiSettingsUnavailableError(
                `The ${selected.providerId} credential is not configured.`,
            );
        }
        if (process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED !== 'true') {
            throw new AdminAiSettingsUnavailableError(
                'Managed AI routing has not been activated for this deployment.',
            );
        }
        const observations = await this.database
            .select()
            .from(dictionaryAiWorkerObservationsTable)
            .where(
                and(
                    eq(
                        dictionaryAiWorkerObservationsTable.providerId,
                        selected.providerId,
                    ),
                    eq(
                        dictionaryAiWorkerObservationsTable.modelId,
                        selected.id,
                    ),
                ),
            )
            .orderBy(desc(dictionaryAiWorkerObservationsTable.checkedAt));
        if (
            observations.some(
                (observation) =>
                    observation.adapterRevision === selected.adapterRevision &&
                    observation.expiresAt.getTime() > Date.now() &&
                    observation.status === 'unavailable',
            )
        ) {
            throw new AdminAiSettingsUnavailableError(
                'The selected AI provider is unavailable according to the latest worker observation.',
            );
        }

        await this.database.transaction(async (transaction) => {
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
            await this.assertActorCanMutate(transaction, input, operationTime);
            const [current] = await transaction
                .select({ version: dictionaryAiConfigurationTable.version })
                .from(dictionaryAiConfigurationTable)
                .where(eq(dictionaryAiConfigurationTable.id, 'global'))
                .limit(1)
                .for('update');
            const currentVersion = current?.version ?? 0;
            if (currentVersion !== input.expectedVersion) {
                throw new AdminAiSettingsConflictError();
            }
            const nextVersion = currentVersion + 1;
            await transaction
                .insert(dictionaryAiConfigurationRevisionsTable)
                .values({
                    catalogSnapshot: {
                        adapterRevision: selected.adapterRevision,
                        aggregateBudget: selected.aggregateBudget,
                        credentialReference: selected.credentialReference,
                        creditPricing: selected.creditPricing,
                        enabledModelIds: enabledModels,
                        modelId: selected.id,
                        perCallMaxInputTokens: selected.perCallMaxInputTokens,
                        perCallMaxOutputTokens: selected.perCallMaxOutputTokens,
                        providerId: selected.providerId,
                        supportedFormats: [...selected.supportedFormats],
                    },
                    createdAt: operationTime,
                    createdByUserId: input.actorUserId,
                    id: input.revisionId,
                    version: nextVersion,
                });
            if (current) {
                await transaction
                    .update(dictionaryAiConfigurationTable)
                    .set({
                        activeRevisionId: input.revisionId,
                        updatedAt: operationTime,
                        version: nextVersion,
                    })
                    .where(
                        and(
                            eq(dictionaryAiConfigurationTable.id, 'global'),
                            eq(
                                dictionaryAiConfigurationTable.version,
                                currentVersion,
                            ),
                        ),
                    );
            } else {
                await transaction
                    .insert(dictionaryAiConfigurationTable)
                    .values({
                        activeRevisionId: input.revisionId,
                        id: 'global',
                        updatedAt: operationTime,
                        version: nextVersion,
                    });
            }
            await transaction.insert(adminAuditEventsTable).values(
                auditValues({
                    action: 'ai_settings_updated',
                    actorUserId: input.actorUserId,
                    afterVersion: nextVersion,
                    ...(currentVersion > 0
                        ? { beforeVersion: currentVersion }
                        : {}),
                    ...input.audit,
                    expiresAt: new Date(
                        operationTime.getTime() +
                            (input.audit.expiresAt.getTime() -
                                input.audit.occurredAt.getTime()),
                    ),
                    metadata: {
                        activeProvider: selected.providerId,
                        defaultModel: selected.id,
                        enabledModels,
                        targetId: 'global',
                        targetKind: 'dictionary_ai_configuration',
                    },
                    occurredAt: operationTime,
                    outcome: 'success',
                    reason: input.reason,
                }),
            );
        });
        return this.aiSettings();
    }

    public async dashboard(): Promise<AdminDashboardResponse> {
        const [counts, recentAuditEvents] = await Promise.all([
            this.dashboardCounts(),
            this.listAuditEvents({ page: 1, pageSize: 10 }),
        ]);
        return { counts, recentAuditEvents: recentAuditEvents.data };
    }

    public async listUsers(
        input: AdminUsersQuery,
    ): Promise<AdminUsersResponse> {
        const where = this.userWhere(input);
        const offset = (input.page - 1) * input.pageSize;
        const [rows, totals] = await Promise.all([
            this.database
                .select(userSummarySelection())
                .from(usersTable)
                .innerJoin(
                    userEmailsTable,
                    and(
                        eq(userEmailsTable.userId, usersTable.id),
                        eq(userEmailsTable.isPrimary, true),
                    ),
                )
                .leftJoin(
                    adminMembershipsTable,
                    and(
                        eq(adminMembershipsTable.userId, usersTable.id),
                        isNull(adminMembershipsTable.revokedAt),
                    ),
                )
                .where(where)
                .orderBy(desc(usersTable.createdAt), desc(usersTable.id))
                .limit(input.pageSize)
                .offset(offset),
            this.database
                .select({ value: count() })
                .from(usersTable)
                .innerJoin(
                    userEmailsTable,
                    and(
                        eq(userEmailsTable.userId, usersTable.id),
                        eq(userEmailsTable.isPrimary, true),
                    ),
                )
                .where(where),
        ]);
        return {
            data: rows.map(mapUserSummary),
            page: input.page,
            pageSize: input.pageSize,
            total: totals[0]?.value ?? 0,
        };
    }

    public findUser(userId: string): Promise<AdminUserDetail | null> {
        return this.readUser(this.database, userId);
    }

    public async listAuditEvents(input: AdminAuditEventsQuery) {
        const conditions: SQL[] = [];
        if (input.action) {
            conditions.push(eq(adminAuditEventsTable.action, input.action));
        }
        if (input.outcome) {
            conditions.push(eq(adminAuditEventsTable.outcome, input.outcome));
        }
        if (input.actorUserId) {
            conditions.push(
                eq(adminAuditEventsTable.actorUserId, input.actorUserId),
            );
        }
        if (input.targetUserId) {
            conditions.push(
                eq(adminAuditEventsTable.targetUserId, input.targetUserId),
            );
        }
        const where = conditions.length ? and(...conditions) : undefined;
        const [rows, totals] = await Promise.all([
            this.database
                .select(auditSelection())
                .from(adminAuditEventsTable)
                .where(where)
                .orderBy(
                    desc(adminAuditEventsTable.occurredAt),
                    desc(adminAuditEventsTable.id),
                )
                .limit(input.pageSize)
                .offset((input.page - 1) * input.pageSize),
            this.database
                .select({ value: count() })
                .from(adminAuditEventsTable)
                .where(where),
        ]);
        return {
            data: rows.map(mapAuditEvent),
            page: input.page,
            pageSize: input.pageSize,
            total: totals[0]?.value ?? 0,
        };
    }

    public async recordAudit(input: AdminAuditWrite): Promise<void> {
        await this.database
            .insert(adminAuditEventsTable)
            .values(auditValues(input));
    }

    public disableUser(input: AdminUserMutationInput) {
        return this.mutateUser(input, 'disable');
    }

    public restoreUser(input: AdminUserMutationInput) {
        return this.mutateUser(input, 'restore');
    }

    public cancelUserDeletion(
        input: AdminUserMutationInput,
    ): Promise<AdminUserDetail> {
        return this.database.transaction(async (transaction) => {
            await transaction.execute(
                sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
            );
            await transaction.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${input.targetUserId}, 76021941))`,
            );
            const [clock] = await transaction
                .select({ value: sql<string>`clock_timestamp()::text` })
                .from(usersTable)
                .limit(1);
            const operationTime = new Date(clock?.value ?? Number.NaN);
            if (Number.isNaN(operationTime.getTime())) {
                throw new AdminAccessDeniedError();
            }
            await this.assertActorCanMutate(transaction, input, operationTime);

            // The purge worker takes these same locks in this order. Its claim
            // and this cancellation cannot both commit for one request.
            const [request] = await transaction
                .select({ state: accountDeletionRequestsTable.state })
                .from(accountDeletionRequestsTable)
                .where(
                    eq(accountDeletionRequestsTable.userId, input.targetUserId),
                )
                .limit(1)
                .for('update');
            if (request?.state !== 'pending') {
                throw new AdminDeletionCancellationUnavailableError();
            }
            const [row] = await transaction
                .select({
                    createdAt: usersTable.createdAt,
                    handle: usersTable.handle,
                    id: usersTable.id,
                    status: usersTable.status,
                    updatedAt: usersTable.updatedAt,
                    version: usersTable.version,
                })
                .from(usersTable)
                .where(eq(usersTable.id, input.targetUserId))
                .limit(1)
                .for('update');
            if (!row) throw new AdminUserNotFoundError();
            if (row.version !== input.expectedVersion) {
                throw new AdminUserStateConflictError();
            }
            if (row.status !== 'deletion_pending') {
                throw new AdminDeletionCancellationUnavailableError();
            }
            // Fail closed if the independent recovery journal cannot record
            // the cancellation while both rows are still locked. A journal
            // write followed by SQL rollback is harmless: the recovery gate
            // requires a committed active user at this exact version.
            try {
                await this.cancellationJournal.recordCancellation({
                    cancelledAt: operationTime,
                    userId: row.id,
                    userVersion: row.version + 1,
                });
            } catch {
                // The transport failure is intentionally not logged here:
                // the writer owns diagnostics, and user data must stay out of logs.
                throw new AdminCancellationJournalUnavailableError();
            }
            const changed = await transaction
                .update(accountDeletionRequestsTable)
                .set({
                    leaseDeadline: null,
                    leaseWorkerId: null,
                    state: 'cancelled',
                    updatedAt: operationTime,
                })
                .where(
                    and(
                        eq(
                            accountDeletionRequestsTable.userId,
                            input.targetUserId,
                        ),
                        eq(accountDeletionRequestsTable.state, 'pending'),
                    ),
                )
                .returning({ userId: accountDeletionRequestsTable.userId });
            if (changed.length !== 1) {
                throw new AdminDeletionCancellationUnavailableError();
            }
            const updated = await transaction
                .update(usersTable)
                .set({
                    status: 'active',
                    updatedAt: operationTime,
                    version: row.version + 1,
                })
                .where(
                    and(
                        eq(usersTable.id, row.id),
                        eq(usersTable.status, 'deletion_pending'),
                        eq(usersTable.version, row.version),
                    ),
                )
                .returning({ id: usersTable.id });
            if (updated.length !== 1) throw new AdminUserStateConflictError();
            await transaction.insert(adminAuditEventsTable).values(
                auditValues({
                    action: 'user_deletion_cancelled',
                    actorUserId: input.actorUserId,
                    afterStatus: 'active',
                    afterVersion: row.version + 1,
                    beforeStatus: row.status,
                    beforeVersion: row.version,
                    ...input.audit,
                    expiresAt: new Date(
                        operationTime.getTime() +
                            (input.audit.expiresAt.getTime() -
                                input.audit.occurredAt.getTime()),
                    ),
                    occurredAt: operationTime,
                    outcome: 'success',
                    reason: input.reason,
                    targetUserId: input.targetUserId,
                }),
            );
            const detail = await this.readUser(transaction, row.id);
            if (!detail) throw new AdminUserNotFoundError();
            return detail;
        });
    }

    private async mutateUser(
        input: AdminUserMutationInput,
        operation: 'disable' | 'restore',
    ): Promise<AdminUserDetail> {
        return this.database.transaction(async (transaction) => {
            await transaction.execute(
                sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
            );
            await transaction.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${input.targetUserId}, 76021941))`,
            );
            const [clock] = await transaction
                .select({ value: sql<string>`clock_timestamp()::text` })
                .from(usersTable)
                .limit(1);
            const operationTime = new Date(clock?.value ?? Number.NaN);
            if (Number.isNaN(operationTime.getTime())) {
                throw new AdminAccessDeniedError();
            }
            await this.assertActorCanMutate(transaction, input, operationTime);
            const [row] = await transaction
                .select({
                    createdAt: usersTable.createdAt,
                    handle: usersTable.handle,
                    id: usersTable.id,
                    status: usersTable.status,
                    updatedAt: usersTable.updatedAt,
                    verifiedAt: userEmailsTable.verifiedAt,
                    version: usersTable.version,
                })
                .from(usersTable)
                .innerJoin(
                    userEmailsTable,
                    and(
                        eq(userEmailsTable.userId, usersTable.id),
                        eq(userEmailsTable.isPrimary, true),
                    ),
                )
                .where(eq(usersTable.id, input.targetUserId))
                .limit(1)
                .for('update');
            if (!row) throw new AdminUserNotFoundError();
            if (row.version !== input.expectedVersion) {
                throw new AdminUserStateConflictError();
            }
            if (row.status === 'deletion_pending' || row.status === 'purged') {
                throw new AdminUserStateConflictError();
            }

            if (operation === 'disable' && row.status === 'active') {
                await this.assertNotLastOwner(transaction, row.id);
            }

            const current = User.restore(row);
            let updated: User;
            try {
                updated =
                    operation === 'disable'
                        ? current.disable(operationTime)
                        : current.restoreAvailability(
                              row.verifiedAt !== null,
                              operationTime,
                          );
            } catch {
                throw new AdminUserStateConflictError();
            }

            const changed = await transaction
                .update(usersTable)
                .set({
                    status: updated.status,
                    updatedAt: updated.updatedAt,
                    version: updated.version,
                })
                .where(
                    and(
                        eq(usersTable.id, updated.id),
                        eq(usersTable.version, input.expectedVersion),
                    ),
                )
                .returning({ id: usersTable.id });
            if (changed.length !== 1) throw new AdminUserStateConflictError();

            if (operation === 'disable') {
                await transaction
                    .update(authSessionsTable)
                    .set({
                        revokedAt: operationTime,
                        revocationReason: 'disabled_user',
                        updatedAt: operationTime,
                    })
                    .where(
                        and(
                            eq(authSessionsTable.userId, input.targetUserId),
                            isNull(authSessionsTable.revokedAt),
                        ),
                    );
            }

            await transaction.insert(adminAuditEventsTable).values(
                auditValues({
                    action:
                        operation === 'disable'
                            ? 'user_disabled'
                            : 'user_restored',
                    actorUserId: input.actorUserId,
                    afterStatus: updated.status,
                    afterVersion: updated.version,
                    beforeStatus: current.status,
                    beforeVersion: current.version,
                    ...input.audit,
                    expiresAt: new Date(
                        operationTime.getTime() +
                            (input.audit.expiresAt.getTime() -
                                input.audit.occurredAt.getTime()),
                    ),
                    occurredAt: operationTime,
                    outcome: 'success',
                    reason: input.reason,
                    targetUserId: input.targetUserId,
                }),
            );

            const detail = await this.readUser(transaction, updated.id);
            if (!detail) throw new AdminUserNotFoundError();
            return detail;
        });
    }

    private async assertActorCanMutate(
        transaction: AdministrationTransaction,
        input: Pick<
            | AdminUserMutationInput
            | AdminAiSettingsMutationInput
            | AdminAiCreditPolicyMutationInput
            | AdminAiCreditAdjustmentMutationInput,
            'actorSessionId' | 'actorUserId'
        >,
        operationTime: Date,
    ): Promise<void> {
        const [actor] = await transaction
            .select({ authenticatedAt: authSessionsTable.authenticatedAt })
            .from(authSessionsTable)
            .innerJoin(usersTable, eq(usersTable.id, authSessionsTable.userId))
            .innerJoin(
                userEmailsTable,
                and(
                    eq(userEmailsTable.userId, usersTable.id),
                    eq(userEmailsTable.isPrimary, true),
                    sql`${userEmailsTable.verifiedAt} is not null`,
                ),
            )
            .innerJoin(
                adminMembershipsTable,
                and(
                    eq(adminMembershipsTable.userId, usersTable.id),
                    isNull(adminMembershipsTable.revokedAt),
                ),
            )
            .where(
                and(
                    eq(authSessionsTable.id, input.actorSessionId),
                    eq(authSessionsTable.userId, input.actorUserId),
                    eq(usersTable.status, 'active'),
                    isNull(authSessionsTable.revokedAt),
                    isNull(authSessionsTable.rotatedAt),
                    gt(authSessionsTable.absoluteExpiresAt, operationTime),
                ),
            )
            .limit(1)
            .for('update', { of: authSessionsTable });
        if (!actor) throw new AdminAccessDeniedError();
        if (
            actor.authenticatedAt.getTime() + 5 * 60_000 <=
            operationTime.getTime()
        ) {
            throw new RecentAuthenticationRequiredError();
        }
    }

    private async mutateAiCredits(
        input:
            | AdminAiCreditPolicyMutationInput
            | AdminAiCreditAdjustmentMutationInput,
        action: 'ai_credit_policy_updated' | 'ai_credits_adjusted',
    ) {
        return this.database.transaction(async (transaction) => {
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
                await this.assertActorCanMutate(
                    transaction,
                    input,
                    operationTime,
                );
                target = await this.creditTarget(
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
                        amount: BigInt(adjustment.amountCredits),
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
                response = await this.aiCreditsResponse(
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
                                  mode: (
                                      input as AdminAiCreditPolicyMutationInput
                                  ).mode,
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

    private async creditTarget(
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

    private async aiCreditsResponse(
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
                availableCredits: Number(summary.availableCredits),
                configuredMode: summary.policy.configuredMode,
                effectiveMode: summary.policy.effectiveMode,
                enforcementEnabled:
                    process.env.DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED ===
                    'true',
                lifetimeConsumedCredits: Number(summary.consumedCredits),
                managementVersion: summary.managementVersion,
                nextExpirationAt:
                    summary.nextExpirationAt?.toISOString() ?? null,
                reservedCredits: Number(summary.reservedCredits),
                unlimitedUntil:
                    summary.policy.unlimitedUntil?.toISOString() ?? null,
                userId,
            },
            history: history.entries.map((entry) => ({
                amountCredits: Number(entry.amount),
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

    private aiSettingsResponse(
        row: {
            snapshot:
                | (typeof dictionaryAiConfigurationRevisionsTable.$inferSelect)['catalogSnapshot']
                | null;
            updatedAt: Date;
            version: number;
        } | null,
        observations: Array<
            typeof dictionaryAiWorkerObservationsTable.$inferSelect
        >,
    ): AdminAiSettingsResponse {
        const routingEnabled =
            process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED === 'true';
        return {
            providers: (['deepseek', 'kie'] as const).map((providerId) => {
                const models = dictionaryAiModelCatalog.filter(
                    (model) => model.providerId === providerId,
                );
                const configured =
                    isDictionaryAiCredentialConfigured(providerId);
                const observedModelId =
                    row?.snapshot?.providerId === providerId
                        ? row.snapshot.modelId
                        : models[0]?.id;
                const modelObservations = observations.filter(
                    (candidate) =>
                        candidate.providerId === providerId &&
                        candidate.modelId === observedModelId,
                );
                const currentObservations = modelObservations.filter(
                    (observation) =>
                        observation.expiresAt.getTime() > Date.now(),
                );
                const currentObservation =
                    currentObservations.find(
                        (observation) => observation.status === 'unavailable',
                    ) ??
                    currentObservations.find(
                        (observation) => observation.status === 'available',
                    ) ??
                    currentObservations[0];
                const latestObservation = modelObservations[0];
                const health = !configured
                    ? {
                          checkedAt:
                              latestObservation?.checkedAt.toISOString() ??
                              null,
                          message: 'Provider credential is missing.',
                          status: 'unverified' as const,
                      }
                    : currentObservation
                      ? {
                            checkedAt:
                                currentObservation.checkedAt.toISOString(),
                            message: currentObservation.message,
                            status: currentObservation.status as
                                'available' | 'unavailable' | 'unverified',
                        }
                      : {
                            checkedAt:
                                latestObservation?.checkedAt.toISOString() ??
                                null,
                            message: latestObservation
                                ? 'The latest worker readiness observation is stale.'
                                : 'Credential configured; worker readiness has not been observed.',
                            status: 'unverified' as const,
                        };
                return {
                    credentialStatus: configured ? 'configured' : 'missing',
                    health,
                    id: providerId,
                    label: providerId === 'deepseek' ? 'DeepSeek' : 'Kie',
                    models: models.map((model) => ({
                        available:
                            configured &&
                            routingEnabled &&
                            health.status !== 'unavailable',
                        creditPricing: model.creditPricing,
                        id: model.id,
                        label: model.label,
                        supportedFormats: [...model.supportedFormats],
                        unavailableReason: !routingEnabled
                            ? 'Managed AI routing is not active for this deployment.'
                            : configured && health.status === 'unavailable'
                              ? health.message
                              : configured
                                ? null
                                : 'Provider credential is missing.',
                    })),
                };
            }),
            settings: {
                activeProvider: row?.snapshot?.providerId ?? null,
                defaultModel: row?.snapshot?.modelId ?? null,
                enabledModels: row?.snapshot?.enabledModelIds ?? [],
                updatedAt: row?.updatedAt.toISOString() ?? null,
                version: row?.version ?? 0,
            },
        };
    }

    private async assertNotLastOwner(
        transaction: AdministrationTransaction,
        targetUserId: string,
    ): Promise<void> {
        const [targetMembership, ownerCount] = await Promise.all([
            transaction
                .select({ id: adminMembershipsTable.id })
                .from(adminMembershipsTable)
                .where(
                    and(
                        eq(adminMembershipsTable.userId, targetUserId),
                        isNull(adminMembershipsTable.revokedAt),
                    ),
                )
                .limit(1),
            transaction
                .select({ value: count() })
                .from(adminMembershipsTable)
                .innerJoin(
                    usersTable,
                    eq(usersTable.id, adminMembershipsTable.userId),
                )
                .where(
                    and(
                        isNull(adminMembershipsTable.revokedAt),
                        eq(adminMembershipsTable.role, 'owner'),
                        eq(usersTable.status, 'active'),
                    ),
                ),
        ]);
        if (targetMembership.length && (ownerCount[0]?.value ?? 0) <= 1) {
            throw new AdminLastOwnerForbiddenError();
        }
    }

    private async readUser(
        database: QueryDatabase,
        userId: string,
    ): Promise<AdminUserDetail | null> {
        const [row] = await database
            .select({
                ...userSummarySelection(),
                activeSessionCount: sql<number>`cast((select count(*) from ${authSessionsTable} s where s.user_id = ${usersTable.id} and s.revoked_at is null and s.rotated_at is null and s.absolute_expires_at > now()) as integer)`,
                passkeyCount: sql<number>`cast((select count(*) from ${authPasskeysTable} p where p.user_id = ${usersTable.id} and p.revoked_at is null) as integer)`,
            })
            .from(usersTable)
            .innerJoin(
                userEmailsTable,
                and(
                    eq(userEmailsTable.userId, usersTable.id),
                    eq(userEmailsTable.isPrimary, true),
                ),
            )
            .leftJoin(
                adminMembershipsTable,
                and(
                    eq(adminMembershipsTable.userId, usersTable.id),
                    isNull(adminMembershipsTable.revokedAt),
                ),
            )
            .where(eq(usersTable.id, userId))
            .limit(1);
        return row
            ? {
                  ...mapUserSummary(row),
                  activeSessionCount: row.activeSessionCount,
                  passkeyCount: row.passkeyCount,
              }
            : null;
    }

    private userWhere(input: AdminUsersQuery): SQL | undefined {
        const conditions: SQL[] = [];
        if (input.status) conditions.push(eq(usersTable.status, input.status));
        if (input.search) {
            const matches: SQL[] = [
                ilike(userEmailsTable.email, `%${input.search}%`),
            ];
            if (uuidPattern.test(input.search)) {
                matches.push(eq(usersTable.id, input.search));
            }
            conditions.push(
                matches.length === 1 ? matches[0]! : or(...matches)!,
            );
        }
        return conditions.length ? and(...conditions) : undefined;
    }

    private async dashboardCounts() {
        const [row] = await this.database
            .select({
                activeUsers: sql<number>`cast(count(*) filter (where ${usersTable.status} = 'active') as integer)`,
                disabledUsers: sql<number>`cast(count(*) filter (where ${usersTable.status} = 'disabled') as integer)`,
                pendingUsers: sql<number>`cast(count(*) filter (where ${usersTable.status} = 'pending') as integer)`,
                users: sql<number>`cast(count(*) as integer)`,
                owners: sql<number>`cast((select count(*) from ${adminMembershipsTable} m join ${usersTable} ou on ou.id = m.user_id where m.revoked_at is null and ou.status = 'active') as integer)`,
            })
            .from(usersTable);
        return (
            row ?? {
                activeUsers: 0,
                disabledUsers: 0,
                owners: 0,
                pendingUsers: 0,
                users: 0,
            }
        );
    }
}

function userSummarySelection() {
    return {
        createdAt: usersTable.createdAt,
        email: userEmailsTable.email,
        id: usersTable.id,
        isOwner: sql<boolean>`${adminMembershipsTable.id} is not null`,
        status: usersTable.status,
        updatedAt: usersTable.updatedAt,
        verifiedAt: userEmailsTable.verifiedAt,
        version: usersTable.version,
    };
}

function mapUserSummary(row: {
    createdAt: Date;
    email: string;
    id: string;
    isOwner: boolean;
    status: 'active' | 'disabled' | 'pending' | 'deletion_pending' | 'purged';
    updatedAt: Date;
    verifiedAt: Date | null;
    version: number;
}) {
    return {
        createdAt: row.createdAt.toISOString(),
        emailVerified: row.verifiedAt !== null,
        id: row.id,
        isOwner: row.isOwner,
        primaryEmail: row.email.toLowerCase(),
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
    };
}

function auditSelection() {
    return {
        action: adminAuditEventsTable.action,
        actorEmail: sql<
            string | null
        >`(select ue.email from ${userEmailsTable} ue where ue.user_id = ${adminAuditEventsTable.actorUserId} and ue.is_primary = true limit 1)`,
        actorUserId: adminAuditEventsTable.actorUserId,
        afterStatus: adminAuditEventsTable.afterStatus,
        afterVersion: adminAuditEventsTable.afterVersion,
        beforeStatus: adminAuditEventsTable.beforeStatus,
        beforeVersion: adminAuditEventsTable.beforeVersion,
        correlationId: adminAuditEventsTable.correlationId,
        expiresAt: adminAuditEventsTable.expiresAt,
        id: adminAuditEventsTable.id,
        metadata: adminAuditEventsTable.metadata,
        occurredAt: adminAuditEventsTable.occurredAt,
        outcome: adminAuditEventsTable.outcome,
        reason: adminAuditEventsTable.reason,
        targetEmail: sql<
            string | null
        >`(select ue.email from ${userEmailsTable} ue where ue.user_id = ${adminAuditEventsTable.targetUserId} and ue.is_primary = true limit 1)`,
        targetUserId: adminAuditEventsTable.targetUserId,
    };
}

function mapAuditEvent(
    row: ReturnType<typeof auditSelection> extends Record<string, never>
        ? never
        : {
              action: AdminAuditEvent['action'];
              actorEmail: string | null;
              actorUserId: string;
              afterStatus: AdminAuditEvent['afterStatus'];
              afterVersion: number | null;
              beforeStatus: AdminAuditEvent['beforeStatus'];
              beforeVersion: number | null;
              correlationId: string;
              expiresAt: Date;
              id: string;
              metadata: Record<string, unknown>;
              occurredAt: Date;
              outcome: AdminAuditEvent['outcome'];
              reason: string | null;
              targetEmail: string | null;
              targetUserId: string | null;
          },
): AdminAuditEvent {
    const { metadata, ...event } = row;
    return {
        ...event,
        actorEmail: row.actorEmail?.toLowerCase() ?? null,
        expiresAt: row.expiresAt.toISOString(),
        occurredAt: row.occurredAt.toISOString(),
        targetEmail: row.targetEmail?.toLowerCase() ?? null,
        targetId:
            typeof metadata.targetId === 'string'
                ? metadata.targetId
                : row.targetUserId,
        targetKind:
            metadata.targetKind === 'dictionary_ai_configuration' ||
            metadata.targetKind === 'ai_credit_account'
                ? metadata.targetKind
                : row.targetUserId
                  ? 'user'
                  : null,
    };
}

function isCreditManageableStatus(status: AdminUserDetail['status']): boolean {
    return status === 'pending' || status === 'active' || status === 'disabled';
}

function aiCreditRejection(
    error: unknown,
): AdminAiCreditMutationRejection | null {
    if (
        error instanceof AiCreditManagementConflictError ||
        error instanceof AiCreditIdempotencyConflictError
    ) {
        return 'account_conflict';
    }
    if (error instanceof AiCreditInsufficientBalanceError) {
        return 'adjustment_exceeds_available';
    }
    if (error instanceof AiCreditInvalidAmountError) return 'invalid_request';
    if (error instanceof AdminAiCreditTargetUnavailableError) {
        return 'target_unavailable';
    }
    if (error instanceof RecentAuthenticationRequiredError) {
        return 'recent_authentication_required';
    }
    if (error instanceof AdminAccessDeniedError) return 'admin_access_denied';
    return null;
}

function auditValues(input: AdminAuditWrite) {
    return {
        action: input.action,
        actorUserId: input.actorUserId,
        afterStatus: input.afterStatus ?? null,
        afterVersion: input.afterVersion ?? null,
        beforeStatus: input.beforeStatus ?? null,
        beforeVersion: input.beforeVersion ?? null,
        correlationId: input.correlationId,
        expiresAt: input.expiresAt,
        id: input.id,
        metadata: input.metadata ?? {},
        occurredAt: input.occurredAt,
        outcome: input.outcome,
        reason: input.reason ?? null,
        targetUserId: input.targetUserId ?? null,
    };
}
