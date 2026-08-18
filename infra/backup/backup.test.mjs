import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBackup, restoreBackup } from './cli.mjs';
import {
    assertCreateConfig,
    assertRestoreConfig,
    checkFreshEvidence,
    parseEnvironmentFile,
    selectRetentionDeletions,
} from './lib.mjs';

const checksum = 'a'.repeat(64);

function backup(overrides = {}) {
    return {
        schemaVersion: 1,
        kind: 'languon-postgres-backup',
        environment: 'production',
        outcome: 'success',
        completedAt: '2026-08-18T10:00:00.000Z',
        postgres: { toolMajor: 17 },
        encryptedObject: {
            uri: 's3://private/languon/production/x.dump.age',
            bytes: 123,
            sha256: checksum,
        },
        migrationLedgerSha256: 'b'.repeat(64),
        ...overrides,
    };
}

function restore(overrides = {}) {
    return {
        schemaVersion: 1,
        kind: 'languon-postgres-restore-drill',
        environment: 'production',
        outcome: 'success',
        completedAt: '2026-08-01T10:00:00.000Z',
        backup: { sha256: checksum, postgresToolMajor: 17 },
        ...overrides,
    };
}

test('freshness gate requires a recent backup and compatible restore drill', () => {
    const result = checkFreshEvidence({
        backup: backup(),
        restore: restore(),
        now: new Date('2026-08-18T20:00:00.000Z'),
    });
    assert.equal(result.backupAgeHours, 10);
    assert.equal(result.restoreAgeDays, 17.42);
    assert.equal(result.objectSha256, checksum);
});

test('freshness gate binds evidence to the required environment', () => {
    assert.throws(
        () =>
            checkFreshEvidence({
                backup: backup({ environment: 'stage' }),
                restore: restore({ environment: 'stage' }),
                expectedEnvironment: 'production',
                now: new Date('2026-08-18T20:00:00.000Z'),
            }),
        /does not match required environment production/,
    );
});

test('freshness gate rejects stale, future, and incompatible evidence', () => {
    assert.throws(
        () =>
            checkFreshEvidence({
                backup: backup(),
                restore: restore(),
                now: new Date('2026-08-20T20:00:00.000Z'),
            }),
        /limit is 24/,
    );
    assert.throws(
        () =>
            checkFreshEvidence({
                backup: backup({ completedAt: '2026-08-19T00:10:00.000Z' }),
                restore: restore(),
                now: new Date('2026-08-18T20:00:00.000Z'),
            }),
        /future/,
    );
    assert.throws(
        () =>
            checkFreshEvidence({
                backup: backup(),
                restore: restore({
                    backup: { sha256: checksum, postgresToolMajor: 16 },
                }),
                now: new Date('2026-08-18T20:00:00.000Z'),
            }),
        /different PostgreSQL tool major/,
    );
});

test('restore target must be explicit, disposable, and strongly named', () => {
    const base = {
        RESTORE_PGHOST: 'restore.internal',
        RESTORE_PGDATABASE: 'languon_restore_a1b2c3d4',
        RESTORE_PGUSER: 'restore',
        RESTORE_PGPASSWORD: 'secret',
        RESTORE_TARGET_DISPOSABLE: 'true',
        BACKUP_AGE_IDENTITY_FILE: '/secure/key',
        AWS_ACCESS_KEY_ID: 'id',
        AWS_SECRET_ACCESS_KEY: 'secret',
    };
    assert.equal(assertRestoreConfig(base), base);
    assert.throws(
        () =>
            assertRestoreConfig({
                ...base,
                RESTORE_TARGET_DISPOSABLE: 'false',
            }),
        /required/,
    );
    assert.throws(
        () => assertRestoreConfig({ ...base, RESTORE_PGDATABASE: 'languon' }),
        /must use/,
    );
});

test('production backup and restore require verified PostgreSQL TLS', () => {
    const create = {
        PGHOST: 'database.internal',
        PGDATABASE: 'languon',
        PGUSER: 'backup',
        PGPASSWORD: 'secret',
        BACKUP_SOURCE_ID: 'data-vps',
        BACKUP_S3_URI: 's3://private/languon',
        BACKUP_AGE_RECIPIENT: 'age1test',
        AWS_ACCESS_KEY_ID: 'id',
        AWS_SECRET_ACCESS_KEY: 'secret',
    };
    assert.throws(
        () =>
            assertCreateConfig(
                { ...create, PGSSLMODE: 'require' },
                'production',
            ),
        /PGSSLMODE=verify-full and PGSSLROOTCERT/,
    );
    assert.equal(
        assertCreateConfig(
            {
                ...create,
                PGSSLMODE: 'verify-full',
                PGSSLROOTCERT: '/secure/postgres-ca.crt',
            },
            'production',
        ).PGSSLMODE,
        'verify-full',
    );

    const restoreConfig = {
        RESTORE_PGHOST: 'restore.internal',
        RESTORE_PGDATABASE: 'languon_restore_a1b2c3d4',
        RESTORE_PGUSER: 'restore',
        RESTORE_PGPASSWORD: 'secret',
        RESTORE_TARGET_DISPOSABLE: 'true',
        BACKUP_AGE_IDENTITY_FILE: '/secure/key',
        AWS_ACCESS_KEY_ID: 'id',
        AWS_SECRET_ACCESS_KEY: 'secret',
    };
    assert.throws(
        () =>
            assertRestoreConfig(
                { ...restoreConfig, RESTORE_PGSSLMODE: 'require' },
                'production',
            ),
        /RESTORE_PGSSLMODE=verify-full and RESTORE_PGSSLROOTCERT/,
    );
});

test('retention keeps seven recent daily backups and four distinct older weeks', () => {
    const objects = Array.from({ length: 40 }, (_, index) => ({
        key: `languon/production/${String(index).padStart(2, '0')}.metadata.json`,
        lastModified: new Date(Date.UTC(2026, 7, 18 - index)).toISOString(),
    }));
    const deletions = selectRetentionDeletions(objects);
    assert.equal(deletions.length, 29);
    assert.equal(deletions[0].key, 'languon/production/08.metadata.json');
    assert.equal(
        deletions.some(({ key }) => key.endsWith('/06.metadata.json')),
        false,
    );
    assert.equal(
        deletions.some(({ key }) => key.endsWith('/09.metadata.json')),
        false,
    );
});

test('environment parser does not expand shell expressions', () => {
    const parsed = parseEnvironmentFile(
        "PGPASSWORD='$(do-not-run)'\nAWS_SECRET_ACCESS_KEY=value\n",
    );
    assert.equal(parsed.PGPASSWORD, '$(do-not-run)');
});

test('create writes evidence only after encrypted private upload is verified', async (context) => {
    const directory = await mkdtemp(
        path.join(tmpdir(), 'languon-backup-test-'),
    );
    context.after(() => rm(directory, { recursive: true, force: true }));
    const configPath = path.join(directory, 'backup.env');
    const manifestPath = path.join(directory, 'latest.json');
    await writeFile(
        configPath,
        [
            'PGHOST=database.internal',
            'PGDATABASE=languon',
            'PGUSER=backup',
            'PGPASSWORD=not-written-to-evidence',
            'PGSSLMODE=verify-full',
            'PGSSLROOTCERT=/secure/postgres-ca.crt',
            'BACKUP_SOURCE_ID=data-vps-test',
            'BACKUP_S3_URI=s3://private/languon',
            'BACKUP_AGE_RECIPIENT=age1test',
            'AWS_ACCESS_KEY_ID=test',
            'AWS_SECRET_ACCESS_KEY=not-written-to-evidence',
        ].join('\n'),
        { mode: 0o600 },
    );
    let uploadedBytes;
    let uploadedChecksum;
    const calls = [];
    const runner = async (command, args, options = {}) => {
        calls.push([command, args, options]);
        if (command === 'pg_dump' && args[0] === '--version') {
            return { stdout: 'pg_dump (PostgreSQL) 17.4\n', stderr: '' };
        }
        if (command === 'pg_dump') {
            await writeFile(args[args.indexOf('--file') + 1], 'custom-dump');
            return { stdout: '', stderr: '' };
        }
        if (command === 'age') {
            await writeFile(
                args[args.indexOf('--output') + 1],
                'encrypted-dump',
            );
            return { stdout: '', stderr: '' };
        }
        if (command === 'aws' && args.includes('head-object')) {
            return {
                stdout: JSON.stringify({
                    ContentLength: uploadedBytes,
                    Metadata: { sha256: uploadedChecksum },
                    ServerSideEncryption: 'AES256',
                }),
                stderr: '',
            };
        }
        if (
            command === 'aws' &&
            args[0] === 's3' &&
            args[1] === 'cp' &&
            args[2].endsWith('.age')
        ) {
            uploadedBytes = Buffer.byteLength('encrypted-dump');
            uploadedChecksum = args[args.indexOf('--metadata') + 1].slice(
                'sha256='.length,
            );
            return { stdout: '', stderr: '' };
        }
        if (command === 'psql') return { stdout: '\n', stderr: '' };
        return { stdout: '', stderr: '' };
    };

    await createBackup(
        {
            environment: 'production',
            config: configPath,
            'output-manifest': manifestPath,
        },
        { runner, now: new Date('2026-08-18T10:00:00.000Z') },
    );

    const serialized = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(serialized);
    assert.equal(manifest.outcome, 'success');
    assert.equal(manifest.encryption.client, 'age');
    assert.equal(manifest.encryption.server, 'AES256');
    assert.equal(serialized.includes('not-written-to-evidence'), false);
    const encryptedUpload = calls.find(
        ([command, args]) =>
            command === 'aws' && args[0] === 's3' && args[2]?.endsWith('.age'),
    );
    assert.ok(encryptedUpload[1].includes('--acl'));
    assert.ok(encryptedUpload[1].includes('private'));
    assert.ok(encryptedUpload[1].includes('--sse'));
    const dump = calls.find(
        ([command, args]) => command === 'pg_dump' && args[0] !== '--version',
    );
    assert.equal(dump[2].env.PGSSLMODE, 'verify-full');
    assert.equal(dump[2].env.PGSSLROOTCERT, '/secure/postgres-ca.crt');
});

test('restore accepts only a confirmed empty disposable target and records integrity', async (context) => {
    const directory = await mkdtemp(
        path.join(tmpdir(), 'languon-restore-test-'),
    );
    context.after(() => rm(directory, { recursive: true, force: true }));
    const configPath = path.join(directory, 'restore.env');
    const identityPath = path.join(directory, 'age-identity.txt');
    const backupPath = path.join(directory, 'latest.json');
    const outputPath = path.join(directory, 'restore-drill.latest.json');
    const encrypted = 'encrypted-dump';
    const encryptedSha256 = createHash('sha256')
        .update(encrypted)
        .digest('hex');
    await writeFile(
        configPath,
        [
            'RESTORE_TARGET_DISPOSABLE=true',
            'RESTORE_TARGET_ID=automated-test',
            'RESTORE_PGHOST=restore.internal',
            'RESTORE_PGDATABASE=languon_restore_a1b2c3d4',
            'RESTORE_PGUSER=restore',
            'RESTORE_PGPASSWORD=not-written-to-evidence',
            'RESTORE_PGSSLMODE=verify-full',
            'RESTORE_PGSSLROOTCERT=/secure/postgres-ca.crt',
            `BACKUP_AGE_IDENTITY_FILE=${identityPath}`,
            'AWS_ACCESS_KEY_ID=test',
            'AWS_SECRET_ACCESS_KEY=not-written-to-evidence',
        ].join('\n'),
        { mode: 0o600 },
    );
    await writeFile(identityPath, 'AGE-SECRET-KEY-TEST', { mode: 0o600 });
    await writeFile(
        backupPath,
        JSON.stringify(
            backup({
                encryptedObject: {
                    uri: 's3://private/languon/production/test.dump.age',
                    bytes: Buffer.byteLength(encrypted),
                    sha256: encryptedSha256,
                },
            }),
        ),
    );
    let restored = false;
    const runnerCalls = [];
    const runner = async (command, args, options = {}) => {
        runnerCalls.push([command, args, options]);
        if (command === 'aws') {
            await writeFile(args[3], encrypted);
            return { stdout: '', stderr: '' };
        }
        if (command === 'age') {
            await writeFile(args[args.indexOf('--output') + 1], 'custom-dump');
            return { stdout: '', stderr: '' };
        }
        if (command === 'pg_restore' && args[0] === '--version') {
            return { stdout: 'pg_restore (PostgreSQL) 17.4\n', stderr: '' };
        }
        if (command === 'pg_restore' && args.includes('--dbname'))
            restored = true;
        if (command === 'psql') {
            const query = args[args.indexOf('--command') + 1];
            if (query === 'select current_database()') {
                return { stdout: 'languon_restore_a1b2c3d4\n', stderr: '' };
            }
            if (query.includes('count(*)')) {
                return { stdout: restored ? '3\n' : '0\n', stderr: '' };
            }
            if (query.includes('to_regclass'))
                return { stdout: '\n', stderr: '' };
        }
        return { stdout: '', stderr: '' };
    };

    await assert.rejects(
        restoreBackup(
            {
                environment: 'production',
                manifest: backupPath,
                config: configPath,
                confirm: 'RESTORE wrong',
            },
            { runner },
        ),
        /requires --confirm/,
    );
    const result = await restoreBackup(
        {
            environment: 'production',
            manifest: backupPath,
            config: configPath,
            'output-manifest': outputPath,
            confirm: 'RESTORE languon_restore_a1b2c3d4',
        },
        { runner, now: new Date('2026-08-18T10:00:00.000Z') },
    );
    const serialized = await readFile(outputPath, 'utf8');
    assert.equal(result.integrity.restoredTableCount, 3);
    assert.match(result.integrity.migrationLedgerSha256, /^[a-f0-9]{64}$/);
    assert.equal(serialized.includes('not-written-to-evidence'), false);
    const restoreCall = runnerCalls.find(
        ([command, args]) =>
            command === 'pg_restore' && args.includes('--dbname'),
    );
    assert.equal(restoreCall[2].env.PGSSLMODE, 'verify-full');
    assert.equal(restoreCall[2].env.PGSSLROOTCERT, '/secure/postgres-ca.crt');
});
