import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BoundedLogBuffer,
    createEnvironmentRedactor,
    StreamingRedactor,
} from '../src/logs.mjs';

test('redacts a secret split across arbitrary output chunks', () => {
    const output = [];
    const stream = new StreamingRedactor({
        onText: (text) => output.push(text),
        redact: createEnvironmentRedactor({ API_TOKEN: 'split-secret-value' }),
    });
    stream.write(Buffer.from('before split-se'));
    stream.write(Buffer.from('cret-va'));
    stream.write(Buffer.from('lue after'));
    stream.end();
    assert.equal(output.join(''), 'before [REDACTED] after');
});

test('recognizes common inherited credential variable names', () => {
    const redact = createEnvironmentRedactor({
        GITHUB_PAT: 'github-secret',
        MYSQL_PWD: 'mysql-secret',
        PGPASSWORD: 'postgres-secret',
        SENTRY_DSN: 'sentry-secret',
    });
    assert.equal(
        redact('github-secret mysql-secret postgres-secret sentry-secret'),
        '[REDACTED] [REDACTED] [REDACTED] [REDACTED]',
    );
});

test('bounds logs by entry count and reports truncation', () => {
    const buffer = new BoundedLogBuffer({
        maximumBytes: 10_000,
        maximumEntries: 2,
    });
    buffer.append({ stream: 'stdout', text: 'one' });
    buffer.append({ stream: 'stdout', text: 'two' });
    buffer.append({ stream: 'stdout', text: 'three' });
    assert.deepEqual(
        buffer.snapshot().entries.map(({ text }) => text),
        ['two', 'three'],
    );
    assert.equal(buffer.snapshot().truncated, true);
});
