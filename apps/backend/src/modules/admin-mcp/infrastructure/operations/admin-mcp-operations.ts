import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AccountingStore } from '../../../ai-credits/application/accounting-store';
import { DrizzleAiCreditTransactionParticipant } from '../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleCapabilityPolicyParticipant } from '../../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { DrizzleModelPriceParticipant } from '../../../ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';
import type { DrizzleProviderPriceStore } from '../../../ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { formatFixed, parseFixed } from '../../../ai-credits/domain/accounting';
import {
    userEmailsTable,
    usersTable,
} from '../../../users/infrastructure/persistence/drizzle/schema';
import {
    currentTextAiRouting,
    type DrizzleTextAiRoutingStore,
} from '../../../text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';
import {
    readUserActionBudget,
    updateUserActionBudget,
} from '../../../text-ai/infrastructure/persistence/drizzle/text-ai-budget-participant';
import {
    adminMcpWriteSchemas,
    adminMcpReadSchemas,
    reportRange,
    type AdminMcpReadOperation,
    type AdminMcpWriteOperation,
} from '../../application/operation-schemas';
import {
    AdminMcpError,
    requirePermission,
    permissionForWrite,
    requireAction,
    type AdminMcpActor,
    type AdminMcpPreview,
} from '../../domain/admin-mcp';
import { AdminMcpQuotaStore } from '../persistence/drizzle/admin-mcp-quota-store';
import {
    audit,
    type AdminMcpDatabase,
    type AdminMcpTransaction,
} from '../persistence/drizzle/admin-mcp-persistence';
import { userFinancialReport } from './user-financial-report';
import { rethrowOperationConflict } from './operation-conflicts';
import {
    assertCreditBounds,
    assertSpendingBounds,
    assertUserBudgetBounds,
} from './operation-bounds';

export interface AdminMcpOperationDependencies {
    routing: DrizzleTextAiRoutingStore;
    providerPrices: DrizzleProviderPriceStore;
    accounting: AccountingStore;
}

/** Typed business adapters; the transport owns credential verification and preview receipts. */
export class AdminMcpOperations {
    private readonly quotas: AdminMcpQuotaStore;
    constructor(
        private readonly database: AdminMcpDatabase,
        private readonly dependencies: AdminMcpOperationDependencies,
    ) {
        this.quotas = new AdminMcpQuotaStore(database);
    }

    async read(
        actor: AdminMcpActor,
        name: AdminMcpReadOperation,
        raw: unknown,
    ): Promise<unknown> {
        requireAction(actor, name);
        requirePermission(
            actor,
            name.startsWith('users.')
                ? 'users.read'
                : name.startsWith('financial-reports.')
                  ? 'financial-reports.read'
                  : 'providers.read',
        );
        switch (name) {
            case 'users.lookup': {
                const { email } = adminMcpReadSchemas[name].parse(raw);
                const [user] = await this.database
                    .select({
                        id: usersTable.id,
                        email: userEmailsTable.canonicalEmail,
                        status: usersTable.status,
                    })
                    .from(userEmailsTable)
                    .innerJoin(
                        usersTable,
                        eq(usersTable.id, userEmailsTable.userId),
                    )
                    .where(
                        eq(
                            userEmailsTable.canonicalEmail,
                            email.trim().toLowerCase(),
                        ),
                    )
                    .limit(1);
                return { user: user ?? null };
            }
            case 'users.credits': {
                const input = adminMcpReadSchemas[name].parse(raw);
                return this.database.transaction(
                    async (tx) => {
                        await requireTarget(tx, input.userId);
                        const credits =
                            new DrizzleAiCreditTransactionParticipant(tx);
                        const summary = await credits.accountSummary(
                            input.userId,
                            new Date(),
                        );
                        const history = await credits.history({
                            ownerId: input.userId,
                            page: input.page,
                            pageSize: input.pageSize,
                        });
                        return {
                            account: serializeSummary(summary),
                            actionBudget: await readUserActionBudget(
                                tx,
                                input.userId,
                            ),
                            history: history.entries.map((entry) => ({
                                id: entry.id,
                                kind: entry.kind,
                                amountCredits: formatFixed(entry.amount, 3),
                                source: entry.grantSource,
                                measurement: entry.measurement,
                                occurredAt: entry.createdAt.toISOString(),
                                expiresAt:
                                    entry.expiresAt?.toISOString() ?? null,
                            })),
                            total: history.total,
                            page: input.page,
                            pageSize: input.pageSize,
                        };
                    },
                    { accessMode: 'read only' },
                );
            }
            case 'financial-reports.global': {
                const range = reportRange(adminMcpReadSchemas[name].parse(raw));
                const report = await this.dependencies.accounting.report(
                    range.from,
                    range.to,
                );
                return {
                    ...report,
                    periodNote:
                        range.to.getTime() > Date.now()
                            ? 'Current UTC day is partial; totals include records available at the update timestamp.'
                            : null,
                };
            }
            case 'financial-reports.user': {
                const input = adminMcpReadSchemas[name].parse(raw);
                const report = await userFinancialReport(this.database, input);
                const balance = await this.database.transaction(async (tx) =>
                    serializeSummary(
                        await new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).accountSummary(input.userId, new Date()),
                    ),
                );
                return { ...report, currentAccount: balance };
            }
            case 'providers.inspect': {
                adminMcpReadSchemas[name].parse(raw);
                const [
                    catalog,
                    routing,
                    providerPrices,
                    settings,
                    customerTariffs,
                ] = await Promise.all([
                    this.dependencies.routing.catalog(),
                    this.dependencies.routing.current(),
                    this.dependencies.providerPrices.list(),
                    this.database.transaction((tx) =>
                        new DrizzleCapabilityPolicyParticipant(tx).settings(),
                    ),
                    this.database.transaction((tx) =>
                        new DrizzleModelPriceParticipant(tx).listPublished(),
                    ),
                ]);
                return {
                    catalog,
                    routing,
                    providerPrices,
                    settings,
                    customerTariffs,
                };
            }
        }
    }

    async preview(
        tx: AdminMcpTransaction,
        actor: AdminMcpActor,
        name: AdminMcpWriteOperation,
        raw: unknown,
    ) {
        requireAction(actor, name);
        requirePermission(actor, permissionForWrite(name));
        const proposed = adminMcpWriteSchemas[name].parse(raw);
        let current: unknown;
        let target: string;
        switch (name) {
            case 'routing.write':
                current = (await currentTextAiRouting(tx)) ?? {
                    version: 0,
                    published: false,
                };
                target = 'text-ai-routing';
                break;
            case 'customer-tariffs.write': {
                const input = adminMcpWriteSchemas[name].parse(raw);
                if ('flowId' in input) {
                    const routing = await currentTextAiRouting(tx);
                    if (!routing)
                        throw new AdminMcpError(
                            'not_found',
                            'Publish routing before modifying a flow tariff.',
                        );
                    current = {
                        version: routing.version,
                        tariff:
                            routing.configuration.flowTariffs[input.flowId] ??
                            null,
                    };
                    target = `flow-tariff:${input.flowId}`;
                    break;
                }
                current = (await new DrizzleModelPriceParticipant(
                    tx,
                ).currentPublished(input)) ?? { version: 0, published: false };
                target = `customer-tariff:${input.providerId}/${input.modelId}`;
                break;
            }
            case 'provider-prices.write':
            case 'provider-prices.native-write': {
                const input = adminMcpWriteSchemas[name].parse(raw);
                current = (
                    await this.dependencies.providerPrices.listInTransaction(tx)
                ).find(
                    (price) =>
                        price.providerId === input.providerId &&
                        price.modelId === input.modelId &&
                        price.meter === input.meter,
                ) ?? { version: 0, published: false };
                target = `provider-price:${input.providerId}/${input.modelId}/${input.meter}`;
                break;
            }
            case 'spending-limits.write': {
                const input = adminMcpWriteSchemas[name].parse(raw);
                if ('targetUserId' in input) {
                    assertUserBudgetBounds(actor, input.maxCreditsPerAction);
                    await requireTarget(tx, input.targetUserId, true);
                    current = await readUserActionBudget(
                        tx,
                        input.targetUserId,
                    );
                    target = `user-action-budget:${input.targetUserId}`;
                    break;
                }
                assertSpendingBounds(actor, input);
                current = await new DrizzleCapabilityPolicyParticipant(
                    tx,
                ).settings();
                target = 'ai-accounting-settings';
                break;
            }
            case 'credits.grant':
            case 'credits.revoke': {
                const input = adminMcpWriteSchemas[name].parse(raw);
                await requireTarget(tx, input.targetUserId);
                current = serializeSummary(
                    await new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).accountSummary(input.targetUserId, new Date()),
                );
                target = input.targetUserId;
                assertCreditBounds(actor, name, input.amountCredits);
                break;
            }
        }
        const version =
            current && typeof current === 'object'
                ? 'managementVersion' in current
                    ? current.managementVersion
                    : 'version' in current
                      ? current.version
                      : 0
                : 0;
        if (version !== proposed.expectedVersion)
            throw new AdminMcpError(
                'stale_preview',
                'The target version changed. Read the current state and preview again.',
            );
        return {
            operation: name,
            target,
            current,
            proposed,
            expectedVersion: String(version),
            reason: proposed.reason,
        };
    }

    async apply(
        tx: AdminMcpTransaction,
        actor: AdminMcpActor,
        preview: AdminMcpPreview,
    ): Promise<unknown> {
        try {
            return await this.applyMutation(tx, actor, preview);
        } catch (error) {
            return rethrowOperationConflict(error);
        }
    }

    private async applyMutation(
        tx: AdminMcpTransaction,
        actor: AdminMcpActor,
        preview: AdminMcpPreview,
    ): Promise<unknown> {
        if (!(preview.operation in adminMcpWriteSchemas))
            throw new AdminMcpError(
                'permission_denied',
                'Unsupported mutation.',
            );
        const name = preview.operation as AdminMcpWriteOperation;
        requireAction(actor, name);
        requirePermission(actor, permissionForWrite(name));
        const correlationId = randomUUID();
        const at = new Date();
        switch (name) {
            case 'routing.write':
                return this.dependencies.routing.publishInTransaction(
                    tx,
                    adminMcpWriteSchemas[name].parse(preview.proposed),
                    actor.userId,
                    at,
                    correlationId,
                );
            case 'customer-tariffs.write': {
                const input = adminMcpWriteSchemas[name].parse(
                    preview.proposed,
                );
                if ('flowId' in input) {
                    const routing = await currentTextAiRouting(tx);
                    if (!routing || routing.version !== input.expectedVersion)
                        throw new AdminMcpError(
                            'stale_preview',
                            'Routing changed. Preview the tariff against its latest revision.',
                        );
                    return this.dependencies.routing.publishInTransaction(
                        tx,
                        {
                            expectedVersion: input.expectedVersion,
                            reason: input.reason,
                            configuration: {
                                ...routing.configuration,
                                flowTariffs: {
                                    ...routing.configuration.flowTariffs,
                                    [input.flowId]: input.tariff,
                                },
                            },
                        },
                        actor.userId,
                        at,
                        correlationId,
                    );
                }
                return new DrizzleModelPriceParticipant(tx).publish(
                    input,
                    actor.userId,
                    at,
                    correlationId,
                    { initializeMissing: false },
                );
            }
            case 'provider-prices.write':
            case 'provider-prices.native-write':
                return this.dependencies.providerPrices.publishInTransaction(
                    tx,
                    adminMcpWriteSchemas[name].parse(preview.proposed),
                    actor.userId,
                    at,
                );
            case 'spending-limits.write': {
                const input = adminMcpWriteSchemas[name].parse(
                    preview.proposed,
                );
                if ('targetUserId' in input) {
                    assertUserBudgetBounds(actor, input.maxCreditsPerAction);
                    await requireTarget(tx, input.targetUserId, true);
                    const result = await updateUserActionBudget(
                        tx,
                        {
                            userId: input.targetUserId,
                            expectedVersion: input.expectedVersion,
                            maxCreditsPerAction: input.maxCreditsPerAction,
                        },
                        at,
                    );
                    await audit(
                        tx,
                        actor,
                        name,
                        input.targetUserId,
                        input.reason,
                        at,
                        {
                            beforeVersion: input.expectedVersion,
                            afterVersion: result.version,
                            maxCreditsPerAction: result.maxCreditsPerAction,
                        },
                    );
                    return result;
                }
                assertSpendingBounds(actor, input);
                return new DrizzleCapabilityPolicyParticipant(
                    tx,
                ).publishSettings(input, actor.userId, at, correlationId);
            }
            case 'credits.grant':
            case 'credits.revoke': {
                const input = adminMcpWriteSchemas[name].parse(
                    preview.proposed,
                );
                assertCreditBounds(actor, name, input.amountCredits);
                await requireTarget(tx, input.targetUserId, true);
                const quota = await this.quotas.reserveInTransaction(
                    tx,
                    actor,
                    preview.id,
                    input,
                    name === 'credits.grant' ? 'credit-grant' : 'credit-revoke',
                    input.amountCredits,
                    at,
                );
                const credits = new DrizzleAiCreditTransactionParticipant(tx);
                await credits.adjustByAdmin({
                    amount:
                        parseFixed(input.amountCredits, 3) *
                        (name === 'credits.revoke' ? -1n : 1n),
                    at,
                    expectedManagementVersion: input.expectedVersion,
                    expiresAt: input.expiresAt
                        ? new Date(input.expiresAt)
                        : null,
                    ownerId: input.targetUserId,
                    reason: input.reason,
                    sourceReference: `admin-mcp:${actor.tokenId}:${preview.id}`,
                });
                await this.quotas.settleInTransaction(
                    tx,
                    quota.id,
                    input.amountCredits,
                    at,
                );
                await audit(
                    tx,
                    actor,
                    name,
                    input.targetUserId,
                    input.reason,
                    at,
                    {
                        expectedVersion: input.expectedVersion,
                        amountCredits: input.amountCredits,
                    },
                );
                return serializeSummary(
                    await credits.accountSummary(input.targetUserId, at),
                );
            }
        }
    }
}

async function requireTarget(
    tx: AdminMcpTransaction,
    userId: string,
    lock = false,
) {
    const query = tx
        .select({ id: usersTable.id, status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
    const [user] = lock ? await query.for('share') : await query;
    if (!user || !['active', 'pending', 'disabled'].includes(user.status))
        throw new AdminMcpError(
            'not_found',
            'Credit account target is unavailable.',
        );
}
function serializeSummary(
    summary: Awaited<
        ReturnType<DrizzleAiCreditTransactionParticipant['accountSummary']>
    >,
) {
    return {
        availableCredits: formatFixed(summary.availableCredits, 3),
        reservedCredits: formatFixed(summary.reservedCredits, 3),
        consumedCredits: formatFixed(summary.consumedCredits, 3),
        managementVersion: summary.managementVersion,
        policy: {
            ...summary.policy,
            unlimitedUntil:
                summary.policy.unlimitedUntil?.toISOString() ?? null,
        },
        nextExpirationAt: summary.nextExpirationAt?.toISOString() ?? null,
    };
}

export {
    assertCreditBounds,
    assertSpendingBounds,
    assertUserBudgetBounds,
} from './operation-bounds';
