import { createPostgresClient } from '@languon/database';
import { drizzle } from 'drizzle-orm/postgres-js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { seedLegacyActionFixture } from './legacy-action-fixture';
import { modelPriceRevisionsTable as customerPrices } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/model-price-schema';
import { aiProviderPriceRevisionsTable as providerPrices } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { formatCreditMilli } from '../../src/modules/ai-credits/domain/exact-credit-amount';
import { databaseSchema } from '../../src/infrastructure/database/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';

/** Public test CLI seam: the web journey never imports backend application internals. */
async function main() {
    const input = z
        .object({
            optIn: z.literal('true'),
            applicationEnvironment: z.literal('test'),
            databaseUrl: z.url(),
            ownerId: z.uuid(),
            action: z.enum(['setup', 'setup-provider', 'grant', 'summary']),
        })
        .parse({
            optIn: process.env.SPEECH_E2E_CREDIT_FIXTURES,
            applicationEnvironment: process.env.APP_ENV,
            databaseUrl: process.env.AUTH_E2E_DATABASE_URL,
            ownerId: process.env.SPEECH_E2E_ACTOR_ID,
            action: process.env.SPEECH_E2E_CREDIT_ACTION,
        });
    const url = new URL(input.databaseUrl);
    if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        !url.port ||
        url.port === '5432' ||
        !/(^|_)(test|e2e)($|_)/.test(url.pathname.slice(1))
    ) {
        throw new Error(
            'Speech credit fixtures require a disposable loopback E2E database.',
        );
    }
    const sql = createPostgresClient({
        databaseUrl: url.href,
        maxConnections: 1,
    });
    try {
        const database = drizzle(sql, { schema: databaseSchema });
        if (input.action === 'setup' || input.action === 'setup-provider') {
            if (input.action === 'setup')
                await seedLegacyActionFixture(database);
            const at = new Date('2026-01-01T00:00:00.000Z');
            const [customer] = await database
                .select()
                .from(customerPrices)
                .where(
                    and(
                        eq(customerPrices.providerId, 'fixture'),
                        eq(customerPrices.modelId, 'tone-v1'),
                    ),
                )
                .orderBy(desc(customerPrices.version))
                .limit(1);
            if (customer?.rates.minimumCredits !== 0.125)
                await database.insert(customerPrices).values({
                    id: randomUUID(),
                    providerId: 'fixture',
                    modelId: 'tone-v1',
                    meter: 'speech-characters',
                    version: (customer?.version ?? 0) + 1,
                    createdAt: at,
                    reason: 'Synthetic decimal pronunciation price',
                    rates: {
                        creditsPer1000Characters: 0.001,
                        minimumCredits: 0.125,
                        inputCreditsPerMillionTokens: null,
                        outputCreditsPerMillionTokens: null,
                        cachedInputCreditsPerMillionTokens: null,
                        provisional: true,
                    },
                });
            const [provider] = await database
                .select()
                .from(providerPrices)
                .where(
                    and(
                        eq(providerPrices.providerId, 'fixture'),
                        eq(providerPrices.modelId, 'tone-v1'),
                        eq(providerPrices.meter, 'speech-characters'),
                    ),
                )
                .orderBy(desc(providerPrices.version))
                .limit(1);
            if (!provider)
                await database.insert(providerPrices).values({
                    id: randomUUID(),
                    providerId: 'fixture',
                    modelId: 'tone-v1',
                    meter: 'speech-characters',
                    version: 1,
                    effectiveAt: at,
                    createdAt: at,
                    data: {
                        providerId: 'fixture',
                        modelId: 'tone-v1',
                        meter: 'speech-characters',
                        inputUsdPerMillionTokens: null,
                        outputUsdPerMillionTokens: null,
                        cacheReadUsdPerMillionTokens: null,
                        cacheWriteUsdPerMillionTokens: null,
                        usdPer1000Characters: '0.001',
                        effectiveAt: at.toISOString(),
                        sourceReference:
                            'synthetic-pronunciation-provider-price',
                        sourceUrl: null,
                        reason: 'Synthetic reviewed pronunciation provider price',
                    },
                });
        }
        const summary = await database.transaction(async (transaction) => {
            const participant = new DrizzleAiCreditTransactionParticipant(
                transaction,
            );
            if (input.action === 'grant') {
                await participant.issueGrant({
                    ownerId: input.ownerId,
                    amount: 1_000_000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'migration',
                    sourceReference: `speech-e2e-finite:${input.ownerId}`,
                });
            }
            const result = await participant.accountSummary(
                input.ownerId,
                new Date(),
            );
            if (result.policy.effectiveMode !== 'limited') {
                throw new Error('Paid speech E2E requires a finite wallet.');
            }
            return {
                availableCredits: formatCreditMilli(result.availableCredits),
                consumedCredits: formatCreditMilli(result.consumedCredits),
                reservedCredits: formatCreditMilli(result.reservedCredits),
            };
        });
        process.stdout.write(JSON.stringify(summary));
    } finally {
        await sql.end();
    }
}

main().catch(() => {
    process.stderr.write('Speech credit fixture failed.');
    process.exitCode = 1;
});
