import { lstat, readFile } from 'node:fs/promises';

const ENVIRONMENT_PATTERN = /^(stage|production)$/;
const SAFE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function validateEnvironment(value) {
    if (!ENVIRONMENT_PATTERN.test(value ?? '')) {
        throw new Error('Environment must be stage or production.');
    }
    return value;
}

export function parseEnvironmentFile(contents) {
    const values = {};
    for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator < 1) {
            throw new Error(`Invalid environment file line ${index + 1}.`);
        }
        const key = line.slice(0, separator).trim();
        if (!SAFE_KEY_PATTERN.test(key)) {
            throw new Error(`Invalid environment key on line ${index + 1}.`);
        }
        let value = line.slice(separator + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        values[key] = value;
    }
    return values;
}

export async function readDeployConfig(path) {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(
            'Deployment config must be a regular file, not a symlink.',
        );
    }
    if ((metadata.mode & 0o077) !== 0) {
        throw new Error('Deployment config must have mode 0600 or stricter.');
    }
    const currentUser = process.getuid?.();
    if (currentUser !== undefined && ![0, currentUser].includes(metadata.uid)) {
        throw new Error(
            'Deployment config must be owned by root or the deployment user.',
        );
    }
    return parseEnvironmentFile(await readFile(path, 'utf8'));
}

export function assertDeployConfig(environment, config) {
    const common = [
        'AUTH_ALLOWED_ORIGINS',
        'AUTH_CODE_HMAC_SECRET',
        'AUTH_JWT_SECRET',
        'AUTH_WEBAUTHN_RP_ID',
        'DATABASE_URL',
        'EDGE_SUBNET',
        'MIGRATION_DATABASE_URL',
        'PUBLIC_BASE_URL',
        'REDIS_URL',
        'TLS_CERTIFICATE_PATH',
        'TLS_PRIVATE_KEY_PATH',
    ];
    const missing = common.filter((key) => !config[key]);
    if (missing.length) {
        throw new Error(
            `Deployment config is missing required keys: ${missing.join(', ')}.`,
        );
    }
    if (!/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(config.EDGE_SUBNET)) {
        throw new Error('EDGE_SUBNET must be an explicit IPv4 CIDR.');
    }
    if (new URL(config.PUBLIC_BASE_URL).protocol !== 'https:') {
        throw new Error('PUBLIC_BASE_URL must use HTTPS.');
    }
    if (
        config.ADMIN_BIND_ADDRESS &&
        !['127.0.0.1', '::1'].includes(config.ADMIN_BIND_ADDRESS)
    ) {
        throw new Error('ADMIN_BIND_ADDRESS must be a loopback address.');
    }
    if (environment === 'production') {
        if (!config.BACKUP_MANIFEST_PATH) {
            throw new Error(
                'Production deployment requires BACKUP_MANIFEST_PATH.',
            );
        }
        if (!config.DATA_TLS_CA_PATH) {
            throw new Error('Production deployment requires DATA_TLS_CA_PATH.');
        }
        for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
            if (
                new URL(config[key]).searchParams.get('sslmode') !==
                'verify-full'
            ) {
                throw new Error(
                    `${key} must use sslmode=verify-full in production.`,
                );
            }
        }
        const redis = new URL(config.REDIS_URL);
        if (redis.protocol !== 'rediss:') {
            throw new Error('REDIS_URL must use rediss:// in production.');
        }
        if (!redis.username || redis.username === 'default') {
            throw new Error(
                'REDIS_URL must use a restricted named Redis user.',
            );
        }
        for (const key of ['DATABASE_URL', 'REDIS_URL']) {
            const hostname = new URL(config[key]).hostname;
            if (
                ['localhost', '127.0.0.1', 'postgres', 'redis'].includes(
                    hostname,
                )
            ) {
                throw new Error(
                    `${key} must use the production data VPS private address.`,
                );
            }
        }
    }
    return config;
}
