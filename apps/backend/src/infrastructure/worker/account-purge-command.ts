import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';

import { databaseSchema } from '../database/schema';
import { AccountPurgeService } from '../../modules/users/application/account-purge-service';
import { DrizzleAccountPurgeStore } from '../../modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { S3AccountPurgeObjectStorage } from '../../modules/users/infrastructure/persistence/drizzle/s3-account-purge-object-storage';
import { createDictionaryDocumentS3Client } from '../../modules/dictionaries/infrastructure/document/s3-document-client';
import { S3PrivateDocumentStorage } from '../../modules/dictionaries/infrastructure/document/s3-dictionary-document-storage';
import { loadAccountPurgeEnvironment } from './account-purge-environment';

const localEnvironmentPath = fileURLToPath(new URL('../../../../../.env.local', import.meta.url));
if (existsSync(localEnvironmentPath)) loadEnvFile(localEnvironmentPath);

async function main(): Promise<void> {
    const [operation] = process.argv.slice(2);
    if (operation !== 'run' && operation !== 'healthcheck') {
        throw new Error('Account purge command requires run or healthcheck.');
    }
    const environment = loadAccountPurgeEnvironment(process.env);
    const sql = createPostgresClient({
        databaseUrl: environment.databaseUrl,
        maxConnections: environment.databaseMaxConnections,
    });
    const database = createDrizzleDatabase(sql, databaseSchema);
    const storage = environment.storage ? new S3PrivateDocumentStorage({
        bucket: environment.storage.bucket,
        client: createDictionaryDocumentS3Client(environment.storage),
    }) : undefined;
    const service = new AccountPurgeService(
        new DrizzleAccountPurgeStore(database),
        storage ? new S3AccountPurgeObjectStorage(storage) : {
            removeAllVersions: async () => { throw new Error('Document storage is unavailable; account purge cannot verify physical files.'); },
        },
    );
    const controller = new AbortController();
    const workerId = [environment.releaseSha.slice(0, 12), hostname().slice(0, 32), process.pid, randomUUID()].join(':');
    const stop = () => controller.abort();
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    try {
        await sql`select 1`;
        if (storage) await storage.readiness(controller.signal);
        if (operation === 'healthcheck') return;
        while (!controller.signal.aborted) {
            try {
                const processed = await service.processNext({ now: new Date(), signal: controller.signal, workerId });
                if (processed) continue;
            } catch (error) {
                if (!controller.signal.aborted) console.error('Account purge attempt failed and will retry.', error instanceof Error ? error.name : 'unknown');
            }
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, environment.pollIntervalMs);
                controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
            });
        }
        await service.releaseWorkerLeases({ now: new Date(), workerId });
    } finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
        await sql.end({ timeout: 5 });
    }
}

main().catch((error: unknown) => {
    console.error('Account purge worker failed.', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
});
