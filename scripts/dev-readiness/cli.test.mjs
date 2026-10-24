import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// pnpm forwards the documented separator to Node scripts, unlike its exec command.
for (const script of ['dev-doctor', 'dev-configure']) {
    test(`${script} accepts the documented pnpm argument separator without reading secrets`, () => {
        const output = execFileSync(
            process.execPath,
            [`scripts/${script}.mjs`, '--', '--help'],
            {
                encoding: 'utf8',
                env: { PATH: process.env.PATH },
            },
        );
        assert.match(output, /--env-file/);
    });
}
