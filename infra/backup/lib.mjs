import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';

const ENVIRONMENT_PATTERN = /^(stage|production)$/;
const SAFE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DISPOSABLE_DATABASE_PATTERN = /^[a-z][a-z0-9_]*_restore_[a-z0-9]{8,}$/;

export function parseEnvironmentFile(contents) {
    const values = {};
    for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator < 1)
            throw new Error(`Invalid configuration line ${index + 1}.`);
        const key = line.slice(0, separator).trim();
        if (!SAFE_KEY_PATTERN.test(key)) {
            throw new Error(`Invalid configuration key on line ${index + 1}.`);
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

export async function readConfig(path) {
    await assertPrivateFile(path, 'Backup configuration');
    return parseEnvironmentFile(await readFile(path, 'utf8'));
}

export async function assertPrivateFile(path, label) {
    const details = await stat(path);
    if (!details.isFile()) throw new Error(`${label} must be a regular file.`);
    if ((details.mode & 0o077) !== 0) {
        throw new Error(
            `${label} must not be accessible by group or other users.`,
        );
    }
    return path;
}

function requireValues(config, names) {
    const missing = names.filter((name) => !config[name]);
    if (missing.length)
        throw new Error(
            `Backup configuration is missing: ${missing.join(', ')}.`,
        );
}

export function assertEnvironment(value) {
    if (!ENVIRONMENT_PATTERN.test(value ?? '')) {
        throw new Error('Environment must be stage or production.');
    }
    return value;
}

function assertVerifiedProductionTls(config, prefix, environment) {
    if (environment !== 'production') return;
    const modeKey = `${prefix}PGSSLMODE`;
    const rootCertKey = `${prefix}PGSSLROOTCERT`;
    if (config[modeKey] !== 'verify-full' || !config[rootCertKey]) {
        throw new Error(
            `Production PostgreSQL requires ${modeKey}=verify-full and ${rootCertKey}.`,
        );
    }
}

export function assertCreateConfig(config, environment) {
    requireValues(config, [
        'PGHOST',
        'PGDATABASE',
        'PGUSER',
        'PGPASSWORD',
        'BACKUP_SOURCE_ID',
        'BACKUP_S3_URI',
        'BACKUP_AGE_RECIPIENT',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
    ]);
    parseS3Uri(config.BACKUP_S3_URI);
    assertVerifiedProductionTls(config, '', environment);
    return config;
}

export function assertStorageConfig(config) {
    requireValues(config, [
        'BACKUP_S3_URI',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
    ]);
    parseS3Uri(config.BACKUP_S3_URI);
    return config;
}

export function assertRestoreConfig(config, environment) {
    requireValues(config, [
        'RESTORE_PGHOST',
        'RESTORE_PGDATABASE',
        'RESTORE_PGUSER',
        'RESTORE_PGPASSWORD',
        'BACKUP_AGE_IDENTITY_FILE',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
    ]);
    if (config.RESTORE_TARGET_DISPOSABLE !== 'true') {
        throw new Error('RESTORE_TARGET_DISPOSABLE=true is required.');
    }
    if (!DISPOSABLE_DATABASE_PATTERN.test(config.RESTORE_PGDATABASE)) {
        throw new Error(
            'Restore database must use <name>_restore_<8+ random characters>.',
        );
    }
    if (
        config.PGHOST &&
        config.PGDATABASE &&
        config.PGHOST === config.RESTORE_PGHOST &&
        config.PGDATABASE === config.RESTORE_PGDATABASE
    ) {
        throw new Error('Restore target must differ from the backup source.');
    }
    assertVerifiedProductionTls(config, 'RESTORE_', environment);
    return config;
}

export function parseS3Uri(value) {
    const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(value ?? '');
    if (!match || match[2].includes('..'))
        throw new Error('BACKUP_S3_URI must be s3://bucket/prefix.');
    return { bucket: match[1], prefix: match[2].replace(/\/+$/, '') };
}

export function safeDatabaseIdentity(config, prefix = '') {
    return `${config[`${prefix}PGHOST`]}:${config[`${prefix}PGPORT`] || '5432'}/${config[`${prefix}PGDATABASE`]}`;
}

export function postgresEnvironment(config, prefix = '') {
    return {
        PGHOST: config[`${prefix}PGHOST`],
        PGPORT: config[`${prefix}PGPORT`] || '5432',
        PGDATABASE: config[`${prefix}PGDATABASE`],
        PGUSER: config[`${prefix}PGUSER`],
        PGPASSWORD: config[`${prefix}PGPASSWORD`],
        PGSSLMODE: config[`${prefix}PGSSLMODE`] || 'require',
        ...(config[`${prefix}PGSSLROOTCERT`]
            ? { PGSSLROOTCERT: config[`${prefix}PGSSLROOTCERT`] }
            : {}),
    };
}

export function awsEnvironment(config) {
    return {
        AWS_ACCESS_KEY_ID: config.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: config.AWS_SECRET_ACCESS_KEY,
        ...(config.AWS_SESSION_TOKEN
            ? { AWS_SESSION_TOKEN: config.AWS_SESSION_TOKEN }
            : {}),
        AWS_DEFAULT_REGION: config.AWS_DEFAULT_REGION || 'us-east-1',
    };
}

export function awsEndpointArguments(config) {
    return config.BACKUP_S3_ENDPOINT
        ? ['--endpoint-url', config.BACKUP_S3_ENDPOINT]
        : [];
}

export async function sha256File(path) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
}

export function postgresMajor(version) {
    const match = /(?:PostgreSQL\)?\s*)(\d+)(?:\.|\s|$)/i.exec(version ?? '');
    if (!match)
        throw new Error('Could not determine PostgreSQL tool major version.');
    return Number(match[1]);
}

export function validateBackupManifest(manifest) {
    if (
        manifest?.schemaVersion !== 1 ||
        manifest?.kind !== 'languon-postgres-backup'
    ) {
        throw new Error('Unsupported backup manifest.');
    }
    assertEnvironment(manifest.environment);
    if (manifest.outcome !== 'success' || !manifest.completedAt) {
        throw new Error('Backup manifest does not record a successful backup.');
    }
    if (!SHA256_PATTERN.test(manifest.encryptedObject?.sha256 ?? '')) {
        throw new Error('Backup manifest checksum is invalid.');
    }
    if (
        !Number.isSafeInteger(manifest.encryptedObject?.bytes) ||
        manifest.encryptedObject.bytes < 1
    ) {
        throw new Error('Backup manifest size is invalid.');
    }
    parseS3Uri(manifest.encryptedObject.uri);
    if (!Number.isSafeInteger(manifest.postgres?.toolMajor)) {
        throw new Error('Backup manifest PostgreSQL tool version is invalid.');
    }
    return manifest;
}

export function validateRestoreManifest(manifest) {
    if (
        manifest?.schemaVersion !== 1 ||
        manifest?.kind !== 'languon-postgres-restore-drill'
    ) {
        throw new Error('Unsupported restore drill manifest.');
    }
    if (manifest.outcome !== 'success' || !manifest.completedAt) {
        throw new Error('Restore drill manifest does not record success.');
    }
    if (!SHA256_PATTERN.test(manifest.backup?.sha256 ?? '')) {
        throw new Error('Restore drill backup checksum is invalid.');
    }
    return manifest;
}

function ageHours(value, now) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 5 * 60_000) {
        throw new Error('Evidence timestamp is invalid or in the future.');
    }
    return (now.getTime() - timestamp) / 3_600_000;
}

export function checkFreshEvidence({
    backup,
    restore,
    expectedEnvironment,
    maxAgeHours = 24,
    maxRestoreAgeDays = 92,
    now = new Date(),
}) {
    validateBackupManifest(backup);
    validateRestoreManifest(restore);
    if (
        expectedEnvironment &&
        backup.environment !== assertEnvironment(expectedEnvironment)
    ) {
        throw new Error(
            `Backup environment ${backup.environment} does not match required environment ${expectedEnvironment}.`,
        );
    }
    const backupAgeHours = ageHours(backup.completedAt, now);
    const restoreAgeHours = ageHours(restore.completedAt, now);
    if (backupAgeHours > maxAgeHours) {
        throw new Error(
            `Backup is ${backupAgeHours.toFixed(1)} hours old; limit is ${maxAgeHours}.`,
        );
    }
    if (restoreAgeHours > maxRestoreAgeDays * 24) {
        throw new Error(
            `Restore drill is older than ${maxRestoreAgeDays} days.`,
        );
    }
    if (restore.backup.postgresToolMajor !== backup.postgres.toolMajor) {
        throw new Error(
            'Restore drill used a different PostgreSQL tool major version.',
        );
    }
    if (restore.environment !== backup.environment) {
        throw new Error('Restore drill environment does not match the backup.');
    }
    return {
        environment: backup.environment,
        backupCompletedAt: backup.completedAt,
        backupAgeHours: Number(backupAgeHours.toFixed(2)),
        restoreCompletedAt: restore.completedAt,
        restoreAgeDays: Number((restoreAgeHours / 24).toFixed(2)),
        objectUri: backup.encryptedObject.uri,
        objectSha256: backup.encryptedObject.sha256,
        migrationLedgerSha256: backup.migrationLedgerSha256,
    };
}

function isoWeekKey(value) {
    const date = new Date(value);
    const thursday = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    thursday.setUTCDate(
        thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7),
    );
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((thursday - yearStart) / 86_400_000 + 1) / 7);
    return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function selectRetentionDeletions(
    objects,
    { daily = 7, weekly = 4 } = {},
) {
    const sorted = [...objects]
        .filter(
            (object) =>
                object.key.endsWith('.metadata.json') &&
                Number.isFinite(Date.parse(object.lastModified)),
        )
        .sort(
            (left, right) =>
                Date.parse(right.lastModified) - Date.parse(left.lastModified),
        );
    const keep = new Set(sorted.slice(0, daily).map((object) => object.key));
    const weeks = new Set();
    for (const object of sorted.slice(daily)) {
        const week = isoWeekKey(object.lastModified);
        if (weeks.size < weekly && !weeks.has(week)) {
            weeks.add(week);
            keep.add(object.key);
        }
    }
    return sorted.filter((object) => !keep.has(object.key));
}

export function sanitizeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(
        /(?:postgres(?:ql)?|redis):\/\/[^\s]+/gi,
        '[redacted-url]',
    );
}
