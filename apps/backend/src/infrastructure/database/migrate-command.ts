import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createPostgresClient, runPostgresMigrations } from '@languon/database';
import { z } from 'zod';

import { resolveMigrationsFolder } from './migrations-folder';

const localEnvironmentFile = new URL(
    '../../../../../.env.local',
    import.meta.url,
);

if (existsSync(localEnvironmentFile)) {
    loadEnvFile(localEnvironmentFile);
}

const MigrationEnvironmentSchema = z.object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    DATABASE_URL: z
        .url()
        .refine(
            (value) =>
                ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
            'DATABASE_URL must use PostgreSQL.',
        ),
});

const environment = MigrationEnvironmentSchema.parse(process.env);
const client = createPostgresClient({
    databaseUrl: environment.DATABASE_URL,
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
