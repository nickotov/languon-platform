import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    assertDeployConfig,
    parseEnvironmentFile,
    readDeployConfig,
    validateAdminPasswordFile,
} from '../lib/config.mjs';

const liveDictionaryBudget = {
    DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '65536',
    DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '1024',
    DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS: '1000000',
    DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: '4000000',
    DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '70000',
};

test('parses values without evaluating shell syntax', () => {
    assert.deepEqual(
        parseEnvironmentFile('A="hello world"\nB=$(touch /tmp/nope)\n'),
        {
            A: 'hello world',
            B: '$(touch /tmp/nope)',
        },
    );
    assert.throws(
        () => parseEnvironmentFile('export A=x'),
        /Invalid environment key/,
    );
});

test('production refuses local data addresses', () => {
    const config = {
        ADMIN_BASE_URL: 'https://admin.example.test',
        ADMIN_HTPASSWD_PATH: '/safe/admin.htpasswd',
        AUTH_ALLOWED_ORIGINS: 'https://example.test',
        AUTH_CODE_HMAC_SECRET: 'a',
        AUTH_JWT_SECRET: 'b',
        DICTIONARY_HMAC_SECRET: 'c',
        AUTH_WEBAUTHN_RP_ID: 'example.test',
        DATABASE_URL: 'postgres://u:p@postgres:5432/db?sslmode=verify-full',
        DICTIONARY_WORKER_DATABASE_URL:
            'postgres://worker:p@10.0.0.10:5432/db?sslmode=verify-full',
        MIGRATION_DATABASE_URL:
            'postgres://m:p@10.0.0.10:5432/db?sslmode=verify-full',
        REDIS_URL: 'rediss://app:p@10.0.0.10:6379',
        DATA_TLS_CA_PATH: '/tls/data-ca.crt',
        EDGE_SUBNET: '172.30.20.0/24',
        BACKUP_MANIFEST_PATH: '/safe/latest.json',
        PUBLIC_BASE_URL: 'https://example.test',
        TLS_CERTIFICATE_PATH: '/tls/cert',
        TLS_PRIVATE_KEY_PATH: '/tls/key',
    };
    assert.throws(
        () => assertDeployConfig('production', config),
        /private address/,
    );
});

test('deployment requires a dedicated dictionary HMAC secret', () => {
    const config = {
        ADMIN_BASE_URL: 'https://admin.example.test',
        ADMIN_HTPASSWD_PATH: '/safe/admin.htpasswd',
        AUTH_ALLOWED_ORIGINS: 'https://example.test',
        AUTH_CODE_HMAC_SECRET: 'a',
        AUTH_JWT_SECRET: 'b',
        AUTH_WEBAUTHN_RP_ID: 'example.test',
        DATABASE_URL: 'postgres://app:p@data.example.test:5432/db',
        DICTIONARY_WORKER_DATABASE_URL:
            'postgres://worker:p@data.example.test:5432/db',
        EDGE_SUBNET: '172.30.20.0/24',
        MIGRATION_DATABASE_URL:
            'postgres://migrator:p@data.example.test:5432/db',
        PUBLIC_BASE_URL: 'https://example.test',
        REDIS_URL: 'redis://cache.example.test:6379',
        TLS_CERTIFICATE_PATH: '/tls/cert',
        TLS_PRIVATE_KEY_PATH: '/tls/key',
    };

    assert.throws(
        () => assertDeployConfig('stage', config),
        /DICTIONARY_HMAC_SECRET/,
    );
});

test('sanitized deployment examples accept the full batch output envelope', async () => {
    for (const environment of ['stage', 'production']) {
        const config = parseEnvironmentFile(
            await readFile(`infra/deploy/${environment}.env.example`, 'utf8'),
        );
        assert.equal(
            assertDeployConfig(environment, config)
                .DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS,
            '40960',
        );
    }
});

test('production requires a dedicated dictionary worker database user', () => {
    const config = {
        ADMIN_BASE_URL: 'https://admin.example.test',
        ADMIN_HTPASSWD_PATH: '/safe/admin.htpasswd',
        AUTH_ALLOWED_ORIGINS: 'https://example.test',
        AUTH_CODE_HMAC_SECRET: 'a',
        AUTH_JWT_SECRET: 'b',
        DICTIONARY_HMAC_SECRET: 'c',
        AUTH_WEBAUTHN_RP_ID: 'example.test',
        DATABASE_URL:
            'postgres://app:p@data.example.test:5432/db?sslmode=verify-full',
        DICTIONARY_WORKER_DATABASE_URL:
            'postgres://app:p@data.example.test:5432/db?sslmode=verify-full',
        MIGRATION_DATABASE_URL:
            'postgres://migrator:p@data.example.test:5432/db?sslmode=verify-full',
        REDIS_URL: 'rediss://app:p@data.example.test:6379',
        DATA_TLS_CA_PATH: '/tls/data-ca.crt',
        EDGE_SUBNET: '172.30.20.0/24',
        BACKUP_MANIFEST_PATH: '/safe/latest.json',
        PUBLIC_BASE_URL: 'https://example.test',
        TLS_CERTIFICATE_PATH: '/tls/cert',
        TLS_PRIVATE_KEY_PATH: '/tls/key',
    };

    assert.throws(
        () => assertDeployConfig('production', config),
        /dedicated production database user/,
    );
    assert.equal(
        assertDeployConfig('production', {
            ...config,
            DICTIONARY_WORKER_DATABASE_URL:
                'postgres://worker:p@data.example.test:5432/db?sslmode=verify-full',
        }).DICTIONARY_WORKER_DATABASE_URL.includes('worker'),
        true,
    );
});

test('deployment config must be a private regular file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'deploy-config-'));
    const configPath = path.join(directory, 'deploy.env');
    await writeFile(configPath, 'A=value\n', { mode: 0o644 });
    await assert.rejects(() => readDeployConfig(configPath), /0600/);
    await chmod(configPath, 0o600);
    assert.deepEqual(await readDeployConfig(configPath), { A: 'value' });
    const linkPath = path.join(directory, 'deploy-link.env');
    await symlink(configPath, linkPath);
    await assert.rejects(() => readDeployConfig(linkPath), /regular file/);
});

test('admin binding fails closed outside loopback', () => {
    const required = {
        ADMIN_BASE_URL: 'https://admin.example.test',
        ADMIN_HTPASSWD_PATH: '/safe/admin.htpasswd',
        AUTH_ALLOWED_ORIGINS: 'https://example.test',
        AUTH_CODE_HMAC_SECRET: 'a',
        AUTH_JWT_SECRET: 'b',
        DICTIONARY_HMAC_SECRET: 'c',
        AUTH_WEBAUTHN_RP_ID: 'example.test',
        DATABASE_URL: 'postgres://u:p@stage-postgres:5432/db',
        DICTIONARY_WORKER_DATABASE_URL:
            'postgres://worker:p@stage-postgres:5432/db',
        MIGRATION_DATABASE_URL: 'postgres://m:p@stage-postgres:5432/db',
        REDIS_URL: 'redis://stage-redis:6379',
        EDGE_SUBNET: '172.30.20.0/24',
        PUBLIC_BASE_URL: 'https://example.test',
        TLS_CERTIFICATE_PATH: '/tls/cert',
        TLS_PRIVATE_KEY_PATH: '/tls/key',
        ADMIN_BIND_ADDRESS: '0.0.0.0',
    };
    assert.throws(() => assertDeployConfig('stage', required), /loopback/);
});

test('admin origin and password file fail closed', () => {
    const required = {
        ADMIN_BASE_URL: 'http://admin.example.test',
        ADMIN_HTPASSWD_PATH: 'relative.htpasswd',
        AUTH_ALLOWED_ORIGINS: 'https://example.test',
        AUTH_CODE_HMAC_SECRET: 'a',
        AUTH_JWT_SECRET: 'b',
        DICTIONARY_HMAC_SECRET: 'c',
        AUTH_WEBAUTHN_RP_ID: 'example.test',
        DATABASE_URL: 'postgres://u:p@stage-postgres:5432/db',
        DICTIONARY_WORKER_DATABASE_URL:
            'postgres://worker:p@stage-postgres:5432/db',
        MIGRATION_DATABASE_URL: 'postgres://m:p@stage-postgres:5432/db',
        REDIS_URL: 'redis://stage-redis:6379',
        EDGE_SUBNET: '172.30.20.0/24',
        PUBLIC_BASE_URL: 'https://example.test',
        TLS_CERTIFICATE_PATH: '/tls/cert',
        TLS_PRIVATE_KEY_PATH: '/tls/key',
    };
    assert.throws(
        () => assertDeployConfig('stage', required),
        /ADMIN_BASE_URL/,
    );
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                ADMIN_BASE_URL: 'https://admin.other.test',
            }),
        /RP_ID/,
    );
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                ADMIN_BASE_URL: 'https://admin.example.test',
            }),
        /absolute host path/,
    );
});

test('admin password file is private, regular, and contains an entry', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'admin-password-'));
    const passwordPath = path.join(directory, 'admin.htpasswd');
    await writeFile(passwordPath, 'operator:$2y$05$local-test-hash\n', {
        mode: 0o644,
    });
    await assert.rejects(() => validateAdminPasswordFile(passwordPath), /0600/);
    await chmod(passwordPath, 0o600);
    await validateAdminPasswordFile(passwordPath);
    await writeFile(passwordPath, 'not-an-entry\n', { mode: 0o600 });
    await assert.rejects(
        () => validateAdminPasswordFile(passwordPath),
        /valid htpasswd entry/,
    );
});

test('dictionary worker process and drain settings are bounded before deployment', () => {
    const required = {
        ADMIN_BASE_URL: 'https://admin.example.test',
        ADMIN_HTPASSWD_PATH: '/safe/admin.htpasswd',
        AUTH_ALLOWED_ORIGINS: 'https://example.test',
        AUTH_CODE_HMAC_SECRET: 'a',
        AUTH_JWT_SECRET: 'b',
        DICTIONARY_HMAC_SECRET: 'c',
        AUTH_WEBAUTHN_RP_ID: 'example.test',
        DATABASE_URL: 'postgres://u:p@stage-postgres:5432/db',
        DICTIONARY_WORKER_DATABASE_URL:
            'postgres://worker:p@stage-postgres:5432/db',
        MIGRATION_DATABASE_URL: 'postgres://m:p@stage-postgres:5432/db',
        REDIS_URL: 'redis://stage-redis:6379',
        EDGE_SUBNET: '172.30.20.0/24',
        PUBLIC_BASE_URL: 'https://example.test',
        TLS_CERTIFICATE_PATH: '/tls/cert',
        TLS_PRIVATE_KEY_PATH: '/tls/key',
    };
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                DICTIONARY_WORKER_CONCURRENCY: '33',
            }),
        /DICTIONARY_WORKER_CONCURRENCY/,
    );
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                DICTIONARY_WORKER_DRAIN_TIMEOUT_MS: '300000',
            }),
        /DICTIONARY_WORKER_DRAIN_TIMEOUT_MS/,
    );
    assert.equal(
        assertDeployConfig('stage', {
            ...required,
            DICTIONARY_WORKER_CONCURRENCY: '4',
            DICTIONARY_WORKER_DRAIN_TIMEOUT_MS: '295000',
        }).DICTIONARY_WORKER_CONCURRENCY,
        '4',
    );
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                ...liveDictionaryBudget,
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                DICTIONARY_GENERATION_MODEL_API_KEY: 'secret',
                DICTIONARY_GENERATION_MODEL_BASE_URL: 'http://models.test',
                DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
            }),
        /HTTPS provider URL/,
    );
    assert.equal(
        assertDeployConfig('stage', {
            ...required,
            ...liveDictionaryBudget,
            DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
            DICTIONARY_GENERATION_MODEL_API_KEY: 'secret',
            DICTIONARY_GENERATION_MODEL_BASE_URL:
                'https://models.example.test/openai/v1',
            DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
        }).DICTIONARY_GENERATION_PROVIDER_MODE,
        'mastra',
    );
    assert.equal(
        assertDeployConfig('stage', {
            ...required,
            DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
            DICTIONARY_GENERATION_MODEL_API_KEY: 'secret',
            DICTIONARY_GENERATION_MODEL_BASE_URL:
                'https://models.example.test/openai/v1',
            DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
            DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '32768',
            DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '128',
            DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS: '1',
            DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: '1',
            DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '2',
        }).DICTIONARY_GENERATION_MAX_INPUT_TOKENS,
        '32768',
    );
    for (const unsafeUrl of [
        'https://user:pass@models.example.test/v1',
        'https://models.example.test/v1?tenant=private',
        'https://10.0.0.2/v1',
    ]) {
        assert.throws(
            () =>
                assertDeployConfig('stage', {
                    ...required,
                    ...liveDictionaryBudget,
                    DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                    DICTIONARY_GENERATION_MODEL_API_KEY: 'secret',
                    DICTIONARY_GENERATION_MODEL_BASE_URL: unsafeUrl,
                    DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
                }),
            /credential-free HTTPS provider URL/,
        );
    }
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                DICTIONARY_GENERATION_MODEL_API_KEY: 'secret',
                DICTIONARY_GENERATION_MODEL_BASE_URL:
                    'https://models.example.test/v1',
                DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
            }),
        /missing required budget keys/,
    );
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                ...liveDictionaryBudget,
                DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '32767',
            }),
        /DICTIONARY_GENERATION_MAX_INPUT_TOKENS/,
    );
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                ...liveDictionaryBudget,
                DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '262145',
            }),
        /DICTIONARY_GENERATION_MAX_INPUT_TOKENS/,
    );
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...required,
                ...liveDictionaryBudget,
                DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '69631',
            }),
        /must cover the configured input and output token ceilings and rates/,
    );
});
