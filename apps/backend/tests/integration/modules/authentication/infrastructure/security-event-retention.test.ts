import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { pruneExpiredSecurityEvents } from '../../../../../src/modules/authentication/infrastructure/persistence/drizzle/prune-expired-security-events';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'authentication event expiry',
    () => {
        it('prunes bounded batches under restricted grants, preserving fresh events and serializing replicas', async () => {
            const admin = createTestPostgresClient();
            const runtime = createPostgresClient({
                databaseUrl: getTestDatabaseUrl(),
                maxConnections: 1,
                idleTimeoutSeconds: 0,
            });
            const role = admin('retention_' + randomUUID().replaceAll('-', ''));
            try {
                await resetTestDatabase(admin);
                await migrateTestDatabase(admin);
                await admin`create role ${role}`;
                await admin`grant usage on schema public to ${role}`;
                await admin`grant select (id, expires_at), delete on auth_security_events to ${role}`;
                await runtime`set role ${role}`;
                const db = createDrizzleDatabase(runtime, databaseSchema);
                await admin`insert into auth_security_events (id, correlation_id, event_type, outcome, occurred_at, expires_at)
                select gen_random_uuid(), 'synthetic', 'login', 'success', now()-interval '181 days', now()-interval '1 day'
                from generate_series(1,501)`;

                const fresh = randomUUID();
                await admin`insert into auth_security_events (id, correlation_id, event_type, outcome)
                values (${fresh}, 'synthetic', 'login', 'success')`;

                await admin.begin(async (tx) => {
                    await tx`select pg_advisory_xact_lock(hashtextextended('languon.auth-security-event-retention',0))`;
                    await pruneExpiredSecurityEvents(db);
                    expect(
                        await tx`select count(*)::int as n from auth_security_events`,
                    ).toMatchObject([{ n: 502 }]);
                });

                expect(
                    await pruneExpiredSecurityEvents(db),
                ).toBeGreaterThanOrEqual(86_400);

                expect(
                    await admin`select count(*)::int as n from auth_security_events`,
                ).toMatchObject([{ n: 2 }]);

                expect(await pruneExpiredSecurityEvents(db)).toBeUndefined();
                await pruneExpiredSecurityEvents(db);
                expect(
                    await admin`select id from auth_security_events`,
                ).toMatchObject([{ id: fresh }]);

                // At steady state only a small fraction of the retained history is due.
                await admin`insert into auth_security_events (id, correlation_id, event_type, outcome)
                    select gen_random_uuid(), 'synthetic', 'login', 'success' from generate_series(1,10000)`;

                await admin`analyze auth_security_events`;
                const plan = await runtime`explain (format json)
                    select id from auth_security_events where expires_at <= current_timestamp
                    order by expires_at limit 500`;

                expect(JSON.stringify(plan)).toContain(
                    'auth_security_events_expiry_idx',
                );
            } finally {
                await runtime.end();

                await admin`drop owned by ${role}`.catch(() => undefined);
                await admin`drop role if exists ${role}`;
                await admin.end();
            }
        }, 60_000);
    },
);
