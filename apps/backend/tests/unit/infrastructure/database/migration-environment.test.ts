import { describe, expect, it } from 'vitest';

import { loadMigrationDatabaseUrl } from '../../../../src/infrastructure/database/migration-environment';

describe('migration environment', () => {
    it('requires the dedicated migration credential when deployed', () => {
        expect(() =>
            loadMigrationDatabaseUrl({
                APP_ENV: 'production',
                DATABASE_URL: 'postgres://app:secret@db.internal/languon',
            }),
        ).toThrow(/MIGRATION_DATABASE_URL/);
    });

    it('uses a one-shot migration URL in deployed environments', () => {
        expect(
            loadMigrationDatabaseUrl({
                APP_ENV: 'staging',
                MIGRATION_DATABASE_URL:
                    'postgres://migrator:secret@db.internal/languon',
            }),
        ).toBe('postgres://migrator:secret@db.internal/languon');
    });

    it('requires verified PostgreSQL TLS for production migrations', () => {
        expect(() =>
            loadMigrationDatabaseUrl({
                APP_ENV: 'production',
                MIGRATION_DATABASE_URL:
                    'postgres://migrator:secret@db.internal/languon',
            }),
        ).toThrow(/sslmode=verify-full/);
    });

    it('retains the local DATABASE_URL fallback', () => {
        expect(
            loadMigrationDatabaseUrl({
                APP_ENV: 'development',
                DATABASE_URL: 'postgres://local:local@localhost/languon',
            }),
        ).toBe('postgres://local:local@localhost/languon');
    });
});
