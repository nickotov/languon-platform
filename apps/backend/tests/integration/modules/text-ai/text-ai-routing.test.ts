import { adminMembershipsTable } from '../../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { randomUUID } from 'node:crypto';
import { aiProviderPriceRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import {
    TextAiFlowIdSchema,
    type TextAiRoutingConfiguration,
} from '@languon/contracts';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleTextAiRoutingStore } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';
import { textAiRoutingRevisionsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/routing-schema';
import { dictionaryAiConfigurationRevisionsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const at = new Date('2026-10-25T10:00:00Z');
const config: TextAiRoutingConfiguration = {
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
                inputCreditsPerMillionTokens: 0.001,
                outputCreditsPerMillionTokens: 0.003,
            },
        ]),
    ),
};

run('immutable admin routing publication', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let actor: string;
    let store: DrizzleTextAiRoutingStore;
    async function seedPrice(providerId: string, modelId: string) {
        await database.insert(aiProviderPriceRevisionsTable).values({
            id: randomUUID(),
            providerId,
            modelId,
            meter: 'text-tokens',
            version: 1,
            effectiveAt: at,
            createdAt: at,
            createdBy: actor,
            data: {
                providerId,
                modelId,
                meter: 'text-tokens',
                inputUsdPerMillionTokens: '1',
                outputUsdPerMillionTokens: '3',
                cacheReadUsdPerMillionTokens: null,
                cacheWriteUsdPerMillionTokens: null,
                usdPer1000Characters: null,
                effectiveAt: at.toISOString(),
                sourceReference: 'synthetic-routing-provider-price',
                sourceUrl: null,
                reason: 'Synthetic reviewed routing price',
            },
        });
    }

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        actor = randomUUID();
        await database.insert(usersTable).values({
            id: actor,
            status: 'active',
            createdAt: at,
            updatedAt: at,
        });

        await database.insert(adminMembershipsTable).values({
            id: randomUUID(),
            userId: actor,
            grantedByUserId: actor,
            grantReason: 'Synthetic routing test owner',
            role: 'owner',
            grantedAt: at,
            updatedAt: at,
        });

        await seedPrice('deepseek', 'deepseek-flash');
        store = new DrizzleTextAiRoutingStore(database, () => true);
    });

    afterAll(async () => {
        await client?.end();
    });

    it('publishes exact per-flow tariffs without diagnostics and preserves the immutable FK bridge', async () => {
        const revision = await store.publish(
            {
                expectedVersion: 0,
                configuration: config,
                reason: 'Synthetic reviewed routing',
            },
            actor,
            at,
        );

        expect(revision.version).toBe(1);
        expect(
            revision.configuration.flowTariffs['sentence-check']
                ?.inputCreditsPerMillionTokens,
        ).toBe(0.001);

        const [bridge] = await database
            .select()
            .from(dictionaryAiConfigurationRevisionsTable)
            .where(eq(dictionaryAiConfigurationRevisionsTable.id, revision.id));

        expect(bridge?.catalogSnapshot.providerId).toBe('deepseek');
        await expect(
            database
                .update(textAiRoutingRevisionsTable)
                .set({ reason: 'Changed history' })
                .where(eq(textAiRoutingRevisionsTable.id, revision.id)),
        ).rejects.toThrow();

        await expect(
            database
                .delete(textAiRoutingRevisionsTable)
                .where(eq(textAiRoutingRevisionsTable.id, revision.id)),
        ).rejects.toThrow();
    });

    it('serializes concurrent publications without overwriting a newer revision', async () => {
        const results = await Promise.allSettled(
            [1, 2].map(() =>
                store.publish(
                    {
                        expectedVersion: 1,
                        configuration: {
                            ...config,
                            flowTariffs: {
                                ...config.flowTariffs,
                                'sentence-check': {
                                    inputCreditsPerMillionTokens: 0.002,
                                    outputCreditsPerMillionTokens: 0.004,
                                },
                            },
                        },
                        reason: 'Concurrent routing publication',
                    },
                    actor,
                    at,
                ),
            ),
        );

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
        expect((await store.current())?.version).toBe(2);
    });

    it('emergency disables the sole active route without fresh probes and preserves history', async () => {
        const disabled = await store.disable(
            {
                expectedVersion: 2,
                routeId: 'deepseek/deepseek-flash',
                reason: 'Emergency synthetic retirement',
            },
            actor,
            at,
        );

        expect(disabled.configuration.enabledRouteIds).toEqual([]);
        expect(disabled.configuration.default.primaryRouteId).toBe(
            'deepseek/deepseek-flash',
        );

        expect(
            await database.select().from(textAiRoutingRevisionsTable),
        ).toHaveLength(3);

        const [bridge] = await database
            .select()
            .from(dictionaryAiConfigurationRevisionsTable)
            .where(eq(dictionaryAiConfigurationRevisionsTable.id, disabled.id));

        expect(bridge).toBeDefined();
    });

    it('rejects missing paid tariffs, retired routes and unreviewed processing without changing active state', async () => {
        await expect(
            store.publish(
                {
                    expectedVersion: 3,
                    configuration: { ...config, flowTariffs: {} },
                    reason: 'Missing paid rates',
                },
                actor,
                at,
            ),
        ).rejects.toThrow('tariff');

        await expect(
            store.publish(
                {
                    expectedVersion: 3,
                    configuration: {
                        ...config,
                        enabledRouteIds: ['kie/gemini-2.5-pro'],
                    },
                    reason: 'Retired route',
                },
                actor,
                at,
            ),
        ).rejects.toThrow();

        await expect(
            store.publish(
                {
                    expectedVersion: 3,
                    configuration: {
                        ...config,
                        enabledRouteIds: ['evolink/gpt-6-luna'],
                    },
                    reason: 'Unreviewed processing',
                },
                actor,
                at,
            ),
        ).rejects.toThrow('processing');

        expect((await store.current())?.version).toBe(3);
    });

    it('requires credentials and provider prices but switches to a configured model without diagnostic history', async () => {
        const publication = {
            expectedVersion: 3,
            configuration: config,
            reason: 'Synthetic configuration prerequisites',
        };

        await expect(
            new DrizzleTextAiRoutingStore(database, () => false).publish(
                publication,
                actor,
                at,
            ),
        ).rejects.toThrow('credentials');

        const routeId = 'openrouter/openai/gpt-6-luna';
        const switched = {
            ...publication,
            configuration: {
                ...config,
                default: { primaryRouteId: routeId, fallbackRouteIds: [] },
                enabledRouteIds: [routeId],
            },
        };

        await expect(store.publish(switched, actor, at)).rejects.toThrow(
            'pricing',
        );

        expect((await store.current())?.version).toBe(3);

        await seedPrice('openrouter', 'openai/gpt-6-luna');
        const published = await store.publish(switched, actor, at);
        expect(published.version).toBe(4);
        expect(published.configuration.default.primaryRouteId).toBe(routeId);
    });
});
