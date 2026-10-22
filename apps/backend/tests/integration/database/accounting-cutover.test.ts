import { randomUUID } from 'node:crypto';
import {
    copyFile,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createDrizzleDatabase,
    grantDisposableMigrationPurpose,
    runPostgresMigrations,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { lockTextAiCapacity } from '../../../src/infrastructure/text-ai/text-ai-capacity';
import { DrizzleAiCreditTransactionParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiCreditGrantsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import { learnerPortraitInterviewOperationsTable as operations } from '../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'accounting empty-ledger cutover preflight',
    () => {
        let client: PostgresClient;
        let database: PostgresJsDatabase<typeof databaseSchema>;
        let prefixFolder: string;
        let ownerId: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            // Apply the genuine migration prefix. Only its journal is shortened;
            // migration SQL and hashes remain the production inputs.
            const original = getMigrationsFolder();
            const journal = JSON.parse(
                await readFile(join(original, 'meta/_journal.json'), 'utf8'),
            ) as {
                entries: { idx: number; tag: string }[];
            };
            journal.entries = journal.entries.filter((entry) => entry.idx < 89);
            prefixFolder = await mkdtemp(
                join(tmpdir(), 'languon-accounting-cutover-'),
            );
            await mkdir(join(prefixFolder, 'meta'));
            await writeFile(
                join(prefixFolder, 'meta/_journal.json'),
                JSON.stringify(journal),
            );
            await Promise.all(
                journal.entries.map((entry) =>
                    copyFile(
                        join(original, `${entry.tag}.sql`),
                        join(prefixFolder, `${entry.tag}.sql`),
                    ),
                ),
            );
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await runPostgresMigrations({
                client,
                migrationsFolder: prefixFolder,
                purpose: grantDisposableMigrationPurpose(),
            });
            ownerId = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
        });
        afterAll(async () => {
            await client.end();
            await rm(prefixFolder, { recursive: true, force: true });
        });

        it('rejects an existing whole-credit grant without reinterpreting or changing its amount', async () => {
            const grant = await database.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 7n,
                    source: 'admin',
                    sourceReference: randomUUID(),
                    createdAt: new Date(),
                    expiresAt: null,
                }),
            );
            await expect(migrateTestDatabase(client)).rejects.toMatchObject({
                cause: {
                    code: '55000',
                    message: expect.stringContaining(
                        'fresh empty development ledger and drained workers',
                    ),
                },
            });
            const rows = await database
                .select()
                .from(aiCreditGrantsTable)
                .where(eq(aiCreditGrantsTable.ownerId, ownerId));
            expect(rows).toHaveLength(1);
            expect(rows[0]?.amount).toBe(7n);
            expect(grant.created).toBe(true);
        });

        it.each(['queued', 'running'] as const)(
            'rejects a %s free legacy job even when the credit ledger is empty',
            async (state) => {
                const id = randomUUID(),
                    at = new Date();
                await database.transaction(async (tx) => {
                    await lockTextAiCapacity(tx);
                    await tx.insert(operations).values({
                        id,
                        ownerId,
                        interviewId: randomUUID(),
                        generation: 0,
                        version: 0,
                        state,
                        input: { kind: 'skip', topic: 'update' },
                        context: {
                            locale: 'en',
                            approvedItems: null,
                            draftItems: null,
                            messages: [],
                            completedTopics: [],
                        },
                        execution: { funding: 'operator' },
                        idempotencyKey: randomUUID(),
                        fingerprint: 'synthetic-pre-cutover-free-job',
                        createdAt: at,
                        updatedAt: at,
                    });
                });
                expect(
                    await database.select().from(aiCreditGrantsTable),
                ).toEqual([]);
                await expect(migrateTestDatabase(client)).rejects.toMatchObject(
                    {
                        cause: {
                            code: '55000',
                            message: expect.stringContaining(
                                'fresh empty development ledger and drained workers',
                            ),
                        },
                    },
                );
                expect(
                    await database
                        .select()
                        .from(operations)
                        .where(eq(operations.id, id)),
                ).toMatchObject([{ state }]);
            },
        );
    },
);
