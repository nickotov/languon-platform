import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    assertContextualAssistantEnvironment,
    runContextualAssistantE2e,
    withPreservedFile,
} from './run-contextual-assistant-e2e.mjs';
const safe = {
    ALLOW_DISPOSABLE_DATABASE_TESTS: 'true',
    ALLOW_DISPOSABLE_REDIS_TESTS: 'true',
    AUTH_TEST_DATABASE_URL:
        'postgresql://test:test@127.0.0.1:55444/languon_auth_assistant_web_test',
    AUTH_TEST_DATABASE_CONFIRM: 'languon_auth_assistant_web_test',
    AUTH_TEST_REDIS_URL: 'redis://127.0.0.1:56444/1',
    AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56444/1',
};
test('accepts only the exclusively named and confirmed local journey targets', () => {
    assert.doesNotThrow(() => assertContextualAssistantEnvironment(safe));
    for (const [key, value] of Object.entries({
        ALLOW_DISPOSABLE_DATABASE_TESTS: 'false',
        ALLOW_DISPOSABLE_REDIS_TESTS: 'false',
        AUTH_TEST_DATABASE_URL:
            'postgresql://test:test@prod:55444/languon_auth_assistant_web_test',
        AUTH_TEST_DATABASE_CONFIRM: 'other',
        AUTH_TEST_REDIS_URL: 'redis://127.0.0.1:6379/0',
        AUTH_TEST_REDIS_CONFIRM: 'other',
    }))
        assert.throws(() =>
            assertContextualAssistantEnvironment({ ...safe, [key]: value }),
        );
    assert.throws(() => assertContextualAssistantEnvironment({}));
});

test('restores exact preexisting generated-file bytes even when browser execution fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'assistant-next-types-'));
    const path = join(directory, 'next-env.d.ts');
    const original = Buffer.from('preexisting user type declarations\r\n\0');
    try {
        await writeFile(path, original);
        await assert.rejects(
            withPreservedFile(path, async () => {
                await writeFile(path, 'generated isolated-dist types');
                throw new Error('Browser failure');
            }),
            /Browser failure/,
        );
        assert.deepEqual(await readFile(path), original);
        await rm(path);
        await assert.rejects(
            withPreservedFile(path, async () => {
                await writeFile(path, 'generated new file');
                throw new Error('Browser failure');
            }),
            /Browser failure/,
        );
        await assert.rejects(readFile(path), { code: 'ENOENT' });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('runs HTTP journeys before browser selection and stops on a failing HTTP phase', async () => {
    const previous = Object.fromEntries(
        Object.keys(safe).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, safe);
    try {
        const calls = [];
        await runContextualAssistantE2e(
            async (command, args) => {
                calls.push({ command, args });
            },
            ['--', '--grep', 'closing reconnects'],
        );
        assert.equal(calls.length, 2);
        assert.ok(
            calls[0].args.includes(
                'tests/integration/modules/conversations/contextual-assistant.journeys.test.ts',
            ),
        );
        assert.ok(!calls[0].args.includes('--grep'));
        assert.deepEqual(calls[1].args.slice(-2), [
            '--grep',
            'closing reconnects',
        ]);
        assert.ok(!calls[1].args.includes('--'));
        let phases = 0;
        await assert.rejects(
            runContextualAssistantE2e(async () => {
                phases += 1;
                throw new Error('HTTP failure');
            }, []),
            /HTTP failure/,
        );
        assert.equal(phases, 1);
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
