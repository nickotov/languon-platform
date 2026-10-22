/** Synthetic pricing calibration for disposable local administration E2E only. */
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { databaseSchema } from '../../src/infrastructure/database/schema';
import { seedLegacyActionFixture } from './legacy-action-fixture';

const url = process.env.ADMIN_E2E_DATABASE_URL;
if (
    process.env.APP_ENV !== 'test' ||
    process.env.ADMIN_E2E_ACCOUNTING_FIXTURES !== 'true' ||
    !url
)
    throw new Error(
        'Explicit test-only accounting fixture opt-in is required.',
    );
const target = new URL(url);
if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !/(?:admin.*e2e|e2e.*admin).*test/i.test(target.pathname) ||
    !target.port ||
    target.port === '5432'
)
    throw new Error(
        'A dedicated disposable loopback admin E2E database on a nondefault port is required.',
    );
const client = createPostgresClient({ databaseUrl: url, maxConnections: 1 });
try {
    await seedLegacyActionFixture(
        createDrizzleDatabase(client, databaseSchema),
        '100',
    );
    process.stdout.write('Synthetic legacy action accounting configured.\n');
} finally {
    await client.end();
}
