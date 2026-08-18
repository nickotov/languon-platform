import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createPostgresClient, runPostgresMigrations } from '@languon/database';

import { loadMigrationDatabaseUrl } from './migration-environment';
import { resolveMigrationsFolder } from './migrations-folder';

const localEnvironmentFile = new URL(
    '../../../../../.env.local',
    import.meta.url,
);

if (existsSync(localEnvironmentFile)) {
    loadEnvFile(localEnvironmentFile);
}

const migrationDatabaseUrl = loadMigrationDatabaseUrl(process.env);
const client = createPostgresClient({
    databaseUrl: migrationDatabaseUrl,
    maxConnections: 1,
});

try {
    await runPostgresMigrations({
        client,
        migrationsFolder: resolveMigrationsFolder(import.meta.url),
        purpose: { kind: 'application' },
    });
} finally {
    await client.end();
}
