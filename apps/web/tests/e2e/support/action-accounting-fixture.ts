import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** Reviewed CLI validates opt-in, matching loopback disposable DB and no active holds. */
export async function customerBalance(
    actorId: string,
    credits: string,
    capability: string,
) {
    const databaseUrl =
        process.env.AUTH_E2E_DATABASE_URL ?? process.env.AUTH_TEST_DATABASE_URL;
    if (!databaseUrl)
        throw new Error(
            'An explicit disposable accounting database is required.',
        );
    await promisify(execFile)(
        'pnpm',
        [
            '--filter',
            '@languon/backend',
            'exec',
            'tsx',
            'tests/support/dictionary-web-accounting-fixture.ts',
            'customer-balance',
            actorId,
            credits,
            capability,
        ],
        {
            env: {
                ...process.env,
                APP_ENV: 'test',
                AUTH_E2E_DICTIONARY_ACCOUNTING_FIXTURE: 'true',
                AUTH_E2E_DATABASE_URL: databaseUrl,
                DATABASE_URL: databaseUrl,
            },
            timeout: 30_000,
        },
    );
}
