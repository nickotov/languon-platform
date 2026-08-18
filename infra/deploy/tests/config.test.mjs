import assert from 'node:assert/strict';
import { chmod, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    assertDeployConfig,
    parseEnvironmentFile,
    readDeployConfig,
} from '../lib/config.mjs';

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
        AUTH_ALLOWED_ORIGINS: 'https://example.test',
        AUTH_CODE_HMAC_SECRET: 'a',
        AUTH_JWT_SECRET: 'b',
        AUTH_WEBAUTHN_RP_ID: 'example.test',
        DATABASE_URL: 'postgres://u:p@postgres:5432/db?sslmode=verify-full',
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
        AUTH_ALLOWED_ORIGINS: 'https://example.test',
        AUTH_CODE_HMAC_SECRET: 'a',
        AUTH_JWT_SECRET: 'b',
        AUTH_WEBAUTHN_RP_ID: 'example.test',
        DATABASE_URL: 'postgres://u:p@stage-postgres:5432/db',
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
