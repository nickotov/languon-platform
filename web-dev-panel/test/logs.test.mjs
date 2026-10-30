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

test('public auth and capability metadata do not redact startup diagnostics', () => {
    const redact = createEnvironmentRedactor({
        AUTH_JWT_ISSUER: 'languon',
        AUTH_JWT_AUDIENCE: 'languon-api',
        AUTH_ARGON2_PARALLELISM: '1',
        AUTH_ARGON2_TIME_COST: '3',
        AUTH_ARGON2_MEMORY_COST_KIB: '65536',
        AUTH_ACCESS_TOKEN_TTL: '1d',
        AUTH_REFRESH_TOKEN_TTL: '14d',
        AUTH_ALLOWED_ORIGINS: 'http://localhost:3333',
        AUTH_TRUST_PROXY: 'false',
        AUTH_WEBAUTHN_RP_ID: 'localhost',
        AUTH_WEBAUTHN_RP_NAME: 'Languon',
        HF_HUB_DISABLE_IMPLICIT_TOKEN: '1',
        DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED: 'true',
        DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED: 'false',
        AUTH_JWT_SECRET: 'actual-jwt-secret',
        PROVIDER_API_KEY: 'actual-provider-secret',
    });
    const line =
        '@languon/backend: Languon localhost http://127.0.0.1:3333 document-terms:v2 true false';
    assert.equal(redact(line), line);
    assert.equal(
        redact('actual-jwt-secret actual-provider-secret'),
        '[REDACTED] [REDACTED]',
    );
});

test('a real credential remains protected when its value matches public metadata', () => {
    const redact = createEnvironmentRedactor({
        AUTH_ARGON2_PARALLELISM: '1',
        HF_HUB_DISABLE_IMPLICIT_TOKEN: '1',
        PROVIDER_API_KEY: '1',
    });
    assert.equal(redact('credential=1'), 'credential=[REDACTED]');
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
