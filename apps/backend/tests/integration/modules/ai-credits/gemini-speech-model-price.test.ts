import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, eq } from 'drizzle-orm';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { DrizzleModelPriceParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';
import { modelPriceRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/model-price-schema';
import { KIE_GEMINI_MODEL } from '../../../../src/modules/speech/domain/speech-models';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Gemini speech model tariff catalog',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        const owner = randomUUID();
        const model = {
            providerId: 'kie',
            modelId: KIE_GEMINI_MODEL,
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
                grantReason: 'Disposable Gemini tariff test administrator',
            });
        });

        afterAll(async () => {
            await client.end();
        });

        it('lists, lazily seeds, and retains immutable Gemini tariff revisions', async () => {
            expect(
                await db
                    .select()
                    .from(modelPriceRevisionsTable)
                    .where(
                        and(
                            eq(modelPriceRevisionsTable.providerId, 'kie'),
                            eq(
                                modelPriceRevisionsTable.modelId,
                                KIE_GEMINI_MODEL,
                            ),
                        ),
                    ),
            ).toHaveLength(0);

            const listed = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).list(),
            );
            const initial = listed.find(
                (price) =>
                    price.providerId === model.providerId &&
                    price.modelId === model.modelId &&
                    price.meter === model.meter,
            );
            expect(initial).toMatchObject({
                version: 1,
                creditsPer1000Characters: 100,
                minimumCredits: 1,
                provisional: true,
            });

            const current = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).current(model),
            );
            expect(current.rateRevisionId).toBe(initial?.rateRevisionId);

            const published = await db.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).publish(
                    {
                        ...model,
                        expectedVersion: current.version,
                        creditsPer1000Characters: 125,
                        minimumCredits: 2,
                        inputCreditsPerMillionTokens: null,
                        outputCreditsPerMillionTokens: null,
                        provisional: false,
                        reason: 'Verified disposable Gemini tariff',
                    },
                    owner,
                    new Date(),
                ),
            );
            expect(published).toMatchObject({
                version: 2,
                creditsPer1000Characters: 125,
                minimumCredits: 2,
                provisional: false,
            });

            const [historical] = await db
                .select()
                .from(modelPriceRevisionsTable)
                .where(
                    eq(modelPriceRevisionsTable.id, current.rateRevisionId!),
                );
            expect(historical?.rates).toMatchObject({
                creditsPer1000Characters: 100,
                minimumCredits: 1,
                provisional: true,
            });
        });
    },
);
