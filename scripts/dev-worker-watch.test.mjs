import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test(
    'development worker reloads imported source while production entry stays unwatched',
    { timeout: 20000 },
    async () => {
        const root = JSON.parse(
            await readFile(new URL('../package.json', import.meta.url), 'utf8'),
        );
        const backend = JSON.parse(
            await readFile(
                new URL('../apps/backend/package.json', import.meta.url),
                'utf8',
            ),
        );

        assert.equal(
            root.scripts['dev:dictionary-worker'],
            'pnpm --filter @languon/backend dictionary:worker:dev',
        );

        assert.equal(
            backend.scripts['dictionary:worker:dev'],
            'tsx watch src/infrastructure/worker/dictionary-worker-command.ts run',
        );

        assert.equal(
            backend.scripts['dictionary:worker'],
            'tsx src/infrastructure/worker/dictionary-worker-command.ts run',
        );

        const directory = await mkdtemp(
            join(tmpdir(), 'languon-worker-watch-'),
        );
        const entry = join(directory, 'entry.ts');
        const dependency = join(directory, 'dependency.ts');
        await writeFile(dependency, "export const version = 'before';\n");
        await writeFile(
            entry,
            "import { version } from './dependency'; console.log('WORKER_READY:' + version); setInterval(() => {}, 1000);\n",
        );

        const child = spawn(
            process.execPath,
            [require.resolve('tsx/cli'), 'watch', entry],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let output = '';
        child.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            output += chunk.toString();
        });

        async function observe(text) {
            const deadline = Date.now() + 8000;
            while (
                !output.includes(text) &&
                Date.now() < deadline &&
                child.exitCode === null
            ) {
                await new Promise((resolve) => setTimeout(resolve, 30));
            }

            assert.ok(
                output.includes(text),
                'Watched child did not reload its imported source.',
            );
        }

        try {
            await observe('WORKER_READY:before');
            await writeFile(dependency, "export const version = 'after';\n");
            await observe('WORKER_READY:after');
        } finally {
            child.kill('SIGTERM');
            await new Promise((resolve) => child.once('exit', resolve));
            await rm(directory, { recursive: true, force: true });
        }
    },
);
