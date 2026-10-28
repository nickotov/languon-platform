import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { aiProviderPriceRevisionsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { DrizzleActionAccountingParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { reserveConversationActionFixture } from '../support/accounting-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'native reported money provider authority',
    () => {
        let client: PostgresClient;
        let database: ReturnType<
            typeof createDrizzleDatabase<typeof databaseSchema>
        >;
        beforeAll(() => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        });
        afterAll(async () => {
            await client?.end();
        });
        it.each(['deepseek', 'evolink'])(
            'rejects foreign USD/credit fields for %s even from an authorized restricted worker',
            async (providerId) => {
                const ownerId = randomUUID();
                const at = new Date(Date.now() - 1000);
                await database
                    .insert(usersTable)
                    .values({ id: ownerId, status: 'active' });
                await database.insert(aiProviderPriceRevisionsTable).values({
                    id: randomUUID(),
                    providerId,
                    modelId: 'synthetic-native',
                    meter: 'text-tokens',
                    version: 1,
                    effectiveAt: at,
                    createdAt: at,
                    createdBy: ownerId,
                    data: {
                        providerId,
                        modelId: 'synthetic-native',
                        meter: 'text-tokens',
                        inputUsdPerMillionTokens: null,
                        outputUsdPerMillionTokens: null,
                        cacheReadUsdPerMillionTokens: null,
                        cacheWriteUsdPerMillionTokens: null,
                        usdPer1000Characters: null,
                        minimumUsdPerRequest: null,
                        effectiveAt: at.toISOString(),
                        sourceReference: 'synthetic-security',
                        sourceUrl: null,
                        reason: 'Synthetic reviewed native provider pin',
                        nativeRules: {
                            version: 1,
                            validFrom: at.toISOString(),
                            validUntil: null,
                            variants: [
                                {
                                    id: 'base',
                                    applies: {},
                                    components: [
                                        {
                                            meter: 'inputTokens',
                                            pricePerUnit: '1',
                                            unitQuantity: 1000000,
                                            chargeWhen: 'positive-usage',
                                        },
                                        {
                                            meter: 'outputTokens',
                                            pricePerUnit: '1',
                                            unitQuantity: 1000000,
                                            chargeWhen: 'positive-usage',
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                });
                const action = await database.transaction((tx) =>
                    reserveConversationActionFixture(tx, {
                        ownerId,
                        providerId,
                        modelId: 'synthetic-native',
                        maximumMilli: 1000n,
                        operatorMaximumMicros: 100000n,
                        funding: 'operator',
                    }),
                );
                const attempt = await database.transaction((tx) =>
                    new DrizzleActionAccountingParticipant(tx).admitAttempt({
                        actionId: action.id,
                        ownerId,
                        callId: randomUUID(),
                        purpose: 'answer',
                        inputTokens: 100,
                        maxOutputTokens: 100,
                        budget: {
                            maxInputTokensPerAttempt: 100,
                            maxOutputTokensPerAttempt: 100,
                            maxCostMicrosPerAttempt: 100000,
                            inputCostMicrosPerMillionTokens: 0,
                            outputCostMicrosPerMillionTokens: 0,
                        },
                        executionWitness: {
                            jobId: action.id,
                            leaseToken: action.id,
                        },
                        at: new Date(),
                    }),
                );
                const rows =
                    await client`select languon_authorize_native_text_call(${attempt.id}::uuid,100,100) as receipt`;
                const callId = rows[0]!.receipt.callId as string;
                const role = `native058_observer_${randomUUID().replaceAll('-', '')}`;
                // The test role receives only the production observation entry point, never table mutation.
                await client.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
                try {
                    await client.unsafe(
                        `GRANT USAGE ON SCHEMA public TO "${role}"`,
                    );
                    await client.unsafe(
                        `GRANT EXECUTE ON FUNCTION public.languon_observe_native_text_call(uuid,jsonb) TO "${role}"`,
                    );
                    for (const monetaryField of [
                        'providerCostUsd',
                        'providerCreditsConsumed',
                    ]) {
                        await expect(
                            client.begin(async (tx) => {
                                await tx.unsafe(`SET LOCAL ROLE "${role}"`);
                                await tx`select languon_observe_native_text_call(${callId}::uuid,${JSON.stringify({ usage: { requests: 1, inputTokens: 1, outputTokens: 1, [monetaryField]: '0' } })}::jsonb)`;
                            }),
                        ).rejects.toThrow(
                            'Reported monetary evidence is not supported',
                        );
                    }
                    expect(
                        await client`select provider_usage from ai_credit_native_call_dispatches where id=${callId}::uuid`,
                    ).toMatchObject([{ provider_usage: null }]);
                    await client.begin(async (tx) => {
                        await tx.unsafe(`SET LOCAL ROLE "${role}"`);
                        await tx`select languon_observe_native_text_call(${callId}::uuid,${JSON.stringify({ usage: { requests: 1, inputTokens: 1, outputTokens: 1 } })}::jsonb)`;
                    });
                    expect(
                        await client`select provider_usage from ai_credit_native_call_dispatches where id=${callId}::uuid`,
                    ).toMatchObject([
                        {
                            provider_usage: {
                                requests: 1,
                                inputTokens: 1,
                                outputTokens: 1,
                            },
                        },
                    ]);
                } finally {
                    await client.unsafe(`DROP OWNED BY "${role}"`);
                    await client.unsafe(`DROP ROLE "${role}"`);
                }
            },
        );
    },
);
