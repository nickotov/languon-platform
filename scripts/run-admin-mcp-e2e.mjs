import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPreservedFile } from './run-contextual-assistant-e2e.mjs';
import { execute } from './critical-flows/runtime.mjs';

/** The Playwright configuration validates disposable targets; never borrow app data. */
export async function runAdminMcpJourney() {
    await withPreservedFile(resolve('apps/web/next-env.d.ts'), () =>
        execute(
            'pnpm',
            [
                '--filter',
                '@languon/admin',
                'exec',
                'playwright',
                'test',
                'tests/e2e/admin-mcp.journeys.spec.ts',
            ],
            {
                env: { ...process.env, ADMIN_E2E_MCP: 'true' },
            },
        ),
    );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await runAdminMcpJourney().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
