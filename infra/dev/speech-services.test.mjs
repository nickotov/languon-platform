import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);

test('development speech storage renders private, persistent and bucket-scoped', async () => {
    const { stdout } = await execute(
        'docker',
        [
            'compose',
            '--env-file',
            '/dev/null',
            '--profile',
            'apps',
            'config',
            '--format',
            'json',
        ],
        {
            env: {
                ...process.env,
                SPEECH_DEV_MINIO_PORT: '9000',
                SPEECH_DEV_MINIO_CONSOLE_PORT: '9001',
            },
        },
    );
    const { services, volumes } = JSON.parse(stdout);
    assert.equal(services.minio.ports.length, 2);
    for (const port of services.minio.ports) {
        assert.equal(port.host_ip, '127.0.0.1');
    }
    assert.equal(services.minio.ports[0].published, '9000');
    assert.equal(services.minio.ports[1].published, '9001');
    assert.match(
        services.minio.image,
        /^heifeng\/minio@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e$/,
    );
    assert.match(
        services['minio-init'].image,
        /^heifeng\/mc@sha256:aead63c77f9db9107f1696fb08ecb0faeda23729cde94b0f663edf4fe09728e3$/,
    );
    assert.ok(volumes['speech-minio-data']);
    assert.equal(services.minio.volumes[0].type, 'volume');
    const initCommand = services['minio-init'].command.join(' ');
    assert.match(initCommand, /version enable speech-dev\/languon-speech-dev/);
    assert.match(
        initCommand,
        /anonymous set none speech-dev\/languon-speech-dev/,
    );
    assert.match(initCommand, /admin policy attach speech-dev speech-api/);
    assert.equal(
        services.backend.environment.DICTIONARY_AUDIO_S3_ENDPOINT,
        'http://minio:9000',
    );
    assert.equal(
        services.backend.depends_on['minio-init'].condition,
        'service_completed_successfully',
    );

    const policy = JSON.parse(
        await readFile(
            new URL('./speech-storage-policy.json', import.meta.url),
            'utf8',
        ),
    );
    const actions = policy.Statement.flatMap((entry) => entry.Action);
    assert.ok(actions.includes('s3:DeleteObjectVersion'));
    assert.ok(actions.includes('s3:ListBucketVersions'));
    assert.ok(!actions.some((action) => action.includes('*')));
    for (const statement of policy.Statement) {
        assert.equal(statement.Effect, 'Allow');
        assert.ok(
            statement.Resource.every(
                (resource) =>
                    resource === 'arn:aws:s3:::languon-speech-dev' ||
                    resource === 'arn:aws:s3:::languon-speech-dev/*',
            ),
        );
    }
    assert.notEqual(
        services.backend.environment.DICTIONARY_AUDIO_S3_ACCESS_KEY_ID,
        services.minio.environment.MINIO_ROOT_USER,
    );
});
