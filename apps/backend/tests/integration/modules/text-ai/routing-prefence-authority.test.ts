import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { lockTextAiCapacity } from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import {
    prepareAdminTextAiRouting,
    resolveAdminTextAiRouting,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/routing-admission';
import {
    DrizzleProviderPriceStore,
    pinProviderPrice,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { DrizzleTextAiRoutingStore } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';
import { TextAiRoutingUnavailableError } from '../../../../src/modules/text-ai/domain/text-ai-routing';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import { fixtureRouteFingerprint } from '../../../support/text-ai-routing-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'pre-fence routing price preparation authority',
    () => {
        let client: PostgresClient;
        let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
        beforeAll(() => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            await seedLegacyActionFixture(db);
        }, 120000);
        afterAll(async () => client?.end());
        const input = (now: Date) => ({
            format: 'conversation:v1',
            now,
            credentialConfigured: () => true,
            routeFingerprint: fixtureRouteFingerprint,
        });
        async function publishPrice(effectiveAt: Date) {
            const price = await db.transaction((tx) =>
                pinProviderPrice(tx, {
                    providerId: 'deepseek',
                    modelId: 'deepseek-flash',
                    meter: 'text-tokens',
                    at: new Date(),
                }),
            );
            if (!price) throw new Error('Missing synthetic provider price');
            const {
                id: _id,
                version,
                createdAt: _createdAt,
                createdBy: _createdBy,
                ...fields
            } = price;
            const [authority] =
                await client`select created_by as actor from text_ai_routing_revisions order by version desc limit 1`;
            return new DrizzleProviderPriceStore(db).publish(
                {
                    ...fields,
                    expectedVersion: version,
                    effectiveAt: effectiveAt.toISOString(),
                    reason: 'Synthetic concurrent numerical price publication',
                },
                String(authority!.actor),
                new Date(),
            );
        }
        it('takes no advisory route fence during preparation and rejects a route disabled before capacity admission', async () => {
            const store = new DrizzleTextAiRoutingStore(
                db,
                async () => {},
                () => true,
            );
            const current = (await store.current())!;
            const [authority] =
                await client`select created_by as actor from text_ai_routing_revisions where id=${current.id}`;
            await db.transaction(async (tx) => {
                await prepareAdminTextAiRouting(tx, input(new Date()));
                const locks = await tx.execute(
                    sql`select count(*)::integer as count from pg_locks where pid=pg_backend_pid() and locktype='advisory'`,
                );
                expect(locks[0]?.count).toBe(0);
                await store.disable(
                    {
                        expectedVersion: current.version,
                        routeId: 'deepseek/deepseek-flash',
                        reason: 'Synthetic pre-fence emergency disable',
                    },
                    String(authority!.actor),
                    new Date(),
                );
                await lockTextAiCapacity(tx);
                await expect(
                    resolveAdminTextAiRouting(tx, input(new Date())),
                ).rejects.toBeInstanceOf(TextAiRoutingUnavailableError);
            });
        });
        it('resolves a scheduled rate that became effective while preparation waited for admission', async () => {
            const before = new Date();
            const effective = new Date(before.getTime() + 1000);
            const published = await publishPrice(effective);
            await db.transaction(async (tx) => {
                await prepareAdminTextAiRouting(tx, input(before));
                await lockTextAiCapacity(tx);
                const result = await resolveAdminTextAiRouting(
                    tx,
                    input(new Date(effective.getTime() + 1)),
                );
                expect(
                    result?.snapshot.routingAuthority?.candidates[0]
                        ?.providerPrice.id,
                ).toBe(published.id);
            });
        });
        it('resolves a newly published effective rate instead of its prepared older numerical pin', async () => {
            await db.transaction(async (tx) => {
                const at = new Date();
                await prepareAdminTextAiRouting(tx, input(at));
                const published = await publishPrice(at);
                await lockTextAiCapacity(tx);
                const result = await resolveAdminTextAiRouting(
                    tx,
                    input(new Date()),
                );
                expect(
                    result?.snapshot.routingAuthority?.candidates[0]
                        ?.providerPrice.id,
                ).toBe(published.id);
            });
        });
    },
);
