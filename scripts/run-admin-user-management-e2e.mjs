import { spawn } from 'node:child_process';

await run('pnpm', ['--filter', '@languon/admin', 'test:e2e']);
await run(
    process.execPath,
    ['--test', 'infra/deploy/tests/admin-edge.journey.test.mjs'],
    { LANGUON_DEPLOY_E2E: 'true' },
);

function run(command, args, environment = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            env: { ...process.env, ...environment },
            stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(
                new Error(
                    `${command} ${args.join(' ')} failed${signal ? ` with signal ${signal}` : ` with exit code ${code ?? 'unknown'}`}.`,
                ),
            );
        });
    });
}
