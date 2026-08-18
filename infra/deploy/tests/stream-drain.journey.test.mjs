import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { runCommand } from '../lib/runner.mjs';

const enabled = process.env.LANGUON_DEPLOY_E2E === 'true';
const root = path.resolve('.');
const prefix = 'languon-stream-test';

const upstream = (slot) =>
    [
        `upstream languon_web { server ${slot}-web:3333; }`,
        `upstream languon_backend { server ${slot}-backend:4000; }`,
        `upstream languon_admin { server ${slot}-admin:3001; }`,
        '',
    ].join('\n');

async function assertLocalDocker() {
    assert.equal(
        process.env.DOCKER_HOST,
        undefined,
        'DOCKER_HOST must be unset',
    );
    const { stdout } = await runCommand(
        'docker',
        [
            'context',
            'inspect',
            '--format',
            '{{(index .Endpoints "docker").Host}}',
        ],
        { capture: true },
    );
    assert.match(stdout.trim(), /^unix:\/\//);
}

test(
    'an open stream remains on the old worker while new traffic switches',
    {
        skip: !enabled,
        timeout: 120_000,
    },
    async () => {
        await assertLocalDocker();
        const runtime = await mkdtemp(
            path.join(os.tmpdir(), 'languon-stream-runtime-'),
        );
        const fixture = path.join(
            root,
            'infra/deploy/tests/fixtures/stream.compose.yaml',
        );
        const edge = path.join(root, 'infra/deploy/compose/edge.compose.yaml');
        const tlsCertificatePath = path.join(runtime, 'tls.crt');
        const tlsPrivateKeyPath = path.join(runtime, 'tls.key');
        await runCommand('openssl', [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-days',
            '1',
            '-subj',
            '/CN=localhost',
            '-addext',
            'subjectAltName=DNS:localhost,IP:127.0.0.1',
            '-keyout',
            tlsPrivateKeyPath,
            '-out',
            tlsCertificatePath,
        ]);
        await chmod(tlsPrivateKeyPath, 0o600);
        await chmod(tlsCertificatePath, 0o600);
        const env = {
            ...process.env,
            DEPLOY_ENVIRONMENT: 'stage',
            DEPLOY_PROJECT_PREFIX: prefix,
            DEPLOY_RUNTIME_DIR: runtime,
            PUBLIC_BIND_ADDRESS: '127.0.0.1',
            PUBLIC_HTTP_PORT: '18090',
            PUBLIC_HTTPS_PORT: '18490',
            ADMIN_BIND_ADDRESS: '127.0.0.1',
            ADMIN_PORT: '18091',
            TLS_CERTIFICATE_PATH: tlsCertificatePath,
            TLS_PRIVATE_KEY_PATH: tlsPrivateKeyPath,
            STREAM_FIXTURE_SERVER: path.join(
                root,
                'infra/deploy/tests/fixtures/stream-server.mjs',
            ),
        };
        const compose = (file, project, args) =>
            runCommand(
                'docker',
                ['compose', '--file', file, '--project-name', project, ...args],
                { env },
            );
        try {
            const cachedImage = 'languon-backend:packaging-test';
            const hasCachedImage = await runCommand(
                'docker',
                ['image', 'inspect', cachedImage],
                { capture: true },
            ).then(
                () => true,
                () => false,
            );
            if (hasCachedImage) {
                env.STREAM_FIXTURE_IMAGE = cachedImage;
            } else {
                await runCommand(
                    'docker',
                    [
                        'build',
                        '--file',
                        'infra/deploy/tests/fixtures/stream.Dockerfile',
                        '--tag',
                        'languon-deploy-stream-fixture:local',
                        '.',
                    ],
                    { cwd: root },
                );
            }
            await runCommand('docker', [
                'network',
                'create',
                '--subnet',
                '172.30.251.0/24',
                `${prefix}-edge`,
            ]);
            await runCommand('docker', ['network', 'create', `${prefix}-data`]);
            await writeFile(
                path.join(runtime, 'active-upstream.conf'),
                upstream('blue'),
            );
            await compose(fixture, `${prefix}-apps`, [
                'up',
                '--detach',
                'blue-backend',
                'blue-web',
                'blue-admin',
            ]);
            await compose(edge, `${prefix}-edge`, ['up', '--detach', '--wait']);

            const stream = spawn('curl', [
                '--fail',
                '--silent',
                '--no-buffer',
                '--cacert',
                tlsCertificatePath,
                'https://localhost:18490/api/stream',
            ]);
            let streamOutput = '';
            const firstChunk = new Promise((resolve, reject) => {
                stream.stdout.on('data', (chunk) => {
                    streamOutput += chunk;
                    if (streamOutput.includes('blue:start')) resolve();
                });
                stream.on('error', reject);
            });
            await firstChunk;
            await compose(fixture, `${prefix}-apps`, [
                'up',
                '--detach',
                'green-backend',
                'green-web',
                'green-admin',
            ]);
            await writeFile(
                path.join(runtime, 'active-upstream.conf'),
                upstream('green'),
            );
            await runCommand('docker', [
                'exec',
                `${prefix}-edge-nginx`,
                'nginx',
                '-t',
            ]);
            await runCommand('docker', [
                'exec',
                `${prefix}-edge-nginx`,
                'nginx',
                '-s',
                'reload',
            ]);
            let current = '';
            for (
                let attempt = 0;
                attempt < 20 && current !== 'green';
                attempt += 1
            ) {
                current = await runCommand(
                    'curl',
                    [
                        '--fail',
                        '--silent',
                        '--cacert',
                        tlsCertificatePath,
                        'https://localhost:18490/api/who',
                    ],
                    { capture: true },
                ).then(({ stdout }) => stdout);
                if (current !== 'green') {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
            assert.equal(current, 'green');
            const oldWorker = await runCommand('docker', [
                'exec',
                `${prefix}-edge-nginx`,
                'sh',
                '-c',
                "ps | grep -q '[w]orker process is shutting down'",
            ]).then(
                () => true,
                () => false,
            );
            assert.equal(oldWorker, true);
            await new Promise((resolve, reject) => {
                stream.on('close', (code) =>
                    code === 0 ? resolve() : reject(new Error(`curl ${code}`)),
                );
            });
            assert.equal(streamOutput, 'blue:start\nblue:end\n');
            await compose(fixture, `${prefix}-apps`, [
                'stop',
                'blue-backend',
                'blue-web',
                'blue-admin',
            ]);
        } finally {
            await compose(edge, `${prefix}-edge`, [
                'down',
                '--remove-orphans',
            ]).catch(() => {});
            await compose(fixture, `${prefix}-apps`, [
                'down',
                '--remove-orphans',
            ]).catch(() => {});
            await runCommand('docker', ['network', 'rm', `${prefix}-edge`], {
                capture: true,
            }).catch(() => {});
            await runCommand('docker', ['network', 'rm', `${prefix}-data`], {
                capture: true,
            }).catch(() => {});
            await rm(runtime, { recursive: true, force: true });
        }
    },
);
