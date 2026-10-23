import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const storePath =
    'apps/backend/src/modules/example/infrastructure/persistence/drizzle/example-store.ts';
const readabilityRules = new Set([
    'max-lines',
    'lines-between-class-members',
    'padding-line-between-statements',
]);

async function messages(source, filePath = storePath) {
    const [result] = await eslint.lintText(source, { filePath });

    return result.messages.filter((message) =>
        readabilityRules.has(message.ruleId),
    );
}

test('rejects oversized persistence implementation files', async () => {
    const results = await messages(Array(501).fill('void 0;').join('\n'));

    assert.ok(results.some((result) => result.ruleId === 'max-lines'));
});

test('does not penalize blank lines or standalone comments', async () => {
    const source = Array(500).fill('void 0;\n\n// Logical stage.').join('\n');

    assert.deepEqual(await messages(source), []);
});

test('checks extracted modules as well as store facades', async () => {
    const path = storePath.replace('example-store.ts', 'uploads/authorize.ts');
    const results = await messages(Array(501).fill('void 0;').join('\n'), path);

    assert.ok(results.some((result) => result.ruleId === 'max-lines'));
});

test('excludes declarative schemas and tests without exempting other code', async () => {
    const source = Array(501).fill('void 0;').join('\n');

    for (const file of [
        'schema.ts',
        'example-store.test.ts',
        'example.spec.ts',
    ]) {
        assert.deepEqual(
            await messages(source, storePath.replace('example-store.ts', file)),
            [],
        );
    }
});

test('requires separation before results and after multiline operations', async () => {
    const results = await messages(`export function read() {
    inspect(
        'value',
    );
    const value = 1;
    return value;
}`);

    assert.equal(
        results.filter(
            (result) => result.ruleId === 'padding-line-between-statements',
        ).length,
        2,
    );
});

test('requires separation between multiline methods', async () => {
    const results = await messages(`export class Store {
    read() {
        return 1;
    }
    write() {
        return 2;
    }
}`);

    assert.ok(
        results.some(
            (result) => result.ruleId === 'lines-between-class-members',
        ),
    );
});

test('allows compact related declarations and readable operations', async () => {
    assert.deepEqual(
        await messages(`export function read() {
    const ownerId = 'owner';
    const id = 'id';

    return { ownerId, id };
}`),
        [],
    );
});

test('normal autofix introduces whitespace without changing expressions', async () => {
    const source = `export function read() {
    const value = 1;
    return value;
}`;
    const fixer = new ESLint({ fix: true });
    const [result] = await fixer.lintText(source, { filePath: storePath });

    assert.equal(result.output, source.replace('    return', '\n    return'));
    assert.deepEqual(await messages(result.output), []);
});
