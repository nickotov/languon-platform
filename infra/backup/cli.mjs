#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import {
    mkdir,
    mkdtemp,
    readFile,
    rename,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from '../deploy/lib/runner.mjs';
import {
    assertCreateConfig,
    assertEnvironment,
    assertPrivateFile,
    assertRestoreConfig,
    assertStorageConfig,
    awsEndpointArguments,
    awsEnvironment,
    checkFreshEvidence,
    parseS3Uri,
    postgresEnvironment,
    postgresMajor,
    readConfig,
    safeDatabaseIdentity,
    sanitizeError,
    selectRetentionDeletions,
    sha256File,
    validateBackupManifest,
} from './lib.mjs';

const usage = `Usage:
  backup.sh create --environment <stage|production> --config <path> --output-manifest <path>
  backup.sh check-fresh --environment <stage|production> --manifest <path> [--restore-manifest <path>] [--max-age-hours 24] [--max-restore-age-days 92]
  backup.sh prune --environment <stage|production> --config <path> [--daily 7] [--weekly 4] [--apply true --confirm "DELETE BACKUPS <environment>"]
  backup.sh restore --environment <stage|production> --manifest <path> --config <path> [--output-manifest <path>] --confirm "RESTORE <database>"`;

export function parseArguments(values) {
    const [command, ...rest] = values;
    if (!['create', 'check-fresh', 'prune', 'restore'].includes(command))
        throw new Error(usage);
    const options = { command };
    for (let index = 0; index < rest.length; index += 2) {
        const key = rest[index];
        const value = rest[index + 1];
        if (!key?.startsWith('--') || value === undefined)
            throw new Error(usage);
        options[key.slice(2)] = value;
    }
    return options;
}

function integerOption(value, fallback, name, minimum = 1) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum)
        throw new Error(`${name} must be an integer >= ${minimum}.`);
    return parsed;
}

async function writeJsonAtomic(target, value) {
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600,
    });
    await rename(temporary, target);
}

function objectPrefix(config, environment) {
    const { bucket, prefix } = parseS3Uri(config.BACKUP_S3_URI);
    return { bucket, prefix: `${prefix}/${environment}` };
}

function awsArgs(config, args) {
    return [...awsEndpointArguments(config), ...args];
}

async function migrationLedgerSha256(config, runner, prefix = '') {
    const environment = postgresEnvironment(config, prefix);
    const relation = await runner(
        'psql',
        [
            '--no-psqlrc',
            '--tuples-only',
            '--no-align',
            '--command',
            "select coalesce(to_regclass('languon_migrations.history')::text, '')",
        ],
        { env: { ...process.env, ...environment }, capture: true },
    );
    let ledger = 'not-created';
    if (relation.stdout.trim()) {
        const result = await runner(
            'psql',
            [
                '--no-psqlrc',
                '--tuples-only',
                '--no-align',
                '--command',
                "select coalesce(string_agg(created_at::text || ':' || hash, E'\\n' order by created_at), 'empty') from languon_migrations.history",
            ],
            { env: { ...process.env, ...environment }, capture: true },
        );
        ledger = result.stdout.trim();
    }
    return createHash('sha256').update(ledger).digest('hex');
}

export async function createBackup(options, dependencies = {}) {
    const runner = dependencies.runner || runCommand;
    const now = dependencies.now || new Date();
    const environment = assertEnvironment(options.environment);
    if (!options.config || !options['output-manifest']) throw new Error(usage);
    const config = assertCreateConfig(
        await readConfig(path.resolve(options.config)),
        environment,
    );
    const outputManifest = path.resolve(options['output-manifest']);
    const workspace = await mkdtemp(path.join(tmpdir(), 'languon-backup-'));
    const identifier = `${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
    const dumpPath = path.join(workspace, `${identifier}.dump`);
    const encryptedPath = `${dumpPath}.age`;
    const { bucket, prefix } = objectPrefix(config, environment);
    const encryptedKey = `${prefix}/${identifier}.dump.age`;
    const metadataKey = `${prefix}/${identifier}.metadata.json`;
    const startedAt = now.toISOString();
    try {
        const version = await runner('pg_dump', ['--version'], {
            capture: true,
        });
        const toolMajor = postgresMajor(version.stdout);
        await runner(
            'pg_dump',
            [
                '--format=custom',
                '--compress=9',
                '--no-owner',
                '--no-acl',
                '--file',
                dumpPath,
            ],
            { env: { ...process.env, ...postgresEnvironment(config) } },
        );
        await runner('pg_restore', ['--list', dumpPath], { capture: true });
        await runner('age', [
            '--encrypt',
            '--recipient',
            config.BACKUP_AGE_RECIPIENT,
            '--output',
            encryptedPath,
            dumpPath,
        ]);
        const encryptedSha256 = await sha256File(encryptedPath);
        const encryptedBytes = (await stat(encryptedPath)).size;
        const s3Uri = `s3://${bucket}/${encryptedKey}`;
        await runner(
            'aws',
            awsArgs(config, [
                's3',
                'cp',
                encryptedPath,
                s3Uri,
                '--only-show-errors',
                '--sse',
                'AES256',
                '--acl',
                'private',
                '--metadata',
                `sha256=${encryptedSha256}`,
            ]),
            { env: { ...process.env, ...awsEnvironment(config) } },
        );
        const head = await runner(
            'aws',
            awsArgs(config, [
                's3api',
                'head-object',
                '--bucket',
                bucket,
                '--key',
                encryptedKey,
                '--output',
                'json',
            ]),
            {
                env: { ...process.env, ...awsEnvironment(config) },
                capture: true,
            },
        );
        const remote = JSON.parse(head.stdout);
        if (
            Number(remote.ContentLength) !== encryptedBytes ||
            remote.Metadata?.sha256 !== encryptedSha256
        ) {
            throw new Error(
                'Uploaded backup size or checksum metadata did not match.',
            );
        }
        const completedAt = new Date().toISOString();
        const manifest = {
            schemaVersion: 1,
            kind: 'languon-postgres-backup',
            environment,
            outcome: 'success',
            startedAt,
            completedAt,
            source: {
                id: config.BACKUP_SOURCE_ID,
                database: safeDatabaseIdentity(config),
            },
            postgres: { tool: version.stdout.trim(), toolMajor },
            migrationLedgerSha256: await migrationLedgerSha256(config, runner),
            encryption: {
                client: 'age',
                server: remote.ServerSideEncryption || 'provider-default',
            },
            encryptedObject: {
                uri: s3Uri,
                bytes: encryptedBytes,
                sha256: encryptedSha256,
            },
        };
        const metadataPath = path.join(
            workspace,
            `${identifier}.metadata.json`,
        );
        await writeFile(
            metadataPath,
            `${JSON.stringify(manifest, null, 2)}\n`,
            { mode: 0o600 },
        );
        await runner(
            'aws',
            awsArgs(config, [
                's3',
                'cp',
                metadataPath,
                `s3://${bucket}/${metadataKey}`,
                '--only-show-errors',
                '--sse',
                'AES256',
                '--acl',
                'private',
            ]),
            { env: { ...process.env, ...awsEnvironment(config) } },
        );
        await writeJsonAtomic(outputManifest, manifest);
        return manifest;
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

export async function checkFresh(options, dependencies = {}) {
    if (!options.manifest) throw new Error(usage);
    const expectedEnvironment = assertEnvironment(options.environment);
    const backupPath = path.resolve(options.manifest);
    const restorePath = path.resolve(
        options['restore-manifest'] ||
            path.join(path.dirname(backupPath), 'restore-drill.latest.json'),
    );
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    const restore = JSON.parse(await readFile(restorePath, 'utf8'));
    return checkFreshEvidence({
        backup,
        restore,
        expectedEnvironment,
        maxAgeHours: integerOption(
            options['max-age-hours'],
            24,
            '--max-age-hours',
        ),
        maxRestoreAgeDays: integerOption(
            options['max-restore-age-days'],
            92,
            '--max-restore-age-days',
        ),
        now: dependencies.now || new Date(),
    });
}

async function listMetadata(config, environment, runner) {
    const { bucket, prefix } = objectPrefix(config, environment);
    const result = await runner(
        'aws',
        awsArgs(config, [
            's3api',
            'list-objects-v2',
            '--bucket',
            bucket,
            '--prefix',
            `${prefix}/`,
            '--output',
            'json',
        ]),
        { env: { ...process.env, ...awsEnvironment(config) }, capture: true },
    );
    const response = JSON.parse(result.stdout);
    if (response.IsTruncated)
        throw new Error(
            'Backup inventory is truncated; prune refuses an incomplete listing.',
        );
    return {
        bucket,
        objects: (response.Contents || []).map((object) => ({
            key: object.Key,
            lastModified: object.LastModified,
        })),
    };
}

export async function pruneBackups(options, dependencies = {}) {
    const runner = dependencies.runner || runCommand;
    const environment = assertEnvironment(options.environment);
    if (!options.config) throw new Error(usage);
    const config = assertStorageConfig(
        await readConfig(path.resolve(options.config)),
    );
    const inventory = await listMetadata(config, environment, runner);
    const deletions = selectRetentionDeletions(inventory.objects, {
        daily: integerOption(options.daily, 7, '--daily'),
        weekly: integerOption(options.weekly, 4, '--weekly'),
    });
    const apply = options.apply === 'true';
    if (apply && options.confirm !== `DELETE BACKUPS ${environment}`) {
        throw new Error(
            `Applying prune requires --confirm "DELETE BACKUPS ${environment}".`,
        );
    }
    const objectKeys = deletions.flatMap(({ key }) => [
        key,
        key.replace(/\.metadata\.json$/, '.dump.age'),
    ]);
    if (apply) {
        for (const key of objectKeys) {
            await runner(
                'aws',
                awsArgs(config, [
                    's3api',
                    'delete-object',
                    '--bucket',
                    inventory.bucket,
                    '--key',
                    key,
                ]),
                {
                    env: { ...process.env, ...awsEnvironment(config) },
                    capture: true,
                },
            );
        }
    }
    return {
        environment,
        mode: apply ? 'applied' : 'dry-run',
        retainedDaily: Number(options.daily || 7),
        retainedWeekly: Number(options.weekly || 4),
        objectKeys,
    };
}

async function assertEmptyRestoreTarget(config, runner) {
    const environment = {
        ...process.env,
        ...postgresEnvironment(config, 'RESTORE_'),
    };
    const identity = await runner(
        'psql',
        [
            '--no-psqlrc',
            '--tuples-only',
            '--no-align',
            '--command',
            'select current_database()',
        ],
        { env: environment, capture: true },
    );
    if (identity.stdout.trim() !== config.RESTORE_PGDATABASE) {
        throw new Error(
            'Connected restore database identity did not match configuration.',
        );
    }
    const tables = await runner(
        'psql',
        [
            '--no-psqlrc',
            '--tuples-only',
            '--no-align',
            '--command',
            "select count(*) from pg_catalog.pg_tables where schemaname not in ('pg_catalog', 'information_schema')",
        ],
        { env: environment, capture: true },
    );
    if (Number(tables.stdout.trim()) !== 0)
        throw new Error('Restore target is not empty.');
}

export async function restoreBackup(options, dependencies = {}) {
    const runner = dependencies.runner || runCommand;
    const now = dependencies.now || new Date();
    const environment = assertEnvironment(options.environment);
    if (!options.manifest || !options.config) throw new Error(usage);
    const backupPath = path.resolve(options.manifest);
    const backup = validateBackupManifest(
        JSON.parse(await readFile(backupPath, 'utf8')),
    );
    if (backup.environment !== environment)
        throw new Error(
            'Backup environment does not match restore environment.',
        );
    const config = assertRestoreConfig(
        await readConfig(path.resolve(options.config)),
        environment,
    );
    await assertPrivateFile(
        config.BACKUP_AGE_IDENTITY_FILE,
        'Backup age identity',
    );
    if (options.confirm !== `RESTORE ${config.RESTORE_PGDATABASE}`) {
        throw new Error(
            `Restore requires --confirm "RESTORE ${config.RESTORE_PGDATABASE}".`,
        );
    }
    await assertEmptyRestoreTarget(config, runner);
    const workspace = await mkdtemp(path.join(tmpdir(), 'languon-restore-'));
    const encryptedPath = path.join(workspace, 'backup.dump.age');
    const dumpPath = path.join(workspace, 'backup.dump');
    const startedAt = now.toISOString();
    try {
        await runner(
            'aws',
            awsArgs(config, [
                's3',
                'cp',
                backup.encryptedObject.uri,
                encryptedPath,
                '--only-show-errors',
            ]),
            { env: { ...process.env, ...awsEnvironment(config) } },
        );
        if (
            (await sha256File(encryptedPath)) !== backup.encryptedObject.sha256
        ) {
            throw new Error(
                'Downloaded encrypted backup checksum did not match manifest.',
            );
        }
        await runner('age', [
            '--decrypt',
            '--identity',
            config.BACKUP_AGE_IDENTITY_FILE,
            '--output',
            dumpPath,
            encryptedPath,
        ]);
        const restoreVersion = await runner('pg_restore', ['--version'], {
            capture: true,
        });
        const restoreToolMajor = postgresMajor(restoreVersion.stdout);
        if (restoreToolMajor !== backup.postgres.toolMajor) {
            throw new Error(
                'pg_restore major version does not match the backup tool major version.',
            );
        }
        await runner('pg_restore', ['--list', dumpPath], { capture: true });
        // Download/decryption can be slow. Recheck immediately before mutation so a
        // target populated after the initial guard is rejected as well.
        await assertEmptyRestoreTarget(config, runner);
        await runner(
            'pg_restore',
            [
                '--exit-on-error',
                '--no-owner',
                '--no-acl',
                '--dbname',
                config.RESTORE_PGDATABASE,
                dumpPath,
            ],
            {
                env: {
                    ...process.env,
                    ...postgresEnvironment(config, 'RESTORE_'),
                },
            },
        );
        const restoredTables = await runner(
            'psql',
            [
                '--no-psqlrc',
                '--tuples-only',
                '--no-align',
                '--command',
                "select count(*) from pg_catalog.pg_tables where schemaname not in ('pg_catalog', 'information_schema')",
            ],
            {
                env: {
                    ...process.env,
                    ...postgresEnvironment(config, 'RESTORE_'),
                },
                capture: true,
            },
        );
        if (
            !Number.isSafeInteger(Number(restoredTables.stdout.trim())) ||
            Number(restoredTables.stdout.trim()) < 1
        ) {
            throw new Error(
                'Restored database did not contain any application tables.',
            );
        }
        const restoredLedgerSha256 = await migrationLedgerSha256(
            config,
            runner,
            'RESTORE_',
        );
        const completedAt = new Date().toISOString();
        const result = {
            schemaVersion: 1,
            kind: 'languon-postgres-restore-drill',
            environment,
            outcome: 'success',
            startedAt,
            completedAt,
            target: {
                id: config.RESTORE_TARGET_ID || 'disposable',
                database: safeDatabaseIdentity(config, 'RESTORE_'),
            },
            backup: {
                objectUri: backup.encryptedObject.uri,
                sha256: backup.encryptedObject.sha256,
                completedAt: backup.completedAt,
                postgresToolMajor: restoreToolMajor,
            },
            integrity: {
                restoredTableCount: Number(restoredTables.stdout.trim()),
                migrationLedgerSha256: restoredLedgerSha256,
            },
            elapsedSeconds: Math.max(
                0,
                Math.round(
                    (Date.parse(completedAt) - Date.parse(startedAt)) / 1000,
                ),
            ),
        };
        const output = path.resolve(
            options['output-manifest'] ||
                path.join(
                    path.dirname(backupPath),
                    'restore-drill.latest.json',
                ),
        );
        await writeJsonAtomic(output, result);
        return result;
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

export async function main(values = process.argv.slice(2)) {
    const options = parseArguments(values);
    const handlers = {
        create: createBackup,
        'check-fresh': checkFresh,
        prune: pruneBackups,
        restore: restoreBackup,
    };
    const result = await handlers[options.command](options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(
            `Backup command failed: ${sanitizeError(error)}\n`,
        );
        process.exitCode = 1;
    });
}
