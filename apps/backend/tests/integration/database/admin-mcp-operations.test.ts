import { randomUUID } from 'node:crypto';
import {
    TextAiFlowIdSchema,
    type TextAiRoutingConfiguration,
} from '@languon/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import {
    usersTable,
    userEmailsTable,
} from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { AdminMcpCredentialService } from '../../../src/modules/admin-mcp/application/admin-mcp-credential-service';
import { DrizzleAdminMcpStore } from '../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/drizzle-admin-mcp-store';
import { AdminMcpPreviewStore } from '../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/admin-mcp-preview-store';
import { AdminMcpOperations } from '../../../src/modules/admin-mcp/infrastructure/operations/admin-mcp-operations';
import { AdminMcpAdministrationService } from '../../../src/modules/admin-mcp/application/admin-mcp-administration-service';
import { AdminMcpAdministrationAdapter } from '../../../src/modules/admin-mcp/infrastructure/admin-mcp-administration-adapter';
import { AdminMcpCheckBudget } from '../../../src/modules/admin-mcp/infrastructure/admin-mcp-check-budget';
import { TextAiProbeUnavailableError } from '../../../src/modules/text-ai/application/ports/text-ai-probe-store';
import { purgeAdminMcpForOwner } from '../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/admin-mcp-deletion-participant';
import { DrizzleCapabilityPolicyParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { DrizzleProviderPriceStore } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { DrizzleAccountingStore } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-accounting-store';
import { DrizzleAiCreditTransactionParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleTextAiRoutingStore } from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';
import { textAiPreferencesTable } from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/schema';
import {
    textAiRoutingRevisionsTable,
    textAiRoutingStateTable,
} from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/routing-schema';
import {
    adminMcpWriteSchemas,
    type AdminMcpWriteOperation,
} from '../../../src/modules/admin-mcp/application/operation-schemas';
import type { AdminMcpActor } from '../../../src/modules/admin-mcp/domain/admin-mcp';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
    getTestDatabaseUrl,
} from '../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'delegated business operations with real ledger participants',
    () => {
        let client: PostgresClient;
        let database: PostgresJsDatabase<typeof databaseSchema>;
        let operations: AdminMcpOperations;
        let administration: AdminMcpAdministrationService;
        let previews: AdminMcpPreviewStore;
        let actor: AdminMcpActor;
        let targetUserId: string;
        beforeAll(() => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            operations = new AdminMcpOperations(database, {
                routing: new DrizzleTextAiRoutingStore(database, async () => {
                    throw new Error('Readiness check required');
                }),
                providerPrices: new DrizzleProviderPriceStore(database),
                accounting: new DrizzleAccountingStore(
                    database,
                    (tx) => new DrizzleAiCreditTransactionParticipant(tx),
                ),
            });
            previews = new AdminMcpPreviewStore(database);
            administration = new AdminMcpAdministrationService(
                new AdminMcpAdministrationAdapter(database, operations),
            );
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const ownerId = randomUUID();
            targetUserId = randomUUID();
            await database.insert(usersTable).values([
                { id: ownerId, status: 'active' },
                { id: targetUserId, status: 'active' },
            ]);
            await database.insert(userEmailsTable).values({
                id: randomUUID(),
                userId: ownerId,
                email: 'owner@example.test',
                canonicalEmail: 'owner@example.test',
                verifiedAt: new Date(),
            });
            await database.insert(userEmailsTable).values({
                id: randomUUID(),
                userId: targetUserId,
                email: 'learner@example.test',
                canonicalEmail: 'learner@example.test',
            });
            await database.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: ownerId,
                role: 'owner',
                grantedByUserId: ownerId,
                grantReason: 'Synthetic MCP owner',
            });
            const credentials = new AdminMcpCredentialService(
                new DrizzleAdminMcpStore(database),
            );
            const issued = await credentials.issue(ownerId, {
                name: 'Synthetic operation client',
                expiresInDays: 1,
                permissions: [
                    'users.read',
                    'financial-reports.read',
                    'credits.grant',
                    'credits.revoke',
                    'spending-limits.write',
                    'provider-prices.write',
                    'customer-tariffs.write',
                    'model-checks.run',
                    'providers.read',
                ],
                limits: {
                    modelChecks: {
                        perCheckUsd: '0.05',
                        perDayUsd: '0.5',
                        concurrency: 1,
                    },
                    creditGrants: { perOperation: '10', perDay: '10' },
                    creditRevocations: { perOperation: '10', perDay: '10' },
                    spendingLimits: {
                        maximumCreditsPerAction: '10',
                        maximumProviderUsdPerAction: '0.1',
                        maximumProviderUsdPerAccountDay: '1',
                        maximumProviderUsdGloballyDay: '5',
                    },
                },
                reason: 'Synthetic operation integration',
            });
            actor = await credentials.authenticate(issued.secret);
        }, 60_000);
        afterAll(async () => {
            await client.end();
        });
        async function preview(name: AdminMcpWriteOperation, input: unknown) {
            return administration.preview(actor, name, input);
        }
        async function apply(id: string, key = randomUUID()) {
            return administration.apply(actor, {
                previewId: id,
                operationKey: key,
            });
        }
        it('resolves exact email and settles a grant once across retries, without creating purchase revenue', async () => {
            const lookup = await operations.read(actor, 'users.lookup', {
                email: 'LEARNER@example.test',
            });
            expect(lookup).toMatchObject({ user: { id: targetUserId } });
            const item = await preview('credits.grant', {
                targetUserId,
                expectedVersion: 0,
                amountCredits: '2.145',
                expiresAt: null,
                reason: 'Synthetic grant integration',
            });
            const key = randomUUID();
            const first = await apply(item.id, key);
            expect(await apply(item.id, key)).toEqual(first);
            expect(first).toMatchObject({
                availableCredits: '2.145',
                managementVersion: 1,
            });
            const rows = await database.execute(
                sql`select count(*)::int as count from ai_credit_grants where owner_id=${targetUserId}::uuid`,
            );
            expect(rows[0]?.count).toBe(1);
            const report = await operations.read(
                actor,
                'financial-reports.user',
                {
                    userId: targetUserId,
                    from: new Date(Date.now() - 3600000).toISOString(),
                    to: new Date(Date.now() + 3600000).toISOString(),
                },
            );
            expect(report).toMatchObject({
                cash: { paymentsUsd: '0.000000' },
                credits: { granted: '2.145' },
                usage: { allocatedPurchaseValueUsd: '0.000000' },
                currentAccount: { availableCredits: '2.145' },
            });
            const defaultReport = await operations.read(
                actor,
                'financial-reports.user',
                { userId: targetUserId },
            );
            expect(defaultReport).toMatchObject({
                credits: { granted: '2.145' },
                periodNote: expect.stringContaining(
                    'Current UTC day is partial',
                ),
            });
        });
        it('rolls back quota, receipt and wallet together on excessive revocation; permits a corrected preview', async () => {
            const grant = await preview('credits.grant', {
                targetUserId,
                expectedVersion: 0,
                amountCredits: '1',
                expiresAt: null,
                reason: 'Synthetic grant integration',
            });
            await apply(grant.id);
            const revoke = await preview('credits.revoke', {
                targetUserId,
                expectedVersion: 1,
                amountCredits: '2',
                expiresAt: null,
                reason: 'Synthetic invalid revocation',
            });
            await expect(apply(revoke.id)).rejects.toThrow();
            const reservations = await database.execute(
                sql`select count(*)::int as count from admin_mcp_reservations where kind='credit-revoke'`,
            );
            expect(reservations[0]?.count).toBe(0);
            const corrected = await preview('credits.revoke', {
                targetUserId,
                expectedVersion: 1,
                amountCredits: '0.320',
                expiresAt: null,
                reason: 'Synthetic corrected revocation',
            });
            expect(await apply(corrected.id)).toMatchObject({
                availableCredits: '0.680',
                managementVersion: 2,
            });
        });
        it('rejects stale credit edits rather than overwriting a newer ledger change', async () => {
            const input = {
                targetUserId,
                expectedVersion: 0,
                amountCredits: '1',
                expiresAt: null,
                reason: 'Synthetic stale grant',
            };
            const first = await preview('credits.grant', input);
            const stale = await preview('credits.grant', input);
            await apply(first.id);
            await expect(apply(stale.id)).rejects.toMatchObject({
                code: 'stale_preview',
            });
            const account = await operations.read(actor, 'users.credits', {
                userId: targetUserId,
            });
            expect(account).toMatchObject({
                account: { availableCredits: '1.000' },
            });
        });
        it('bounds user action budgets while preserving other existing AI preferences and checking their version', async () => {
            await database.insert(textAiPreferencesTable).values({
                userId: targetUserId,
                mode: 'explicit',
                modelId: 'deepseek-flash',
                version: 4,
                maxCreditsPerAction: '2',
            });
            const input = {
                targetUserId,
                expectedVersion: 4,
                maxCreditsPerAction: '3.145',
                reason: 'Synthetic learner budget',
            };
            expect(
                adminMcpWriteSchemas['spending-limits.write'].safeParse(input)
                    .success,
            ).toBe(true);
            const item = await preview('spending-limits.write', input);
            const stale = await preview('spending-limits.write', input);
            await apply(item.id);
            await expect(apply(stale.id)).rejects.toMatchObject({
                code: 'stale_preview',
            });
            const [saved] = await database
                .select()
                .from(textAiPreferencesTable)
                .where(eq(textAiPreferencesTable.userId, targetUserId));
            expect(saved).toMatchObject({
                mode: 'explicit',
                modelId: 'deepseek-flash',
                version: 5,
                maxCreditsPerAction: '3.145',
            });
            await expect(
                preview('spending-limits.write', {
                    ...input,
                    expectedVersion: 5,
                    maxCreditsPerAction: '10.001',
                }),
            ).rejects.toThrow('delegated finite ceiling');
        });
        it('changes only an authoritative flow tariff without granting route authority or implicitly running checks', async () => {
            const configuration: TextAiRoutingConfiguration = {
                default: {
                    primaryRouteId: 'deepseek/deepseek-flash',
                    fallbackRouteIds: [],
                },
                overrides: {},
                enabledRouteIds: ['deepseek/deepseek-flash'],
                flowTariffs: Object.fromEntries(
                    TextAiFlowIdSchema.options.map((flow) => [
                        flow,
                        {
                            inputCreditsPerMillionTokens: 20,
                            outputCreditsPerMillionTokens: 60,
                        },
                    ]),
                ),
            };
            const id = randomUUID();
            await database.insert(textAiRoutingRevisionsTable).values({
                id,
                version: 1,
                configuration,
                createdBy: actor.userId,
                createdAt: new Date(),
                reason: 'Synthetic existing routing',
            });
            await database.insert(textAiRoutingStateTable).values({
                id: 'global',
                activeRevisionId: id,
                updatedAt: new Date(),
            });
            const item = await preview('customer-tariffs.write', {
                flowId: 'card-authoring',
                expectedVersion: 1,
                tariff: {
                    inputCreditsPerMillionTokens: 30,
                    outputCreditsPerMillionTokens: 90,
                },
                reason: 'Synthetic flow tariff change',
            });
            const result = await apply(item.id);
            expect(result).toMatchObject({
                version: 2,
                configuration: {
                    default: configuration.default,
                    enabledRouteIds: configuration.enabledRouteIds,
                    flowTariffs: {
                        'card-authoring': {
                            inputCreditsPerMillionTokens: 30,
                            outputCreditsPerMillionTokens: 90,
                        },
                        conversation: configuration.flowTariffs.conversation,
                    },
                },
            });
            expect(actor.permissions).not.toContain('routing.write');
        });
        it('fails closed when shared operator settings are missing or exhausted and creates no learner wallet', async () => {
            const budget = new AdminMcpCheckBudget(database);
            await expect(
                budget.effectiveMaximum(actor, 50_000n),
            ).rejects.toThrow('must be configured');
            await expect(
                budget.reserve(actor, randomUUID(), {}, '0.01'),
            ).rejects.toThrow('must be configured');
            await database.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).publishSettings(
                    {
                        expectedVersion: 0,
                        defaultMaxCreditsPerAction: '10',
                        maxProviderCostUsdPerAction: '0.05',
                        maxProviderCostUsdPerAccountDay: '0.05',
                        maxProviderCostUsdPerDay: '0.05',
                        reason: 'Synthetic shared operator budget',
                    },
                    actor.userId,
                    new Date(),
                ),
            );
            const first = await budget.reserve(actor, randomUUID(), {}, '0.04');
            expect(await budget.effectiveMaximum(actor, 10_000n)).toBe(10_000n);
            expect(await budget.effectiveMaximum(actor, 100_000n)).toBe(
                50_000n,
            );
            expect(
                await budget.effectiveMaximum(
                    {
                        ...actor,
                        limits: {
                            ...actor.limits,
                            modelChecks: {
                                perCheckUsd: '0.02',
                                perDayUsd: '0.5',
                                concurrency: 1,
                            },
                        },
                    },
                    100_000n,
                ),
            ).toBe(20_000n);
            await budget.settle(actor, first.id, '0.04', { state: 'passed' });
            await expect(
                budget.reserve(actor, randomUUID(), {}, '0.02'),
            ).rejects.toThrow();
            const reservations = await database.execute(
                sql`select count(*)::int as count from admin_mcp_reservations`,
            );
            expect(reservations[0]?.count).toBe(1);
            const wallets = await database.execute(
                sql`select count(*)::int as count from ai_credit_accounts`,
            );
            expect(wallets[0]?.count).toBe(0);
        });
        it('authorizes dispatch once, rejects revoked authority and settles incurred cost after revocation', async () => {
            await database.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).publishSettings(
                    {
                        expectedVersion: 0,
                        defaultMaxCreditsPerAction: '10',
                        maxProviderCostUsdPerAction: '0.05',
                        maxProviderCostUsdPerAccountDay: '1',
                        maxProviderCostUsdPerDay: '5',
                        reason: 'Synthetic shared operator budget',
                    },
                    actor.userId,
                    new Date(),
                ),
            );
            const budget = new AdminMcpCheckBudget(database);
            const reservation = await budget.reserve(
                actor,
                randomUUID(),
                {},
                '0.01',
            );
            await budget.authorizeDispatch(actor, reservation.id);
            await expect(
                budget.authorizeDispatch(actor, reservation.id),
            ).rejects.toThrow('cannot be dispatched again');
            await new AdminMcpCredentialService(
                new DrizzleAdminMcpStore(database),
            ).revoke(
                actor.userId,
                actor.tokenId,
                'Synthetic client revocation',
            );
            await expect(
                budget.authorizeDispatch(actor, reservation.id),
            ).rejects.toThrow('inactive credential');
            await budget.settle(actor, reservation.id, '0.005', {
                state: 'passed',
            });
            const [operator] = await database.execute(
                sql`select consumed_micros::text as amount from ai_operator_action_budgets where action_id=${reservation.id}::uuid`,
            );
            expect(operator?.amount).toBe('5000');
            const [quota] = await database.execute(
                sql`select settled_units::text as amount from admin_mcp_reservations where id=${reservation.id}::uuid`,
            );
            expect(quota?.amount).toBe('5000');
        });
        it('settles retained operator expense after private MCP credentials are erased without recreating them', async () => {
            await database.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).publishSettings(
                    {
                        expectedVersion: 0,
                        defaultMaxCreditsPerAction: '10',
                        maxProviderCostUsdPerAction: '0.05',
                        maxProviderCostUsdPerAccountDay: '1',
                        maxProviderCostUsdPerDay: '5',
                        reason: 'Synthetic shared operator budget',
                    },
                    actor.userId,
                    new Date(),
                ),
            );
            const budget = new AdminMcpCheckBudget(database);
            const reservation = await budget.reserve(
                actor,
                randomUUID(),
                {},
                '0.01',
            );
            await budget.authorizeDispatch(actor, reservation.id);
            await database.transaction((tx) =>
                purgeAdminMcpForOwner(tx, actor.userId, new Date()),
            );
            await budget.settle(actor, reservation.id, '0.005', {
                state: 'passed',
            });
            const [operator] = await database.execute(
                sql`select consumed_micros::text as amount from ai_operator_action_budgets where action_id=${reservation.id}::uuid`,
            );
            expect(operator?.amount).toBe('5000');
            const [privateRows] = await database.execute(
                sql`select count(*) as count from admin_mcp_reservations`,
            );
            expect(Number(privateRows?.count)).toBe(0);
        });
        it('inspects empty billing configuration and wallets without seeding or changing financial rows', async () => {
            const inspection = await operations.read(
                actor,
                'providers.inspect',
                {},
            );
            expect(inspection).toMatchObject({ customerTariffs: [] });
            await operations.read(actor, 'users.credits', {
                userId: targetUserId,
            });
            const [counts] = await database.execute(
                sql`select (select count(*) from model_price_revisions)::int as tariffs,(select count(*) from dictionary_ai_configuration_revisions)::int as configuration,(select count(*) from ai_credit_accounts)::int as accounts,(select count(*) from ai_credit_grants)::int as grants,(select count(*) from ai_credit_history)::int as history`,
            );
            expect(counts).toEqual({
                tariffs: 0,
                configuration: 0,
                accounts: 0,
                grants: 0,
                history: 0,
            });
        });
        it('previews a missing curated tariff without bootstrap and publishes its initial revision only on apply', async () => {
            const input = {
                providerId: 'deepseek',
                modelId: 'deepseek-flash',
                meter: 'text-tokens',
                expectedVersion: 0,
                creditsPer1000Characters: null,
                minimumCredits: null,
                inputCreditsPerMillionTokens: 20,
                outputCreditsPerMillionTokens: 60,
                cachedInputCreditsPerMillionTokens: null,
                provisional: false,
                reason: 'Synthetic initial customer tariff',
            };
            const item = await preview('customer-tariffs.write', input);
            const stale = await preview('customer-tariffs.write', input);
            const [before] = await database.execute(
                sql`select count(*)::int as count from model_price_revisions`,
            );
            expect(before?.count).toBe(0);
            expect(item.current).toEqual({ version: 0, published: false });
            const result = await apply(item.id);
            expect(result).toMatchObject({
                version: 1,
                inputCreditsPerMillionTokens: 20,
                outputCreditsPerMillionTokens: 60,
            });
            const [after] = await database.execute(
                sql`select count(*)::int as count from model_price_revisions`,
            );
            expect(after?.count).toBe(1);
            await expect(apply(stale.id)).rejects.toMatchObject({
                code: 'stale_preview',
            });
        });
        it('returns an explicit check-required prerequisite when routing is published without flow evidence', async () => {
            const credentials = new AdminMcpCredentialService(
                new DrizzleAdminMcpStore(database),
            );
            const issued = await credentials.issue(actor.userId, {
                name: 'Synthetic routing publisher',
                expiresInDays: 1,
                permissions: ['routing.write'],
                limits: {},
                reason: 'Synthetic check prerequisite regression',
            });
            const publisher = await credentials.authenticate(issued.secret);
            const guarded = new AdminMcpOperations(database, {
                routing: new DrizzleTextAiRoutingStore(database, async () => {
                    throw new TextAiProbeUnavailableError(
                        'probe_check_required',
                    );
                }),
                providerPrices: new DrizzleProviderPriceStore(database),
                accounting: new DrizzleAccountingStore(
                    database,
                    (tx) => new DrizzleAiCreditTransactionParticipant(tx),
                ),
            });
            const configuration: TextAiRoutingConfiguration = {
                default: {
                    primaryRouteId: 'deepseek/deepseek-flash',
                    fallbackRouteIds: [],
                },
                overrides: {},
                enabledRouteIds: ['deepseek/deepseek-flash'],
                flowTariffs: Object.fromEntries(
                    TextAiFlowIdSchema.options.map((flow) => [
                        flow,
                        {
                            inputCreditsPerMillionTokens: 20,
                            outputCreditsPerMillionTokens: 60,
                        },
                    ]),
                ),
            };
            const input = await database.transaction((tx) =>
                guarded.preview(tx, publisher, 'routing.write', {
                    expectedVersion: 0,
                    configuration,
                    reason: 'Synthetic routing publication',
                }),
            );
            const item = await previews.create(publisher, input);
            await expect(
                previews.executePreview(
                    publisher,
                    item.id,
                    randomUUID(),
                    (tx, saved) => guarded.apply(tx, publisher, saved),
                ),
            ).rejects.toMatchObject({
                code: 'check_required',
                message: expect.stringContaining(
                    'explicit successful matching flow check',
                ),
            });
            const [counts] = await database.execute(
                sql`select (select count(*) from text_ai_probes)::int as probes,(select count(*) from ai_provider_expense_records)::int as expenses`,
            );
            expect(counts).toEqual({ probes: 0, expenses: 0 });
        });
        it('completes two simultaneous previews with only two database connections', async () => {
            const credentials = new AdminMcpCredentialService(
                new DrizzleAdminMcpStore(database),
            );
            const issued = await credentials.issue(actor.userId, {
                name: 'Synthetic two-connection pool',
                expiresInDays: 1,
                permissions: ['routing.write', 'provider-prices.write'],
                limits: {},
                reason: 'Synthetic limited-pool regression',
            });
            const limitedActor = await credentials.authenticate(issued.secret);
            const limitedClient = createPostgresClient({
                databaseUrl: getTestDatabaseUrl(),
                maxConnections: 2,
            });
            const limitedDb = createDrizzleDatabase(
                limitedClient,
                databaseSchema,
            );
            const limitedOperations = new AdminMcpOperations(limitedDb, {
                routing: new DrizzleTextAiRoutingStore(limitedDb, async () => {
                    throw new Error('Checks must not run');
                }),
                providerPrices: new DrizzleProviderPriceStore(limitedDb),
                accounting: new DrizzleAccountingStore(
                    limitedDb,
                    (tx) => new DrizzleAiCreditTransactionParticipant(tx),
                ),
            });
            const configuration = {
                default: {
                    primaryRouteId: 'deepseek/deepseek-flash',
                    fallbackRouteIds: [],
                },
                overrides: {},
                enabledRouteIds: ['deepseek/deepseek-flash'],
                flowTariffs: {},
            };
            let ready = 0;
            let release!: () => void;
            const bothOccupied = new Promise<void>((resolve) => {
                release = resolve;
            });
            const work = (name: AdminMcpWriteOperation, input: unknown) =>
                limitedDb.transaction(async (tx) => {
                    await tx.execute(sql`select 1`);
                    if (++ready === 2) release();
                    await bothOccupied;
                    return limitedOperations.preview(
                        tx,
                        limitedActor,
                        name,
                        input,
                    );
                });
            let timeout: ReturnType<typeof setTimeout> | undefined;
            try {
                const results = await Promise.race([
                    Promise.all([
                        work('routing.write', {
                            expectedVersion: 0,
                            configuration,
                            reason: 'Synthetic routing preview',
                        }),
                        work('provider-prices.write', {
                            expectedVersion: 0,
                            providerId: 'deepseek',
                            modelId: 'deepseek-flash',
                            meter: 'text-tokens',
                            inputUsdPerMillionTokens: '0.3',
                            outputUsdPerMillionTokens: '1.2',
                            cacheReadUsdPerMillionTokens: null,
                            cacheWriteUsdPerMillionTokens: null,
                            usdPer1000Characters: null,
                            effectiveAt: new Date().toISOString(),
                            sourceReference: 'synthetic-test',
                            sourceUrl: null,
                            reason: 'Synthetic provider price preview',
                        }),
                    ]),
                    new Promise<never>((_, reject) => {
                        timeout = setTimeout(
                            () =>
                                reject(
                                    new Error(
                                        'Two-connection preview pool starved',
                                    ),
                                ),
                            3000,
                        );
                    }),
                ]);
                expect(results).toHaveLength(2);
            } finally {
                if (timeout) clearTimeout(timeout);
                await limitedClient.end({ timeout: 1 });
            }
        });
    },
);
