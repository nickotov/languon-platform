import { createTextAiRouteFingerprint } from '../../src/infrastructure/text-ai/route-fingerprint';
import { adminMembershipsTable } from '../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { randomUUID } from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
    TextAiFlowIdSchema,
    type TextAiFlowId,
    type TextAiFlowTariffSchema,
} from '@languon/contracts';
import { textAiProbeIdentity } from '../../src/modules/text-ai/infrastructure/ai/text-ai-probe-identity';
import { textAiProbesTable } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/probe-schema';
import { pinProviderPrice } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import type { z } from 'zod';
import type { databaseSchema } from '../../src/infrastructure/database/schema';
import { usersTable } from '../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleTextAiRoutingStore } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';

/** Test-only synthetic routing. Callers must already own disposable infrastructure.
 * Never imported from application code or local setup commands. Existing explicit
 * policy is preserved, including deliberately missing/disabled route cases. */
export async function seedTextAiRoutingFixture(
    database: PostgresJsDatabase<typeof databaseSchema>,
    options: {
        routeId?: string;
        enabledRouteIds?: string[];
        tariff?: z.infer<typeof TextAiFlowTariffSchema>;
        at?: Date;
        replace?: boolean;
        /** Refresh only deterministic evidence for the current release; preserve published policy. */
        refreshProbes?: boolean;
        omittedTariffFlows?: TextAiFlowId[];
    } = {},
) {
    const store = new DrizzleTextAiRoutingStore(
        database,
        async () => {},
        () => true,
    );
    const current = await store.current();
    if (current && !options.replace && !options.refreshProbes) return current;
    const at = options.at ?? new Date();
    const actorId = randomUUID();
    await database.insert(usersTable).values({
        id: actorId,
        status: 'active',
        createdAt: at,
        updatedAt: at,
    });
    await database.insert(adminMembershipsTable).values({
        id: randomUUID(),
        userId: actorId,
        grantedByUserId: actorId,
        role: 'owner',
        grantReason: 'Synthetic disposable routing fixture owner',
        grantedAt: at,
        updatedAt: at,
    });
    const routeId =
        options.routeId ??
        (!options.replace
            ? current?.configuration.default.primaryRouteId
            : undefined) ??
        'deepseek/deepseek-flash';
    const tariff = options.tariff ?? {
        inputCreditsPerMillionTokens: 1000,
        outputCreditsPerMillionTokens: 3000,
        cachedInputCreditsPerMillionTokens: 1000,
    };
    const revision =
        current && !options.replace
            ? current
            : await store.publish(
                  {
                      expectedVersion: current?.version ?? 0,
                      configuration: {
                          default: {
                              primaryRouteId: routeId,
                              fallbackRouteIds: [],
                          },
                          overrides: {},
                          enabledRouteIds: options.enabledRouteIds ?? [routeId],
                          flowTariffs: Object.fromEntries(
                              TextAiFlowIdSchema.options
                                  .filter(
                                      (flow) =>
                                          !options.omittedTariffFlows?.includes(
                                              flow,
                                          ),
                                  )
                                  .map((flow) => [flow, tariff]),
                          ),
                      },
                      reason: 'Synthetic disposable deterministic routing fixture',
                  },
                  actorId,
                  at,
              );
    await database.transaction(async (tx) => {
        for (const flowId of TextAiFlowIdSchema.options) {
            const identity = textAiProbeIdentity(
                { routeId, flowId, kind: 'flow' },
                textAiFixtureCredentials,
            );
            const price = await pinProviderPrice(tx, {
                providerId: identity.providerId,
                modelId: identity.modelId,
                meter: 'text-tokens',
                at,
            });
            if (!price)
                throw new Error(
                    'Seed synthetic accounting/provider prices before text AI routing fixtures.',
                );
            await tx.insert(textAiProbesTable).values({
                id: randomUUID(),
                actorId,
                ...identity,
                fingerprint: fixtureRouteFingerprint(routeId, flowId)!,
                kind: 'flow',
                flowId,
                state: 'passed',
                failure: null,
                day: at.toISOString().slice(0, 10),
                maximumMicros: 10000n,
                costMicros: 1n,
                price,
                evidenceHours: 24,
                inputTokens: 1,
                outputTokens: 1,
                measurement: 'measured',
                elapsedMs: 1,
                startedAt: at,
                completedAt: at,
                evidenceExpiresAt: new Date(at.getTime() + 86400000),
            });
        }
    });
    return revision;
}

export const textAiFixtureCredentials = {
    DEEPSEEK_API_KEY: 'synthetic-test-key',
    KIE_API_KEY: 'synthetic-test-key',
    EVOLINK_API_KEY: 'synthetic-test-key',
    OPENROUTER_API_KEY: 'synthetic-test-key',
};
export const fixtureRouteFingerprint = createTextAiRouteFingerprint(
    textAiFixtureCredentials,
);
