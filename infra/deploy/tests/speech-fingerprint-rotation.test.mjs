import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import {
    normalizeRetainedSpeechFingerprintSecrets,
    parseEnvironmentFile,
    assertDeployConfig,
} from '../lib/config.mjs';
import { Deployment } from '../lib/deployment.mjs';

const execute = promisify(execFile);
const oldKey = `fake-old-key-${'a'.repeat(32)}`;
const nextKey = `fake-next-key-${'b'.repeat(32)}\n"$\\`;

test('retained speech keys validate bounded JSON without including values in errors', async () => {
    assert.equal(normalizeRetainedSpeechFingerprintSecrets(), '[]');
    assert.equal(normalizeRetainedSpeechFingerprintSecrets(''), '[]');
    assert.deepEqual(
        JSON.parse(
            normalizeRetainedSpeechFingerprintSecrets(
                JSON.stringify([oldKey, nextKey]),
            ),
        ),
        [oldKey, nextKey],
    );
    for (const value of [
        '{"secret":"DO_NOT_ECHO"}',
        '["DO_NOT_ECHO_SHORT"]',
        '["DO_NOT_ECHO_MALFORMED"',
        JSON.stringify(Array(17).fill(oldKey)),
        JSON.stringify(['x'.repeat(4097)]),
        '[1]',
        'null',
    ]) {
        assert.throws(
            () => normalizeRetainedSpeechFingerprintSecrets(value),
            (error) =>
                error.message ===
                'Invalid retained speech fingerprint configuration.',
        );
    }
    const config = parseEnvironmentFile(
        await readFile('infra/deploy/stage.env.example', 'utf8'),
    );
    assert.equal(
        assertDeployConfig('stage', config)
            .DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS,
        '[]',
    );
    assert.throws(
        () =>
            assertDeployConfig('stage', {
                ...config,
                DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS:
                    '["DO_NOT_ECHO_SHORT"]',
            }),
        (error) =>
            error.message ===
            'Invalid retained speech fingerprint configuration.',
    );
});

test('protected env parsing and deployment preserve escaped JSON without shell evaluation', () => {
    const value = JSON.stringify([oldKey, nextKey]);
    const config = parseEnvironmentFile(
        `DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS=${value}\n`,
    );
    const deployment = new Deployment({
        environment: 'stage',
        config,
        manifest: {
            images: {
                backend: 'fixture',
                web: 'fixture',
                admin: 'fixture',
                migrator: 'fixture',
            },
        },
        repositoryRoot: '/tmp/repository',
        runtimeDirectory: '/tmp/runtime',
        stateDirectory: '/tmp/state',
    });
    const environment = deployment.commandEnvironment('blue');
    assert.deepEqual(
        JSON.parse(environment.DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS),
        [oldKey, nextKey],
    );
    assert.ok(
        !environment.DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS.includes(
            '\n',
        ),
    );
});

test('resolved production Compose injects retained keys into API and speech worker only', async () => {
    const source = await readFile(
        'infra/deploy/compose/apps.compose.yaml',
        'utf8',
    );
    const required = [...source.matchAll(/\$\{([A-Z_0-9]+):\?[^}]*\}/g)].map(
        (match) => match[1],
    );
    const env = {
        ...process.env,
        ...Object.fromEntries(required.map((key) => [key, 'fixture'])),
    };
    env.EDGE_SUBNET = '172.30.20.0/24';
    env.DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS = JSON.stringify([
        oldKey,
        nextKey,
    ]);
    const { stdout } = await execute(
        'docker',
        [
            'compose',
            '--env-file',
            '/dev/null',
            '-f',
            'infra/deploy/compose/apps.compose.yaml',
            'config',
            '--format',
            'json',
        ],
        { env },
    );
    // Docker's config renderer doubles every dollar for safe re-interpolation;
    // undo that output-only escaping before inspecting the loaded model values.
    // https://github.com/docker/compose/blob/main/cmd/compose/config.go (runConfig)
    const { services } = JSON.parse(stdout.replaceAll('$$', '$'));
    for (const name of ['backend', 'dictionary-worker']) {
        assert.deepEqual(
            JSON.parse(
                services[name].environment
                    .DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS,
            ),
            [oldKey, nextKey],
        );
    }
    for (const name of ['web', 'admin', 'account-purge-worker']) {
        assert.equal(
            services[name].environment
                ?.DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS,
            undefined,
        );
    }
});
