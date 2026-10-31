import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { ESLint } from 'eslint';
import { format } from 'prettier';
import { readabilityConfig, readabilityRules } from './eslint-readability.mjs';

const eslint = new ESLint();
const backendPath = readabilityConfig.files[0];
const frontendPath = readabilityConfig.files[1];
const ruleIds = new Set(Object.keys(readabilityRules));

async function readabilityMessages(source, filePath = backendPath) {
    const [result] = await eslint.lintText(source, { filePath });

    return result.messages.filter((message) => ruleIds.has(message.ruleId));
}

test('normal config enforces braces and spacing in backend and frontend examples', async () => {
    const source = `export function choose(value) {
    if (!value) return null;
    const result = prepare(
        value,
    );
    return result;
}`;

    for (const filePath of [backendPath, frontendPath]) {
        const messages = await readabilityMessages(source, filePath);

        assert.ok(messages.some(({ ruleId }) => ruleId === 'curly'));
        assert.ok(
            messages.some(
                ({ ruleId }) => ruleId === 'padding-line-between-statements',
            ),
        );
    }
});

test('checks loop bodies and branch chains, not just guard returns', async () => {
    const messages = await readabilityMessages(`export function collect(items) {
    for (const item of items) inspect(item);
    while (ready()) inspectNext();
    if (ready()) accept(); else reject();
}`);

    assert.equal(messages.filter(({ ruleId }) => ruleId === 'curly').length, 4);
});

test('allows related declarations and separated logical phases', async () => {
    assert.deepEqual(
        await readabilityMessages(`export function prepare(value) {
    const ownerId = value.ownerId;
    const conversationId = value.conversationId;

    if (!ownerId) {
        throw new Error('Missing owner');
    }

    return { ownerId, conversationId };
}`),
        [],
    );
});

test('requires separation between multiline methods', async () => {
    const messages = await readabilityMessages(`export class Reader {
    read() {
        return 1;
    }
    write() {
        return 2;
    }
}`);

    assert.ok(
        messages.some(({ ruleId }) => ruleId === 'lines-between-class-members'),
    );
});

test('policy tests and implementation are themselves enrolled', async () => {
    for (const filePath of [
        'scripts/eslint-readability.mjs',
        'scripts/eslint-readability.test.mjs',
    ]) {
        const config = await eslint.calculateConfigForFile(filePath);

        assert.equal(config.rules.curly[0], 2);
        assert.equal(config.rules['padding-line-between-statements'][0], 2);
    }
});

test('staged rollout does not silently enable new errors across untouched code', async () => {
    const messages = await readabilityMessages(
        'export function choose(value) { if (value) return value; return null; }',
        'apps/backend/src/modules/example/application/untouched.ts',
    );

    assert.deepEqual(messages, []);
});

test('autofix preserves dangling-else, loop effects and early-return behavior', async () => {
    const source = `function evaluate(outer, inner) {
    const result = [];
    if (outer)
        if (inner) result.push('inner');
        else result.push('else');
    for (let index = 0; index < 2; index++) result.push(index);
    if (!outer) return result.join(',');
    return result.join(',');
}
evaluate(outer, inner);`;
    const fixer = new ESLint({ fix: true });
    const [result] = await fixer.lintText(source, { filePath: backendPath });

    assert.ok(result.output);
    assert.deepEqual(await readabilityMessages(result.output), []);

    for (const outer of [true, false]) {
        for (const inner of [true, false]) {
            assert.equal(
                runInNewContext(result.output, { outer, inner }),
                runInNewContext(source, { outer, inner }),
            );
        }
    }
});

test('Prettier retains fixed logical spacing and lint fixes are idempotent', async () => {
    const fixer = new ESLint({ fix: true });
    const [first] = await fixer.lintText(
        `export function choose(value) {
    if (!value) return null;
    inspect(
        value,
    );
    return value;
}`,
        { filePath: backendPath },
    );
    const formatted = await format(first.output, { parser: 'typescript' });
    const [second] = await fixer.lintText(formatted, { filePath: backendPath });

    assert.deepEqual(await readabilityMessages(formatted), []);
    assert.equal(second.output, undefined);
});
