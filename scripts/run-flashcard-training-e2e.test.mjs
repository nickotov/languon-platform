import assert from 'node:assert/strict';
import test from 'node:test';
import { runFlashcardTrainingE2e } from './run-flashcard-training-e2e.mjs';

test('owns ephemeral infrastructure, overrides guards and cleans up in reverse order', async () => {
    const calls = [];
    await runFlashcardTrainingE2e(async (command, options) => {
        calls.push({ command, options });
        return { code: command[1] === 'container' ? 1 : 0 };
    });
    const invocation = calls.find(({ command }) => command[0] === 'pnpm');
    assert.equal(
        invocation.options.environment.ALLOW_DISPOSABLE_DATABASE_TESTS,
        'true',
    );
    assert.match(
        invocation.options.environment.AUTH_TEST_DATABASE_URL,
        /127\.0\.0\.1:55445\/languon_auth_flashcards_e2e_test$/,
    );
    assert.equal(
        invocation.options.environment.AUTH_TEST_REDIS_CONFIRM,
        '127.0.0.1:55446/1',
    );
    assert.deepEqual(
        calls.slice(-2).map(({ command }) => command.at(-1)),
        ['languon-flashcard-e2e-redis', 'languon-flashcard-e2e-postgres'],
    );
});

test('refuses existing containers without starting or stopping them', async () => {
    const calls = [];
    await assert.rejects(
        runFlashcardTrainingE2e(async (command) => {
            calls.push(command);
            return { code: 0 };
        }),
        /Refusing to reuse/,
    );
    assert.equal(calls.length, 1);
});

test('cleans up only successfully created containers after failed startup', async () => {
    const calls = [];
    await assert.rejects(
        runFlashcardTrainingE2e(async (command) => {
            calls.push(command);
            if (
                command[1] === 'run' &&
                command.includes('languon-flashcard-e2e-redis')
            )
                throw new Error('startup failure');
            return { code: command[1] === 'container' ? 1 : 0 };
        }),
        /startup failure/,
    );
    assert.deepEqual(
        calls
            .filter((command) => command[1] === 'stop')
            .map((command) => command.at(-1)),
        ['languon-flashcard-e2e-postgres'],
    );
});

test('failed test run propagates failure and still cleans up', async () => {
    const calls = [];
    await assert.rejects(
        runFlashcardTrainingE2e(async (command) => {
            calls.push(command);
            if (command[0] === 'pnpm') throw new Error('test failure');
            return { code: command[1] === 'container' ? 1 : 0 };
        }),
        /test failure/,
    );
    assert.equal(calls.filter((command) => command[1] === 'stop').length, 2);
});
