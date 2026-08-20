import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
    grantDisposableMigrationPurpose,
    MigrationHistoryMismatchError,
    runPostgresMigrations,
    type PostgresClient,
} from '@languon/database';

import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

let client: PostgresClient;

describe.runIf(isDatabaseIntegrationEnabled())('database migrations', () => {
    beforeAll(() => {
        client = createTestPostgresClient();
    });
    beforeEach(async () => {
        await resetTestDatabase(client);
    });

    afterAll(async () => {
        await client.end();
    });

    it('applies the clean identity and authentication schema without seed data', async () => {
        await migrateTestDatabase(client);

        const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;
        const rowCounts = await client<{ count: string }[]>`
      select sum(row_count)::text as count
      from (
        select count(*) as row_count from users
        union all select count(*) from user_emails
        union all select count(*) from password_credentials
        union all select count(*) from auth_verification_challenges
        union all select count(*) from auth_sessions
        union all select count(*) from auth_passkeys
        union all select count(*) from auth_security_events
        union all select count(*) from admin_memberships
        union all select count(*) from admin_audit_events
      ) counts
    `;

        expect(tables.map(({ table_name }) => table_name)).toEqual([
            'admin_audit_events',
            'admin_memberships',
            'auth_passkeys',
            'auth_security_events',
            'auth_sessions',
            'auth_verification_challenges',
            'password_credentials',
            'user_emails',
            'users',
        ]);
        expect(rowCounts[0]?.count).toBe('0');
    });

    it('creates the required constraints and lookup indexes', async () => {
        await migrateTestDatabase(client);

        const constraints = await client<{ constraint_name: string }[]>`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name in (
          'users',
          'user_emails',
          'password_credentials',
          'auth_verification_challenges',
          'auth_sessions',
          'auth_passkeys',
          'auth_security_events'
          ,'admin_memberships'
          ,'admin_audit_events'
        )
      order by constraint_name
    `;
        const indexes = await client<{ indexname: string }[]>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename in (
          'users',
          'user_emails',
          'password_credentials',
          'auth_verification_challenges',
          'auth_sessions',
          'auth_passkeys',
          'auth_security_events'
          ,'admin_memberships'
          ,'admin_audit_events'
        )
      order by indexname
    `;

        expect(
            constraints.map(({ constraint_name }) => constraint_name),
        ).toEqual(
            expect.arrayContaining([
                'user_emails_canonical_email_length',
                'user_emails_canonical_matches_email',
                'user_emails_email_length',
                'user_emails_pkey',
                'user_emails_user_id_users_id_fk',
                'user_emails_id_user_id_unique',
                'auth_verification_challenges_email_user_fk',
                'users_pkey',
                'users_version_positive',
                'password_credentials_argon2id_only',
                'password_credentials_parameters_safe',
                'auth_verification_challenges_attempts_bounded',
                'auth_sessions_digest_format',
                'auth_sessions_rotation_state',
                'auth_passkeys_counter_nonnegative',
                'auth_security_events_metadata_bounded',
                'admin_memberships_reason_length',
                'admin_memberships_revocation_pair',
                'admin_audit_events_metadata_bounded',
                'admin_audit_events_expiry_after_occurrence',
            ]),
        );
        expect(indexes.map(({ indexname }) => indexname)).toEqual(
            expect.arrayContaining([
                'user_emails_canonical_email_unique',
                'user_emails_one_primary_per_user',
                'user_emails_user_id_idx',
                'user_emails_id_user_id_unique',
                'users_status_idx',
                'auth_verification_challenges_one_active_user_purpose',
                'auth_sessions_refresh_digest_unique',
                'auth_passkeys_credential_id_unique',
                'auth_security_events_expiry_idx',
                'admin_memberships_one_active_per_user',
                'admin_audit_events_correlation_idx',
                'admin_audit_events_expiry_idx',
            ]),
        );
    });

    it('is idempotent when the checked-in migration set is already applied', async () => {
        await migrateTestDatabase(client);
        await migrateTestDatabase(client);

        const history = await client<{ count: string }[]>`
      select count(*)
      from languon_migrations.history
    `;

        expect(history[0]?.count).toBe('8');
    });

    it('serializes simultaneous migration runners with the advisory lock', async () => {
        const secondClient = createTestPostgresClient();

        try {
            await Promise.all([
                migrateTestDatabase(client),
                runPostgresMigrations({
                    client: secondClient,
                    migrationsFolder: getMigrationsFolder(),
                    purpose: grantDisposableMigrationPurpose(),
                }),
            ]);

            const history = await client<{ count: string }[]>`
        select count(*)
        from languon_migrations.history
      `;

            expect(history[0]?.count).toBe('8');
        } finally {
            await secondClient.end();
        }
    });

    it('rejects edits to a migration that is already recorded in history', async () => {
        await migrateTestDatabase(client);
        const temporaryDirectory = mkdtempSync(
            join(tmpdir(), 'languon-migrations-'),
        );
        const copiedMigrations = join(temporaryDirectory, 'drizzle');

        try {
            cpSync(getMigrationsFolder(), copiedMigrations, {
                recursive: true,
            });
            appendFileSync(
                join(copiedMigrations, '0000_foamy_angel.sql'),
                '\n-- tampered after application\n',
            );

            await expect(
                runPostgresMigrations({
                    client,
                    migrationsFolder: copiedMigrations,
                    purpose: grantDisposableMigrationPurpose(),
                }),
            ).rejects.toBeInstanceOf(MigrationHistoryMismatchError);
        } finally {
            rmSync(temporaryDirectory, { force: true, recursive: true });
        }
    });
});
