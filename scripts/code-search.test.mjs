import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const cliPackage = require.resolve('@ast-grep/cli/package.json');
const executable = join(cliPackage, '..', 'ast-grep');

function search(language, pattern, file) {
    const result = spawnSync(
        executable,
        [
            'run',
            '--lang',
            language,
            '--pattern',
            pattern,
            '--json=compact',
            file,
        ],
        { encoding: 'utf8', timeout: 15_000 },
    );
    assert.ifError(result.error);
    return result;
}

function fixture(t, extension, source) {
    const directory = mkdtempSync(join(tmpdir(), 'languon-code-search-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const file = join(directory, `example.${extension}`);
    writeFileSync(file, source);
    return file;
}

test('structural call search handles multiline TS and excludes text mentions', (t) => {
    const source = `// createLearningApi(fake)
const mention = 'createLearningApi(fake)';
const api = createLearningApi(
  { target: getTarget(), dictionaryId: 'fixture' },
);
`;
    const file = fixture(t, 'ts', source);
    const result = search('ts', 'createLearningApi($$$ARGS)', file);
    assert.equal(result.status, 0, result.stderr);
    const matches = JSON.parse(result.stdout);
    assert.equal(matches.length, 1);
    assert.match(matches[0].text, /target: getTarget\(\)/);
    assert.equal(matches[0].range.start.line, 2);
    assert.equal(
        readFileSync(file, 'utf8'),
        source,
        'search must not rewrite source',
    );
});

test('TSX pattern finds dialog with attributes and children', (t) => {
    const file = fixture(
        t,
        'tsx',
        `const view = <Dialog
      open={visible}
      onClose={close}
    ><span>History</span></Dialog>;
const mention = '<Dialog open>fake</Dialog>';`,
    );
    const result = search('tsx', '<Dialog $$$ATTRS>$$$CHILDREN</Dialog>', file);
    assert.equal(result.status, 0, result.stderr);
    const matches = JSON.parse(result.stdout);
    assert.equal(matches.length, 1);
    assert.match(matches[0].text, /onClose=\{close\}/);
});

test('named imports can be found across multiline formatting', (t) => {
    const file = fixture(
        t,
        'ts',
        `import {
  first,
  second as alias,
} from '@languon/contracts';`,
    );
    const result = search('ts', 'import { $$$NAMES } from $MODULE', file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).length, 1);
});

test('no matches are distinct from an unsupported-language failure', (t) => {
    const file = fixture(t, 'ts', 'const value = 1;');
    const empty = search('ts', 'missing($$$ARGS)', file);
    assert.equal(empty.status, 1, empty.stderr);
    assert.deepEqual(JSON.parse(empty.stdout), []);
    const invalid = search('not-a-language', 'missing($$$ARGS)', file);
    assert.notEqual(invalid.status, 0);
    assert.notEqual(invalid.status, 1);
});
