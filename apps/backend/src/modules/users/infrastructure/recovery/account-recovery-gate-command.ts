import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { S3Client } from '@aws-sdk/client-s3';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';

import { databaseSchema } from '../../../../infrastructure/database/schema';
import { runAccountDeletionRecoveryGate } from './account-deletion-recovery-gate';
import { loadAccountDeletionJournalEnvironment } from './account-deletion-journal-environment';
import { DrizzleAccountDeletionRecoveryStore } from './drizzle-account-deletion-recovery-store';
import { S3AccountDeletionRecoveryReader } from './s3-account-deletion-recovery-reader';
import { S3AccountDeletionRecoveryJournal } from './s3-account-deletion-recovery-journal';

const localEnvironmentFile = new URL('../../../../../../../.env.local', import.meta.url);
if (existsSync(localEnvironmentFile)) loadEnvFile(localEnvironmentFile);

const command = process.argv[2];
if (command !== 'initialize' && command !== 'run') {
    throw new Error('Usage: account-recovery-gate-command.ts <initialize|run>');
}

const config = loadAccountDeletionJournalEnvironment(process.env, process.env.APP_ENV === 'production' || process.env.APP_ENV === 'staging');
const client = new S3Client({
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    maxAttempts: 2,
    region: config.region,
    requestHandler: { requestTimeout: 5_000, connectionTimeout: 3_000 },
});

try {
    if (command === 'initialize') {
        await new S3AccountDeletionRecoveryJournal({ client, ...config }).initialize();
        console.log('Deletion journal sentinel initialized.');
    } else {
        if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the recovery gate.');
        const postgres = createPostgresClient({ databaseUrl: process.env.DATABASE_URL, maxConnections: 1 });
        try {
            const result = await runAccountDeletionRecoveryGate({
                reader: new S3AccountDeletionRecoveryReader({ client, ...config }),
                store: new DrizzleAccountDeletionRecoveryStore(createDrizzleDatabase(postgres, databaseSchema)),
            });
            console.log(`Deletion recovery gate passed: ${result.inspected} accounts inspected, ${result.blocked} blocked.`);
        } finally {
            await postgres.end();
        }
    }
} finally {
    client.destroy();
}
