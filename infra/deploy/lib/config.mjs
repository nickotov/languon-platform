import { lstat, readFile } from 'node:fs/promises';

const ENVIRONMENT_PATTERN = /^(stage|production)$/;
const SAFE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function isPrivateAddress(hostname) {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host.includes(':')) {
        if (host.startsWith('::ffff:')) {
            return isPrivateAddress(host.slice('::ffff:'.length));
        }
        return (
            host === '::' ||
            host === '::1' ||
            host.startsWith('fc') ||
            host.startsWith('fd') ||
            /^fe[89ab]/.test(host)
        );
    }
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
    const [first, second] = host.split('.').map(Number);
    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 198 && [18, 19].includes(second)) ||
        first >= 224
    );
}

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

export async function validateAdminPasswordFile(path) {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(
            'ADMIN_HTPASSWD_PATH must be a regular file, not a symlink.',
        );
    }
    if ((metadata.mode & 0o077) !== 0) {
        throw new Error('ADMIN_HTPASSWD_PATH must have mode 0600 or stricter.');
    }
    const currentUser = process.getuid?.();
    if (currentUser !== undefined && ![0, currentUser].includes(metadata.uid)) {
        throw new Error(
            'ADMIN_HTPASSWD_PATH must be owned by root or the deployment user.',
        );
    }
    const entries = (await readFile(path, 'utf8'))
        .split(/\r?\n/)
        .filter(Boolean);
    if (
        entries.length === 0 ||
        entries.some((entry) => !/^[^:\s]+:[^\s]+$/.test(entry))
    ) {
        throw new Error(
            'ADMIN_HTPASSWD_PATH must contain at least one valid htpasswd entry.',
        );
    }
}

export function assertDeployConfig(environment, config) {
    const common = [
        'ADMIN_BASE_URL',
        'ADMIN_HTPASSWD_PATH',
        'AUTH_ALLOWED_ORIGINS',
        'AUTH_CODE_HMAC_SECRET',
        'AUTH_JWT_SECRET',
        'AUTH_WEBAUTHN_RP_ID',
        'ACCOUNT_PURGE_DATABASE_URL',
        'ACCOUNT_DELETION_JOURNAL_BUCKET',
        'ACCOUNT_DELETION_JOURNAL_PREFIX',
        'ACCOUNT_DELETION_JOURNAL_NAMESPACE',
        'ACCOUNT_DELETION_JOURNAL_REGION',
        'ACCOUNT_DELETION_JOURNAL_ENCRYPTION_KEY_BASE64',
        'ACCOUNT_DELETION_JOURNAL_WRITER_ACCESS_KEY_ID',
        'ACCOUNT_DELETION_JOURNAL_WRITER_SECRET_ACCESS_KEY',
        'ACCOUNT_DELETION_JOURNAL_READER_ACCESS_KEY_ID',
        'ACCOUNT_DELETION_JOURNAL_READER_SECRET_ACCESS_KEY',
        'DATABASE_URL',
        'DICTIONARY_HMAC_SECRET',
        'DICTIONARY_WORKER_DATABASE_URL',
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
    if (config.ACCOUNT_DELETION_JOURNAL_WRITER_ACCESS_KEY_ID === config.ACCOUNT_DELETION_JOURNAL_READER_ACCESS_KEY_ID) {
        throw new Error('Deletion journal writer and recovery reader require separate credentials.');
    }
    if (config.ACCOUNT_DELETION_JOURNAL_ENDPOINT) {
        const endpoint = new URL(config.ACCOUNT_DELETION_JOURNAL_ENDPOINT);
        if (endpoint.protocol !== 'https:' || endpoint.origin !== config.ACCOUNT_DELETION_JOURNAL_ENDPOINT || endpoint.username || endpoint.password) {
            throw new Error('Deletion journal endpoint must be a credential-free HTTPS origin.');
        }
    }
    if (!/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(config.EDGE_SUBNET)) {
        throw new Error('EDGE_SUBNET must be an explicit IPv4 CIDR.');
    }
    if (new URL(config.PUBLIC_BASE_URL).protocol !== 'https:') {
        throw new Error('PUBLIC_BASE_URL must use HTTPS.');
    }
    const adminBaseUrl = new URL(config.ADMIN_BASE_URL);
    if (
        adminBaseUrl.protocol !== 'https:' ||
        adminBaseUrl.origin !== config.ADMIN_BASE_URL
    ) {
        throw new Error('ADMIN_BASE_URL must be an exact HTTPS origin.');
    }
    const relyingPartyId = config.AUTH_WEBAUTHN_RP_ID;
    if (
        adminBaseUrl.hostname !== relyingPartyId &&
        !adminBaseUrl.hostname.endsWith(`.${relyingPartyId}`)
    ) {
        throw new Error('AUTH_WEBAUTHN_RP_ID must cover ADMIN_BASE_URL.');
    }
    if (!config.ADMIN_HTPASSWD_PATH.startsWith('/')) {
        throw new Error('ADMIN_HTPASSWD_PATH must be an absolute host path.');
    }
    if (
        config.ADMIN_BIND_ADDRESS &&
        !['127.0.0.1', '::1'].includes(config.ADMIN_BIND_ADDRESS)
    ) {
        throw new Error('ADMIN_BIND_ADDRESS must be a loopback address.');
    }
    for (const [key, minimum, maximum] of [
        ['ACCOUNT_PURGE_DATABASE_MAX_CONNECTIONS', 1, 20],
        ['ACCOUNT_PURGE_POLL_INTERVAL_MS', 100, 60_000],
        ['DICTIONARY_WORKER_DATABASE_MAX_CONNECTIONS', 1, 50],
        ['DICTIONARY_WORKER_CONCURRENCY', 1, 32],
        ['DICTIONARY_WORKER_POLL_INTERVAL_MS', 50, 60_000],
        ['DICTIONARY_WORKER_READINESS_TIMEOUT_MS', 100, 30_000],
        ['DICTIONARY_WORKER_DRAIN_TIMEOUT_MS', 1_000, 295_000],
    ]) {
        if (config[key] === undefined) continue;
        const value = Number(config[key]);
        if (
            !Number.isSafeInteger(value) ||
            value < minimum ||
            value > maximum
        ) {
            throw new Error(
                `${key} must be an integer between ${minimum} and ${maximum}.`,
            );
        }
    }
    const dictionaryProviderMode =
        config.DICTIONARY_GENERATION_PROVIDER_MODE || 'unavailable';
    if ((config.DICTIONARY_DOCUMENT_STORAGE_MODE || 'unavailable') === 's3') {
        const purgeKey = config.ACCOUNT_PURGE_STORAGE_ACCESS_KEY_ID;
        const purgeSecret = config.ACCOUNT_PURGE_STORAGE_SECRET_ACCESS_KEY;
        if (!purgeKey || !purgeSecret) {
            throw new Error('Account purge requires dedicated version-delete storage credentials when document storage is enabled.');
        }
        if (purgeKey === config.DICTIONARY_DOCUMENT_STORAGE_WORKER_ACCESS_KEY_ID ||
            purgeKey === config.DICTIONARY_DOCUMENT_STORAGE_API_ACCESS_KEY_ID) {
            throw new Error('Account purge storage key must not reuse dictionary API or worker credentials.');
        }
    }
    if (!['unavailable', 'mastra'].includes(dictionaryProviderMode)) {
        throw new Error(
            'DICTIONARY_GENERATION_PROVIDER_MODE must be unavailable or mastra for deployment.',
        );
    }
    const dictionaryModelKeys = [
        'DICTIONARY_GENERATION_MODEL_ID',
        'DICTIONARY_GENERATION_MODEL_BASE_URL',
        'DICTIONARY_GENERATION_MODEL_API_KEY',
    ];
    const dictionaryBudgetBounds = {
        DICTIONARY_GENERATION_MAX_INPUT_TOKENS: [32_768, 262_144],
        DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: [128, 40_960],
        DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS: [
            1, 1_000_000_000,
        ],
        DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: [
            1, 1_000_000_000,
        ],
        DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: [1, 10_000_000],
    };
    const dictionaryBudgetKeys = Object.keys(dictionaryBudgetBounds);
    const configuredDictionaryBudgetKeys = dictionaryBudgetKeys.filter(
        (key) => config[key] !== undefined && config[key] !== '',
    );
    if (
        configuredDictionaryBudgetKeys.length > 0 &&
        configuredDictionaryBudgetKeys.length !== dictionaryBudgetKeys.length
    ) {
        throw new Error(
            'Dictionary generation budget settings must be provided together.',
        );
    }
    if (
        dictionaryProviderMode === 'mastra' &&
        configuredDictionaryBudgetKeys.length !== dictionaryBudgetKeys.length
    ) {
        throw new Error(
            `Live dictionary generation is missing required budget keys: ${dictionaryBudgetKeys.filter((key) => !configuredDictionaryBudgetKeys.includes(key)).join(', ')}.`,
        );
    }
    const dictionaryBudget = {};
    if (configuredDictionaryBudgetKeys.length === dictionaryBudgetKeys.length) {
        for (const key of dictionaryBudgetKeys) {
            const [minimum, maximum] = dictionaryBudgetBounds[key];
            const value = Number(config[key]);
            if (
                typeof config[key] !== 'string' ||
                !/^\d+$/.test(config[key]) ||
                !Number.isSafeInteger(value) ||
                value < minimum ||
                value > maximum
            ) {
                throw new Error(
                    `${key} must be an integer between ${minimum} and ${maximum}.`,
                );
            }
            dictionaryBudget[key] = value;
        }
        const maximumCalculatedCost =
            Math.ceil(
                (dictionaryBudget.DICTIONARY_GENERATION_MAX_INPUT_TOKENS *
                    dictionaryBudget.DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS) /
                    1_000_000,
            ) +
            Math.ceil(
                (dictionaryBudget.DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS *
                    dictionaryBudget.DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS) /
                    1_000_000,
            );
        if (
            dictionaryBudget.DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT <
            maximumCalculatedCost
        ) {
            throw new Error(
                'DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT must cover the configured input and output token ceilings and rates.',
            );
        }
    }
    if (dictionaryProviderMode === 'mastra') {
        const missingModelKeys = dictionaryModelKeys.filter(
            (key) => !config[key],
        );
        if (missingModelKeys.length) {
            throw new Error(
                `Mastra dictionary generation is missing required keys: ${missingModelKeys.join(', ')}.`,
            );
        }
        if (
            !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/i.test(
                config.DICTIONARY_GENERATION_MODEL_ID,
            )
        ) {
            throw new Error(
                'DICTIONARY_GENERATION_MODEL_ID must use provider/model format.',
            );
        }
        let modelBaseUrl;
        try {
            modelBaseUrl = new URL(config.DICTIONARY_GENERATION_MODEL_BASE_URL);
        } catch {
            throw new Error(
                'DICTIONARY_GENERATION_MODEL_BASE_URL must be a valid provider base URL.',
            );
        }
        if (
            modelBaseUrl.protocol !== 'https:' ||
            modelBaseUrl.username !== '' ||
            modelBaseUrl.password !== '' ||
            modelBaseUrl.search !== '' ||
            modelBaseUrl.hash !== '' ||
            modelBaseUrl.pathname.length > 200 ||
            !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(
                modelBaseUrl.pathname,
            ) ||
            isPrivateAddress(modelBaseUrl.hostname)
        ) {
            throw new Error(
                'DICTIONARY_GENERATION_MODEL_BASE_URL must be a bounded credential-free HTTPS provider URL outside private addresses.',
            );
        }
    } else if (dictionaryModelKeys.some((key) => config[key])) {
        throw new Error(
            'Dictionary generation model settings require DICTIONARY_GENERATION_PROVIDER_MODE=mastra.',
        );
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
        for (const key of [
            'ACCOUNT_PURGE_DATABASE_URL',
            'DATABASE_URL',
            'DICTIONARY_WORKER_DATABASE_URL',
            'MIGRATION_DATABASE_URL',
        ]) {
            if (
                new URL(config[key]).searchParams.get('sslmode') !==
                'verify-full'
            ) {
                throw new Error(
                    `${key} must use sslmode=verify-full in production.`,
                );
            }
        }
        const applicationDatabaseUser = new URL(config.DATABASE_URL).username;
        const purgeDatabaseUser = new URL(config.ACCOUNT_PURGE_DATABASE_URL).username;
        const workerDatabaseUser = new URL(
            config.DICTIONARY_WORKER_DATABASE_URL,
        ).username;
        const migrationDatabaseUser = new URL(config.MIGRATION_DATABASE_URL)
            .username;
        if (
            !workerDatabaseUser ||
            workerDatabaseUser === applicationDatabaseUser ||
            workerDatabaseUser === migrationDatabaseUser
        ) {
            throw new Error(
                'DICTIONARY_WORKER_DATABASE_URL must use a dedicated production database user.',
            );
        }
        if (!purgeDatabaseUser || [applicationDatabaseUser, workerDatabaseUser, migrationDatabaseUser].includes(purgeDatabaseUser)) {
            throw new Error('ACCOUNT_PURGE_DATABASE_URL must use a dedicated production database user.');
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
        for (const key of [
            'ACCOUNT_PURGE_DATABASE_URL',
            'DATABASE_URL',
            'DICTIONARY_WORKER_DATABASE_URL',
            'REDIS_URL',
        ]) {
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
