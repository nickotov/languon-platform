import { spawn } from 'node:child_process';
import {
    assertContextualAssistantEnvironment,
    withPreservedFile,
} from './run-contextual-assistant-e2e.mjs';
import { fileURLToPath } from 'node:url';

// Each existing configuration independently enforces its exclusive disposable targets.
// Validate the learner target before starting either application; admin validates on load.
assertContextualAssistantEnvironment(process.env);
if (!process.env.ADMIN_E2E_DATABASE_URL || !process.env.ADMIN_E2E_REDIS_URL)
    throw new Error(
        'AI accounting journeys require both the guarded learner and admin disposable environments.',
    );

await withPreservedFile(
    fileURLToPath(new URL('../apps/web/next-env.d.ts', import.meta.url)),
    async () => {
        await run(
            [
                '--filter',
                '@languon/web',
                'exec',
                'playwright',
                'test',
                '--config',
                'tests/e2e/support/contextual-assistant-playwright.config.ts',
                'ai-accounting.journeys.spec.ts',
            ],
            {
                APP_ENV: 'test',
                CONTEXTUAL_ASSISTANT_FIXTURE: 'true',
                CONTEXTUAL_ASSISTANT_RUNNER: 'true',
                AUTH_E2E_RUN_ID:
                    process.env.AUTH_E2E_RUN_ID ??
                    `accounting-${Date.now().toString(36)}`,
            },
        );
        const learner = {
            AUTH_E2E_DATABASE_URL: process.env.AUTH_TEST_DATABASE_URL,
            AUTH_E2E_REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
            AUTH_E2E_BACKEND_ORIGIN: 'http://localhost:4006',
            AUTH_E2E_WEB_ORIGIN: 'http://localhost:3336',
        };
        await run(
            [
                '--filter',
                '@languon/web',
                'exec',
                'playwright',
                'test',
                'ai-legacy-budgets.journeys.spec.ts',
                '--grep',
                'paid dictionary|paid text',
            ],
            { ...learner, AUTH_E2E_TEXT_SERVICES: 'true' },
        );
        await run(
            [
                '--filter',
                '@languon/web',
                'exec',
                'playwright',
                'test',
                'ai-legacy-budgets.journeys.spec.ts',
                '--grep',
                'paid sentence|sentence preparation',
            ],
            { ...learner, AUTH_E2E_SENTENCE_SERVICES: 'true' },
        );
        await run(
            [
                '--filter',
                '@languon/web',
                'exec',
                'playwright',
                'test',
                '--config',
                'tests/e2e/support/learner-portrait-playwright.config.ts',
                '--grep',
                'interview resumes, uses a deterministic queued response',
            ],
            {
                APP_ENV: 'test',
                LEARNER_PORTRAIT_WEB_RUNNER: 'true',
                LEARNER_PORTRAIT_WEB_FIXTURE: 'true',
                LEARNER_PORTRAIT_TEST_PAID: 'true',
            },
        );
        await run([
            '--filter',
            '@languon/admin',
            'exec',
            'playwright',
            'test',
            'tests/e2e/admin-user-management.journeys.spec.ts',
            '--grep',
            'owner manages AI accounting',
        ]);
    },
);
function run(args, extra = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('pnpm', args, {
            env: { ...process.env, ...extra },
            stdio: 'inherit',
        });
        const interrupt = () => child.kill('SIGINT');
        const terminate = () => child.kill('SIGTERM');
        process.once('SIGINT', interrupt);
        process.once('SIGTERM', terminate);
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            process.removeListener('SIGINT', interrupt);
            process.removeListener('SIGTERM', terminate);
            if (code === 0) resolve();
            else
                reject(
                    new Error(`AI accounting E2E failed (${signal ?? code}).`),
                );
        });
    });
}
