import { createPostgresClient } from '@languon/database';
import { drizzle } from 'drizzle-orm/postgres-js';
import { z } from 'zod';
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
            action: z.enum(['grant', 'summary']),
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
        const summary = await database.transaction(async (transaction) => {
            const participant = new DrizzleAiCreditTransactionParticipant(
                transaction,
            );
            if (input.action === 'grant') {
                await participant.issueGrant({
                    ownerId: input.ownerId,
                    amount: 1000n,
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
                availableCredits: result.availableCredits.toString(),
                consumedCredits: result.consumedCredits.toString(),
                reservedCredits: result.reservedCredits.toString(),
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
