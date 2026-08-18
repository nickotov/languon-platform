import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCommand } from '../lib/runner.mjs';

const enabled = process.env.LANGUON_DEPLOY_E2E === 'true';
const image =
    'redis:8-alpine@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241';

test(
    'production Redis accepts the real rate limiter over TLS with restricted ACLs',
    { skip: !enabled, timeout: 120_000 },
    async () => {
        assert.equal(
            process.env.DOCKER_HOST,
            undefined,
            'DOCKER_HOST must be unset',
        );
        const endpoint = await runCommand(
            'docker',
            [
                'context',
                'inspect',
                '--format',
                '{{(index .Endpoints "docker").Host}}',
            ],
            { capture: true },
        );
        assert.match(endpoint.stdout.trim(), /^unix:\/\//);
        const directory = await mkdtemp(
            path.join(os.tmpdir(), 'languon-redis-tls-'),
        );
        const name = `languon-redis-tls-${randomUUID().slice(0, 12)}`;
        const appPassword = 'disposable-application-password';
        const healthPassword = 'disposable-health-password';
        try {
            await runCommand('openssl', [
                'req',
                '-x509',
                '-newkey',
                'rsa:2048',
                '-nodes',
                '-days',
                '1',
                '-subj',
                '/CN=Languon disposable CA',
                '-keyout',
                path.join(directory, 'ca.key'),
                '-out',
                path.join(directory, 'ca.crt'),
            ]);
            await runCommand('openssl', [
                'req',
                '-newkey',
                'rsa:2048',
                '-nodes',
                '-subj',
                '/CN=localhost',
                '-keyout',
                path.join(directory, 'server.key'),
                '-out',
                path.join(directory, 'server.csr'),
            ]);
            await writeFile(
                path.join(directory, 'server.ext'),
                'subjectAltName=DNS:localhost,IP:127.0.0.1\n',
                { mode: 0o600 },
            );
            await runCommand('openssl', [
                'x509',
                '-req',
                '-days',
                '1',
                '-in',
                path.join(directory, 'server.csr'),
                '-CA',
                path.join(directory, 'ca.crt'),
                '-CAkey',
                path.join(directory, 'ca.key'),
                '-CAcreateserial',
                '-extfile',
                path.join(directory, 'server.ext'),
                '-out',
                path.join(directory, 'server.crt'),
            ]);
            const acl = (
                await readFile(
                    'infra/deploy/redis.production.acl.example',
                    'utf8',
                )
            )
                .replace('replace-with-application-password', appPassword)
                .replace('replace-with-health-only-password', healthPassword);
            await writeFile(path.join(directory, 'redis.acl'), acl, {
                mode: 0o644,
            });
            await chmod(path.join(directory, 'server.key'), 0o644);

            await runCommand('docker', [
                'run',
                '--detach',
                '--name',
                name,
                '--publish',
                '127.0.0.1::6379',
                '--volume',
                `${directory}:/tls:ro`,
                image,
                'redis-server',
                '--port',
                '0',
                '--tls-port',
                '6379',
                '--tls-cert-file',
                '/tls/server.crt',
                '--tls-key-file',
                '/tls/server.key',
                '--tls-ca-cert-file',
                '/tls/ca.crt',
                '--tls-auth-clients',
                'no',
                '--aclfile',
                '/tls/redis.acl',
            ]);
            const published = await runCommand(
                'docker',
                ['port', name, '6379/tcp'],
                { capture: true },
            );
            const port = published.stdout.trim().match(/:(\d+)$/)?.[1];
            if (!port) throw new Error('Redis test port was not published.');
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const ready = await runCommand(
                    'docker',
                    [
                        'exec',
                        name,
                        'redis-cli',
                        '--tls',
                        '--cacert',
                        '/tls/ca.crt',
                        '--user',
                        'languon_health',
                        '-a',
                        healthPassword,
                        'ping',
                    ],
                    { capture: true },
                ).then(
                    ({ stdout }) => stdout.includes('PONG'),
                    () => false,
                );
                if (ready) break;
                await new Promise((resolve) => setTimeout(resolve, 250));
                if (attempt === 19)
                    throw new Error('Redis TLS did not become ready.');
            }
            await runCommand(
                'pnpm',
                [
                    '--filter',
                    '@languon/backend',
                    'exec',
                    'vitest',
                    'run',
                    'tests/integration/modules/authentication/infrastructure/production-redis-tls-acl.test.ts',
                ],
                {
                    env: {
                        ...process.env,
                        ALLOW_PRODUCTION_REDIS_TLS_TESTS: 'true',
                        AUTH_TEST_PRODUCTION_REDIS_URL: `rediss://languon_app:${appPassword}@localhost:${port}/0`,
                        NODE_EXTRA_CA_CERTS: path.join(directory, 'ca.crt'),
                    },
                },
            );
        } finally {
            await runCommand('docker', ['rm', '--force', name]).catch(() => {});
        }
    },
);
