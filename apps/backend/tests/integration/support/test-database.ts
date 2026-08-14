import { fileURLToPath } from 'node:url';

import {
    createPostgresClient,
    grantDisposableMigrationPurpose,
    runPostgresMigrations,
    type PostgresClient,
} from '@languon/database';

export function getTestDatabaseUrl(): string {
    if (process.env.ALLOW_DISPOSABLE_DATABASE_TESTS !== 'true') {
        throw new Error(
            'Database integration tests require ALLOW_DISPOSABLE_DATABASE_TESTS=true.',
        );
    }

    const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;

    if (!databaseUrl) {
        throw new Error('AUTH_TEST_DATABASE_URL is required.');
    }

    const parsed = new URL(databaseUrl);
    const databaseName = parsed.pathname.slice(1);
    const confirmedDatabaseName = process.env.AUTH_TEST_DATABASE_CONFIRM;

    if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
        !parsed.port ||
        parsed.port === '5432' ||
        !databaseName.startsWith('languon_auth_') ||
        !databaseName.endsWith('_test') ||
        confirmedDatabaseName !== databaseName
    ) {
        throw new Error(
            'AUTH_TEST_DATABASE_URL and AUTH_TEST_DATABASE_CONFIRM must identify the same dedicated loopback authentication test database on a non-default port.',
        );
    }

    return databaseUrl;
}

export function isDatabaseIntegrationEnabled(): boolean {
    return (
        process.env.ALLOW_DISPOSABLE_DATABASE_TESTS === 'true' &&
        typeof process.env.AUTH_TEST_DATABASE_URL === 'string' &&
        typeof process.env.AUTH_TEST_DATABASE_CONFIRM === 'string'
    );
}

export function createTestPostgresClient(): PostgresClient {
    return createPostgresClient({
        databaseUrl: getTestDatabaseUrl(),
        maxConnections: 10,
    });
}

export async function resetTestDatabase(client: PostgresClient): Promise<void> {
    await client.unsafe('drop schema if exists languon_migrations cascade');
    await client.unsafe('drop schema if exists public cascade');
    await client.unsafe('create schema public');
}

export function getMigrationsFolder(): string {
    return fileURLToPath(new URL('../../../drizzle', import.meta.url));
}

export async function migrateTestDatabase(
    client: PostgresClient,
): Promise<void> {
    await runPostgresMigrations({
        client,
        migrationsFolder: getMigrationsFolder(),
        purpose: grantDisposableMigrationPurpose(),
    });
}
