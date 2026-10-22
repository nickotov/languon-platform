import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { parseCreditMilli } from '../../src/modules/ai-credits/domain/exact-credit-amount';
import { DrizzleAiCreditTransactionParticipant } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { capabilityPolicyRevisionsTable } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
/** No live credentials/providers: explicit disposable web E2E startup only. */
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { databaseSchema } from '../../src/infrastructure/database/schema';
import { seedDictionaryAccountingFixture } from './dictionary-accounting-fixture';
const url = process.env.AUTH_E2E_DATABASE_URL;
if (
    process.env.APP_ENV !== 'test' ||
    process.env.AUTH_E2E_DICTIONARY_ACCOUNTING_FIXTURE !== 'true' ||
    !url ||
    process.env.DATABASE_URL !== url
)
    throw new Error(
        'Explicit matching test-only dictionary accounting database is required.',
    );
const target = new URL(url);
if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !/(?:e2e|test)/i.test(target.pathname) ||
    !target.port ||
    target.port === '5432'
)
    throw new Error(
        'A disposable loopback E2E database on a nondefault port is required.',
    );
const client = createPostgresClient({ databaseUrl: url, maxConnections: 1 });
try {
    const database = createDrizzleDatabase(client, databaseSchema);
    const [
        mode,
        actorId,
        credits = '40',
        capability = 'dictionary-generation',
    ] = process.argv.slice(2);
    if (mode === undefined) {
        await seedDictionaryAccountingFixture(database);
        process.stdout.write(
            'Synthetic managed dictionary accounting configured.\n',
        );
    } else {
        if (
            mode !== 'customer-balance' ||
            !actorId ||
            !/^[0-9a-f-]{36}$/i.test(actorId) ||
            ![
                'dictionary-generation',
                'sentence-generation',
                'text-translation',
                'portrait-interview',
            ].includes(capability)
        )
            throw new Error(
                'Expected customer-balance actorUUID credits capability.',
            );
        const available = parseCreditMilli(credits);
        if (available > 1000000n)
            throw new Error(
                'Synthetic customer fixture is limited to1000credits.',
            );
        await database.transaction(async (tx) => {
            const at = new Date();
            const wallet = new DrizzleAiCreditTransactionParticipant(tx);
            const summary = await wallet.accountSummary(actorId, at);
            if (summary.reservedCredits !== 0n)
                throw new Error(
                    'Finish existing synthetic actions before adjusting fixture balance.',
                );
            const difference = available - summary.availableCredits;
            if (difference !== 0n)
                await wallet.adjustByAdmin({
                    ownerId: actorId,
                    amount: difference,
                    at,
                    expectedManagementVersion: summary.managementVersion,
                    expiresAt: null,
                    reason: 'Synthetic customer allowance confirmation fixture',
                    sourceReference: randomUUID(),
                });
            const [policy] = await tx
                .select()
                .from(capabilityPolicyRevisionsTable)
                .where(
                    eq(
                        capabilityPolicyRevisionsTable.capability,
                        capability as 'dictionary-generation',
                    ),
                )
                .orderBy(desc(capabilityPolicyRevisionsTable.version))
                .limit(1);
            if (policy?.funding !== 'customer')
                await tx
                    .insert(capabilityPolicyRevisionsTable)
                    .values({
                        id: randomUUID(),
                        capability: capability as 'dictionary-generation',
                        version: (policy?.version ?? 0) + 1,
                        funding: 'customer',
                        createdAt: at,
                        reason: 'Synthetic explicit paid allowance browser fixture',
                    });
        });
        process.stdout.write(
            JSON.stringify({ availableCredits: credits, capability }) + '\n',
        );
    }
} finally {
    await client.end();
}
