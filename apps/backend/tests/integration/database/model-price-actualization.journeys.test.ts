// @user-flow-revision model-price-actualization sha256:c0b6266ee2dfaeb1
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import type { AdminMcpPermission, ProviderPrice } from '@languon/contracts';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import {
    usersTable,
    userEmailsTable,
} from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { AdminMcpCredentialService } from '../../../src/modules/admin-mcp/application/admin-mcp-credential-service';
import { AdminMcpAdministrationService } from '../../../src/modules/admin-mcp/application/admin-mcp-administration-service';
import { AdminMcpPriceActualizationService } from '../../../src/modules/admin-mcp/application/admin-mcp-price-actualization-service';
import { adminMcpActionsByPermission } from '../../../src/modules/admin-mcp/domain/admin-mcp';
import { DrizzleAdminMcpStore } from '../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/drizzle-admin-mcp-store';
import { adminMcpPreviewsTable } from '../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/schema';
import { AdminMcpOperations } from '../../../src/modules/admin-mcp/infrastructure/operations/admin-mcp-operations';
import { AdminMcpAdministrationAdapter } from '../../../src/modules/admin-mcp/infrastructure/admin-mcp-administration-adapter';
import {
    createAdminMcpServer,
    type AdminMcpServerDependencies,
} from '../../../src/modules/admin-mcp/interface/http/admin-mcp-server';
import {
    DrizzleProviderPriceStore,
    pinProviderPrice,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { aiProviderPriceRevisionsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { DrizzleAccountingStore } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-accounting-store';
import { DrizzleAiCreditTransactionParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleTextAiRoutingStore } from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';
import { createProviderPriceSources } from '../../../src/modules/ai-credits/infrastructure/pricing/provider-price-sources';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

interface RpcResult {
    result?: {
        content?: Array<{ text: string }>;
        tools?: Array<{ name: string }>;
        isError?: boolean;
    };
    error?: unknown;
}
interface RefreshResult {
    applied: boolean;
    totalModels: number;
    nextOffset: number | null;
    results: Array<{
        target: { providerId: string; modelId: string; meter: string };
        status: string;
        preview?: { id: string };
    }>;
}

describe.runIf(isDatabaseIntegrationEnabled())(
    'model price actualization through persisted HTTP MCP',
    () => {
        let client: PostgresClient;
        let database: PostgresJsDatabase<typeof databaseSchema>;
        const servers: ReturnType<typeof serve>[] = [];
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            database = createDrizzleDatabase(client, databaseSchema);
        }, 120_000);
        afterAll(async () => {
            await Promise.all(
                servers.map(
                    (server) =>
                        new Promise<void>((resolve, reject) =>
                            server.close((error) =>
                                error ? reject(error) : resolve(),
                            ),
                        ),
                ),
            );
            await client?.end();
        });

        async function fixture(targetCount = 1) {
            const ownerId = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
            await database.insert(userEmailsTable).values({
                id: randomUUID(),
                userId: ownerId,
                email: `pricing-${ownerId}@example.test`,
                canonicalEmail: `pricing-${ownerId}@example.test`,
                isPrimary: true,
                verifiedAt: new Date(),
            });
            await database.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: ownerId,
                role: 'owner',
                grantedByUserId: ownerId,
                grantReason: 'Synthetic price journey owner',
            });
            const store = new DrizzleAdminMcpStore(database);
            const credentials = new AdminMcpCredentialService(store);
            const legacyCredentials = new AdminMcpCredentialService(
                store,
                () => new Date(),
                {
                    ...adminMcpActionsByPermission,
                    'provider-prices.write': ['provider-prices.write'],
                },
            );
            const issue = async (
                permissions: AdminMcpPermission[] = ['provider-prices.write'],
                legacy = false,
            ) =>
                (legacy ? legacyCredentials : credentials).issue(ownerId, {
                    name: 'Synthetic pricing journey client',
                    expiresInDays: 1,
                    permissions,
                    limits: {},
                    reason: 'Verify safe automatic model price publication',
                });
            const issued = await issue();
            // A new exact model ID proves the provider adapter has no duplicate model list.
            const targets = Array.from({ length: targetCount }, () => ({
                providerId: 'openrouter',
                modelId: `future/model-${randomUUID()}`,
                meter: 'text-tokens' as const,
            }));
            const target = targets[0]!;
            const prices = new DrizzleProviderPriceStore(database);
            const operations = new AdminMcpOperations(database, {
                routing: new DrizzleTextAiRoutingStore(database, async () => {
                    throw new Error('Unused route check');
                }),
                providerPrices: prices,
                accounting: new DrizzleAccountingStore(
                    database,
                    (tx) => new DrizzleAiCreditTransactionParticipant(tx),
                ),
            });
            const adapter = new AdminMcpAdministrationAdapter(
                database,
                operations,
            );
            const administration = new AdminMcpAdministrationService(adapter);
            let requests = 0;
            const pricing = { prompt: '0.000000065', completion: '0.00000026' };
            const fetchPricing: typeof fetch = async (input, init) => {
                requests++;
                const url = new URL(String(input));
                expect(url.origin).toBe('https://openrouter.ai');
                expect(init?.redirect).toBe('error');
                if (url.pathname === '/api/v1/models')
                    return Response.json({
                        data: targets.map((item) => ({
                            id: item.modelId,
                            pricing,
                            architecture: {
                                input_modalities: ['text'],
                                output_modalities: ['text'],
                            },
                        })),
                    });
                const model = targets.find(
                    (item) =>
                        url.pathname ===
                        `/api/v1/models/${item.modelId}/endpoints`,
                );
                expect(
                    model,
                    'unexpected upstream pricing request',
                ).toBeDefined();
                return Response.json({
                    data: { id: model!.modelId, endpoints: [{ pricing }] },
                });
            };
            const sources = createProviderPriceSources({ fetch: fetchPricing });
            // Bind a real loopback HTTP server; only upstream pricing metadata is synthetic.
            let port = 0;
            const app = createAdminMcpServer({
                credentials,
                administration,
                checks: {} as AdminMcpServerDependencies['checks'],
                get port() {
                    return port;
                },
                actualizePrices: (actor, input, secret, signal) =>
                    new AdminMcpPriceActualizationService({
                        sources,
                        targets: async () => targets,
                        prices: () => prices.list(),
                        administration,
                        audit: adapter,
                        reauthenticate: () => credentials.authenticate(secret),
                    }).actualize(actor, input, signal),
            });
            const server = serve({
                fetch: app.fetch,
                hostname: '127.0.0.1',
                port: 0,
            });
            servers.push(server);
            if (!server.listening) await once(server, 'listening');
            port = (server.address() as AddressInfo).port;
            const rpc = async (
                secret: string,
                method: string,
                params: unknown = {},
            ) => {
                const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${secret}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/json, text/event-stream',
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: randomUUID(),
                        method,
                        params,
                    }),
                });
                const body = await response.text();
                // MCP may return an SSE message for streamed tool calls even when
                // the handler requests JSON. Parse the actual transport envelope.
                const event = body
                    .split('\n')
                    .find((line) => line.startsWith('data: '));
                return {
                    status: response.status,
                    body: JSON.parse(
                        event ? event.slice(6) : body,
                    ) as RpcResult,
                };
            };
            const call = async <T>(
                name: string,
                args: unknown,
                secret = issued.secret,
            ) => {
                const response = await rpc(secret, 'tools/call', {
                    name,
                    arguments: args,
                });
                const text = response.body.result?.content?.[0]?.text;
                return {
                    status: response.status,
                    isError:
                        response.body.result?.isError === true ||
                        response.body.error !== undefined,
                    value: text ? (JSON.parse(text) as T) : undefined,
                };
            };
            const refresh = (offset?: number) =>
                call<RefreshResult>('actualize_model_prices', {
                    reason: 'Fetch reviewed official provider rates',
                    ...(offset === undefined ? {} : { offset }),
                });
            const apply = (previewId: string, operationKey = randomUUID()) =>
                call<ProviderPrice>('admin_apply', { previewId, operationKey });
            return {
                ownerId,
                credentials,
                issued,
                issue,
                target,
                targets,
                prices,
                rpc,
                call,
                refresh,
                apply,
                get requests() {
                    return requests;
                },
            };
        }

        // @user-flow model-price-actualization/official-price-preview-and-idempotent-publication
        it('publishes fetched prices once through HTTP previews while preserving historical pinned rates', async () => {
            const f = await fixture();
            const oldAt = new Date(Date.now() - 60_000);
            const original = await f.prices.publish(
                {
                    ...f.target,
                    expectedVersion: 0,
                    inputUsdPerMillionTokens: '1',
                    outputUsdPerMillionTokens: '2',
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: null,
                    minimumUsdPerRequest: null,
                    effectiveAt: oldAt.toISOString(),
                    sourceReference: 'synthetic-initial-rate',
                    sourceUrl: 'https://openrouter.ai/api/v1/models',
                    reason: 'Establish immutable pre-refresh rate',
                },
                f.ownerId,
                oldAt,
            );
            const pinned = await database.transaction((tx) =>
                pinProviderPrice(tx, { ...f.target, at: oldAt }),
            );
            const snapshot = JSON.stringify(pinned);
            expect(pinned?.id).toBe(original.id);
            expect(pinned?.inputUsdPerMillionTokens).toBe('1');
            const tools = await f.rpc(f.issued.secret, 'tools/list');
            expect(tools.body.result?.tools?.map((t) => t.name)).toContain(
                'actualize_model_prices',
            );
            const first = await f.refresh();
            expect(first.isError).toBe(false);
            expect(first.value).toMatchObject({
                applied: false,
                results: [{ status: 'preview' }],
            });
            const firstId = first.value!.results[0]!.preview!.id;
            const staleId = (await f.refresh()).value!.results[0]!.preview!.id;
            expect(
                (await f.prices.list()).find(
                    (p) => p.modelId === f.target.modelId,
                )?.version,
            ).toBe(1);
            const operationKey = randomUUID();
            const applied = await f.apply(firstId, operationKey);
            expect(applied.isError).toBe(false);
            expect(applied.value).toMatchObject({
                version: 2,
                inputUsdPerMillionTokens: '0.065',
                outputUsdPerMillionTokens: '0.26',
            });
            expect((await f.apply(firstId, operationKey)).value).toEqual(
                applied.value,
            );
            const rows = await database
                .select()
                .from(aiProviderPriceRevisionsTable)
                .where(
                    and(
                        eq(
                            aiProviderPriceRevisionsTable.providerId,
                            f.target.providerId,
                        ),
                        eq(
                            aiProviderPriceRevisionsTable.modelId,
                            f.target.modelId,
                        ),
                    ),
                );
            expect(rows).toHaveLength(2);
            expect(
                rows.find((row) => row.id === original.id)?.data
                    .inputUsdPerMillionTokens,
            ).toBe('1');
            expect(JSON.stringify(pinned)).toBe(snapshot);
            const latest = await database.transaction((tx) =>
                pinProviderPrice(tx, { ...f.target, at: new Date() }),
            );
            expect(latest?.inputUsdPerMillionTokens).toBe('0.065');
            const stale = await f.apply(staleId);
            expect(stale.isError).toBe(true);
            const unchanged = await f.refresh();
            expect(unchanged.value).toMatchObject({
                applied: false,
                results: [{ status: 'unchanged' }],
            });
            const events = await f.credentials.audit(f.ownerId, {
                page: 1,
                pageSize: 100,
            });
            expect(
                events.events.some(
                    (event) =>
                        event.action === 'provider-prices.actualize' &&
                        event.outcome === 'success',
                ),
            ).toBe(true);
            expect(
                events.events.some(
                    (event) =>
                        event.action === 'provider-prices.write' &&
                        event.outcome === 'success',
                ),
            ).toBe(true);
        });

        // @user-flow model-price-actualization/bounded-discovery-across-growing-catalogs
        it('returns every configured model exactly once across bounded discovery pages', async () => {
            const f = await fixture(51);
            const first = await f.refresh();
            expect(first.isError).toBe(false);
            expect(first.value).toMatchObject({
                applied: false,
                totalModels: 51,
                nextOffset: 50,
            });
            expect(first.value!.results).toHaveLength(50);
            expect(
                first.value!.results.every((item) => item.status === 'preview'),
            ).toBe(true);
            const second = await f.refresh(first.value!.nextOffset!);
            expect(second.isError).toBe(false);
            expect(second.value).toMatchObject({
                applied: false,
                totalModels: 51,
                nextOffset: null,
            });
            expect(second.value!.results).toHaveLength(1);
            expect(second.value!.results[0]!.status).toBe('preview');
            const ids = [...first.value!.results, ...second.value!.results].map(
                (item) => item.target.modelId,
            );
            expect(new Set(ids).size).toBe(51);
            expect(ids).toEqual(f.targets.map((item) => item.modelId));
            const rows = await database
                .select()
                .from(adminMcpPreviewsTable)
                .where(eq(adminMcpPreviewsTable.tokenId, f.issued.token.id));
            expect(rows).toHaveLength(51);
            const published = (await f.prices.list()).filter((price) =>
                f.targets.some((item) => item.modelId === price.modelId),
            );
            expect(published).toHaveLength(0);
        }, 20_000);

        it('does not expand existing or read-only credentials and rejects revoked tokens before fetching', async () => {
            const f = await fixture();
            for (const token of [
                await f.issue(['provider-prices.write'], true),
                await f.issue(['providers.read']),
            ]) {
                const tools = await f.rpc(token.secret, 'tools/list');
                expect(
                    tools.body.result?.tools?.map((t) => t.name),
                ).not.toContain('actualize_model_prices');
                expect(
                    (
                        await f.call(
                            'actualize_model_prices',
                            { reason: 'Denied fetch attempt' },
                            token.secret,
                        )
                    ).isError,
                ).toBe(true);
            }
            expect(f.requests).toBe(0);
            const first = await f.refresh();
            expect(first.value?.results[0]?.status).toBe('preview');
            const before = f.requests;
            await f.credentials.revoke(
                f.ownerId,
                f.issued.token.id,
                'Contain synthetic pricing token',
            );
            expect((await f.refresh()).status).toBe(401);
            expect(
                (await f.apply(first.value!.results[0]!.preview!.id)).status,
            ).toBe(401);
            expect(f.requests).toBe(before);
            expect(
                (await f.prices.list()).filter(
                    (p) => p.modelId === f.target.modelId,
                ),
            ).toHaveLength(0);
        });

        it('keeps expired previews and scheduled revisions from changing effective prices', async () => {
            const f = await fixture();
            const first = await f.refresh();
            const id = first.value!.results[0]!.preview!.id;
            const createdAt = new Date(Date.now() - 600_000);
            await database
                .update(adminMcpPreviewsTable)
                .set({
                    createdAt,
                    expiresAt: new Date(createdAt.getTime() + 300_000),
                })
                .where(eq(adminMcpPreviewsTable.id, id));
            expect((await f.apply(id)).isError).toBe(true);
            expect(
                (await f.prices.list()).filter(
                    (p) => p.modelId === f.target.modelId,
                ),
            ).toHaveLength(0);
            await f.prices.publish(
                {
                    ...f.target,
                    expectedVersion: 0,
                    inputUsdPerMillionTokens: '3',
                    outputUsdPerMillionTokens: '4',
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: null,
                    effectiveAt: new Date(Date.now() + 3_600_000).toISOString(),
                    sourceReference: 'synthetic-scheduled-rate',
                    sourceUrl: 'https://openrouter.ai/api/v1/models',
                    reason: 'Preserve an explicitly scheduled rate',
                },
                f.ownerId,
                new Date(),
            );
            expect((await f.refresh()).value).toMatchObject({
                applied: false,
                results: [{ status: 'skipped' }],
            });
            expect(
                (await f.prices.list()).find(
                    (p) => p.modelId === f.target.modelId,
                ),
            ).toMatchObject({ version: 1, inputUsdPerMillionTokens: '3' });
        });
    },
);
