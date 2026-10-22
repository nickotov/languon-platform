import { textAiModelCatalog } from '../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import {
    DrizzleModelPriceParticipant,
    ModelPriceConflictError,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';
import { modelPriceRevisionsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/model-price-schema';
import { eq } from 'drizzle-orm';
describe.runIf(isDatabaseIntegrationEnabled())(
    'durable model tariff revisions',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        const owner = randomUUID();
        const model = {
            providerId: 'kie',
            modelId: 'elevenlabs/text-to-speech-turbo-2-5',
            meter: 'speech-characters' as const,
        };
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            await db
                .insert(usersTable)
                .values({ id: owner, status: 'active', createdAt: new Date() });
            await db.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: owner,
                role: 'owner',
                grantedByUserId: owner,
                grantReason: 'Disposable tariff test administrator',
            });
        });
        afterAll(async () => {
            await client.end();
        });
        it('serializes competing publications and retains immutable history', async () => {
            const initial = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).current(model),
            );
            const command = {
                ...model,
                expectedVersion: initial.version,
                creditsPer1000Characters: 121,
                minimumCredits: 1,
                inputCreditsPerMillionTokens: null,
                outputCreditsPerMillionTokens: null,
                provisional: false,
                reason: 'Verified tariff test update',
            };
            const results = await Promise.allSettled(
                [1, 2].map(() =>
                    db.transaction((tx) =>
                        new DrizzleModelPriceParticipant(tx).publish(
                            command,
                            owner,
                            new Date(),
                        ),
                    ),
                ),
            );
            expect(
                results.filter((r) => r.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(results.find((r) => r.status === 'rejected')).toMatchObject({
                reason: expect.any(ModelPriceConflictError),
            });
            const next = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).current(model),
            );
            expect(next.rateRevisionId).not.toBe(initial.rateRevisionId);
            expect(next.version).toBe(initial.version + 1);
            const [historical] = await db
                .select()
                .from(modelPriceRevisionsTable)
                .where(
                    eq(modelPriceRevisionsTable.id, initial.rateRevisionId!),
                );
            expect(historical?.rates.creditsPer1000Characters).toBe(
                initial.creditsPer1000Characters,
            );
            await expect(
                db
                    .update(modelPriceRevisionsTable)
                    .set({ reason: 'Alter historical tariff' })
                    .where(
                        eq(
                            modelPriceRevisionsTable.id,
                            initial.rateRevisionId!,
                        ),
                    ),
            ).rejects.toThrow();
            // Restore effective tariff by publishing, never by editing history.
            await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).publish(
                    {
                        ...command,
                        expectedVersion: next.version,
                        creditsPer1000Characters:
                            initial.creditsPer1000Characters!,
                        minimumCredits: initial.minimumCredits!,
                        provisional: initial.provisional,
                        reason: 'Restore initial test tariff',
                    },
                    owner,
                    new Date(),
                ),
            );
        });
        it('persists positive milli-credit speech rates without inventing a minimum fee', async () => {
            const current = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).current(model),
            );
            const published = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).publish(
                    {
                        ...model,
                        expectedVersion: current.version,
                        creditsPer1000Characters: 0.001,
                        minimumCredits: 0,
                        inputCreditsPerMillionTokens: null,
                        outputCreditsPerMillionTokens: null,
                        cachedInputCreditsPerMillionTokens: null,
                        provisional: false,
                        reason: 'Verify fractional speech publication',
                    },
                    owner,
                    new Date(),
                ),
            );
            expect(published.creditsPer1000Characters).toBe(0.001);
            expect(published.minimumCredits).toBe(0);
            const [row] = await db
                .select()
                .from(modelPriceRevisionsTable)
                .where(
                    eq(modelPriceRevisionsTable.id, published.rateRevisionId!),
                );
            expect(row?.rates.creditsPer1000Characters).toBe(0.001);
            expect(row?.rates.minimumCredits).toBe(0);
        });
        it('keeps optional cached customer input rates in immutable JSON revisions', async () => {
            const curated = textAiModelCatalog[0]!;
            const textModel = {
                providerId: curated.providerId,
                modelId: curated.id,
                meter: 'text-tokens' as const,
            };
            const current = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).current(textModel),
            );
            const command = {
                ...textModel,
                expectedVersion: current.version,
                creditsPer1000Characters: null,
                minimumCredits: null,
                inputCreditsPerMillionTokens: 1.125,
                outputCreditsPerMillionTokens: 2,
                cachedInputCreditsPerMillionTokens: 0.125,
                provisional: false,
                reason: 'Verify cached customer rate publication',
            };
            const cached = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).publish(
                    command,
                    owner,
                    new Date(),
                ),
            );
            expect(cached.cachedInputCreditsPerMillionTokens).toBe(0.125);
            expect(cached.inputCreditsPerMillionTokens).toBe(1.125);
            const fallbackCommand = {
                ...command,
                cachedInputCreditsPerMillionTokens: undefined,
            };
            const fallback = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).publish(
                    {
                        ...fallbackCommand,
                        expectedVersion: cached.version,
                        reason: 'Restore ordinary input fallback',
                    },
                    owner,
                    new Date(),
                ),
            );
            expect(fallback.cachedInputCreditsPerMillionTokens).toBeNull();
            const [historical] = await db
                .select()
                .from(modelPriceRevisionsTable)
                .where(eq(modelPriceRevisionsTable.id, cached.rateRevisionId!));
            expect(historical?.rates.cachedInputCreditsPerMillionTokens).toBe(
                0.125,
            );
        });
    },
);
