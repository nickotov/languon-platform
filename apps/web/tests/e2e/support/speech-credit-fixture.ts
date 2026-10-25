import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(__dirname, '../../../../..');

/** Seed synthetic funds through the real ledger, isolated to the already guarded E2E database. */
export async function speechCreditFixture(
    actorId: string,
    action: 'setup' | 'setup-provider' | 'grant' | 'summary',
) {
    const { stdout } = await execFileAsync(
        'pnpm',
        [
            '--filter',
            '@languon/backend',
            'exec',
            'tsx',
            'tests/support/speech-credit-fixture.ts',
        ],
        {
            cwd: repositoryRoot,
            env: {
                ...process.env,
                APP_ENV: 'test',
                SPEECH_E2E_CREDIT_FIXTURES: 'true',
                SPEECH_E2E_ACTOR_ID: actorId,
                SPEECH_E2E_CREDIT_ACTION: action,
            },
            timeout: 20_000,
            maxBuffer: 128 * 1024,
        },
    );
    return JSON.parse(stdout) as {
        availableCredits: string;
        consumedCredits: string;
        reservedCredits: string;
    };
}
