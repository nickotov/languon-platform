import { enableAdmissionPolicyReadCache } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/admission-policy-read-cache';
import { DrizzleCapabilityPolicyParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { adminMembershipsTable } from '../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { aiProviderPriceRevisionsTable as prices } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { aiProviderExpenseRecordsTable as expenses } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { aiCreditActionAttemptsTable as attempts } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { DrizzleActionAccountingParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleAiCreditTransactionParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    reserveConversationActionFixture,
    recordConversationAttemptFixture,
    settleConversationActionFixture,
} from '../support/accounting-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
run('reviewed provider per-request minimum accounting', () => {
    let client: PostgresClient;
    let db: PostgresJsDatabase<typeof databaseSchema>;
    let ownerId: string;
    let providerId: string;
    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
    }, 120000);
    afterAll(async () => {
        await client?.end();
    });
    beforeEach(async () => {
        ownerId = randomUUID();
        providerId = `minimum-${randomUUID()}`;
        await db.insert(usersTable).values({ id: ownerId, status: 'active' });
        await db.transaction((tx) =>
            new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                ownerId,
                amount: 1000n,
                createdAt: new Date(),
                expiresAt: null,
                source: 'admin',
                sourceReference: randomUUID(),
            }),
        );
        await db.insert(prices).values({
            id: randomUUID(),
            providerId,
            modelId: 'synthetic',
            meter: 'text-tokens',
            version: 1,
            effectiveAt: new Date('2020-01-01T00:00:00Z'),
            createdAt: new Date(),
            data: {
                providerId,
                modelId: 'synthetic',
                meter: 'text-tokens',
                inputUsdPerMillionTokens: '0.001',
                outputUsdPerMillionTokens: '0.001',
                cacheReadUsdPerMillionTokens: '0.001',
                cacheWriteUsdPerMillionTokens: '0.001',
                usdPer1000Characters: null,
                minimumUsdPerRequest: '0.000150',
                effectiveAt: '2020-01-01T00:00:00.000Z',
                sourceReference: 'Synthetic minimum fixture',
                sourceUrl: null,
                reason: 'Synthetic reviewed provider minimum',
            },
        });
    });
    async function reserve(maximum = 150n) {
        return db.transaction((tx) =>
            reserveConversationActionFixture(tx, {
                ownerId,
                providerId,
                modelId: 'synthetic',
                maximumMilli: 100n,
                operatorMaximumMicros: maximum,
            }),
        );
    }
    async function admit(actionId: string) {
        return db.transaction((tx) =>
            new DrizzleActionAccountingParticipant(tx).admitAttempt({
                actionId,
                ownerId,
                callId: randomUUID(),
                purpose: 'answer',
                inputTokens: 1,
                maxOutputTokens: 1,
                budget: {
                    inputCostMicrosPerMillionTokens: 1000,
                    outputCostMicrosPerMillionTokens: 1000,
                    maxCostMicrosPerAttempt: 150,
                    maxInputTokensPerAttempt: 10000,
                    maxOutputTokensPerAttempt: 10000,
                },
                executionWitness: { jobId: actionId, leaseToken: actionId },
                at: new Date(),
            }),
        );
    }
    it('keeps admission policy reads transaction scoped and invalidates same-transaction admin publications', async () => {
        await db.insert(adminMembershipsTable).values({
            id: randomUUID(),
            userId: ownerId,
            grantedByUserId: ownerId,
            role: 'owner',
            grantReason: 'Synthetic reviewed local owner',
            grantedAt: new Date(),
            updatedAt: new Date(),
        });
        await db.transaction(async (tx) => {
            enableAdmissionPolicyReadCache(tx);
            const participant = new DrizzleCapabilityPolicyParticipant(tx);
            const before = await participant.settings();
            const currentPolicy = await participant.current('conversation');
            const settings = await participant.publishSettings(
                {
                    expectedVersion: before.version,
                    defaultMaxCreditsPerAction: '2',
                    maxProviderCostUsdPerAction: '1',
                    maxProviderCostUsdPerAccountDay: '10',
                    maxProviderCostUsdPerDay: '100',
                    reason: 'Synthetic cache invalidation verification',
                },
                ownerId,
                new Date(),
            );
            expect(
                (await new DrizzleCapabilityPolicyParticipant(tx).settings())
                    .version,
            ).toBe(settings.version);
            expect(settings.version).toBe(before.version + 1);
            const policy = await participant.publish(
                {
                    capability: 'conversation',
                    expectedVersion: currentPolicy.version,
                    funding: 'operator',
                    reason: 'Synthetic cache invalidation verification',
                },
                ownerId,
                new Date(),
            );
            expect(
                (
                    await new DrizzleCapabilityPolicyParticipant(tx).current(
                        'conversation',
                    )
                ).revisionId,
            ).toBe(policy.revisionId);
            expect(policy.version).toBe(currentPolicy.version + 1);
            await participant.publish(
                {
                    capability: 'conversation',
                    expectedVersion: policy.version,
                    funding: currentPolicy.funding,
                    reason: 'Restore synthetic publication fixture',
                },
                ownerId,
                new Date(),
            );
        });
        expect(
            (
                await db.transaction((tx) =>
                    new DrizzleCapabilityPolicyParticipant(tx).settings(),
                )
            ).defaultMaxCreditsPerAction,
        ).toBe('2');
    });
    it('reserves and settles the minimum rather than adding it to token cost or learner tariffs', async () => {
        const action = await reserve();
        const attempt = await admit(action.id);
        expect(attempt.reservedCostMicros).toBe(150);
        await db.transaction((tx) =>
            recordConversationAttemptFixture(tx, {
                ownerId,
                actionId: action.id,
                callId: attempt.id,
                successful: true,
                usage: { inputTokens: 1, outputTokens: 1 },
            }),
        );
        const [expense] = await db
            .select()
            .from(expenses)
            .where(eq(expenses.attemptId, attempt.id));
        expect(expense?.amountUsdMicros).toBe(150n);
        const settled = await db.transaction((tx) =>
            settleConversationActionFixture(tx, {
                ownerId,
                actionId: action.id,
                outcome: 'success',
            }),
        );
        expect(settled.chargedMilli).toBe(1n);
    });
    it('rejects dispatch if remaining operator authorization cannot fund the floor', async () => {
        const action = await reserve(149n);
        await expect(admit(action.id)).rejects.toThrow();
        expect(
            await db
                .select()
                .from(attempts)
                .where(eq(attempts.actionId, action.id)),
        ).toHaveLength(0);
        const settled = await db.transaction((tx) =>
            settleConversationActionFixture(tx, {
                ownerId,
                actionId: action.id,
                outcome: 'failure',
            }),
        );
        expect(settled.chargedMilli).toBe(0n);
    });
    it('keeps unknown usage and provider expense unknown while retaining the reserved ceiling', async () => {
        const action = await reserve();
        const attempt = await admit(action.id);
        await db.transaction((tx) =>
            recordConversationAttemptFixture(tx, {
                ownerId,
                actionId: action.id,
                callId: attempt.id,
                successful: false,
            }),
        );
        const [expense] = await db
            .select()
            .from(expenses)
            .where(eq(expenses.attemptId, attempt.id));
        expect(expense).toMatchObject({
            amountUsdMicros: null,
            measurement: 'unknown',
            costSource: 'unknown',
        });
        const settled = await db.transaction((tx) =>
            settleConversationActionFixture(tx, {
                ownerId,
                actionId: action.id,
                outcome: 'failure',
            }),
        );
        expect(settled.chargedMilli).toBe(0n);
    });
    it('pins the minimum revision and never rewrites an admitted action when prices change', async () => {
        const action = await reserve();
        const [first] = await db
            .select()
            .from(prices)
            .where(eq(prices.providerId, providerId));
        await db.insert(prices).values({
            ...first!,
            id: randomUUID(),
            version: 2,
            effectiveAt: new Date(),
            createdAt: new Date(),
            data: { ...first!.data, minimumUsdPerRequest: '0.000300' },
        });
        const attempt = await admit(action.id);
        expect(attempt.reservedCostMicros).toBe(150);
        await db.transaction((tx) =>
            recordConversationAttemptFixture(tx, {
                ownerId,
                actionId: action.id,
                callId: attempt.id,
                successful: true,
                usage: { inputTokens: 1, outputTokens: 1 },
            }),
        );
        const [expense] = await db
            .select()
            .from(expenses)
            .where(eq(expenses.attemptId, attempt.id));
        expect(expense?.amountUsdMicros).toBe(150n);
        await db.transaction((tx) =>
            settleConversationActionFixture(tx, {
                ownerId,
                actionId: action.id,
                outcome: 'success',
            }),
        );
    });
});
