import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCommand } from '../lib/runner.mjs';

// @user-flow-revision admin-user-management sha256:43c037477d75d58d

const enabled = process.env.LANGUON_DEPLOY_E2E === 'true';
const nginxImage =
    'nginx:1.29.1-alpine@sha256:42a516af16b852e33b7682d5ef8acbd5d13fe08fecadc7ed98605ba5e3b26ab8';
const nodeImage =
    'node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03';

// @user-flow admin-user-management/admin-private-edge-authentication
test(
    'private edge composes Basic authentication with application bearer authorization',
    { skip: !enabled, timeout: 120_000 },
    async () => {
        await assertLocalDocker();
        const suffix = randomUUID().slice(0, 12);
        const network = `languon-admin-edge-${suffix}`;
        const fixture = `${network}-fixture`;
        const edge = `${network}-nginx`;
        const directory = await mkdtemp(
            path.join(os.tmpdir(), 'languon-admin-edge-'),
        );
        try {
            await createFixtureFiles(directory);
            await runCommand('docker', ['network', 'create', network]);
            await runCommand('docker', [
                'run',
                '--detach',
                '--name',
                fixture,
                '--network',
                network,
                '--network-alias',
                'blue-backend',
                '--network-alias',
                'blue-admin',
                '--network-alias',
                'blue-web',
                nodeImage,
                'node',
                '-e',
                fixtureServerSource(),
            ]);
            await runCommand('docker', [
                'run',
                '--detach',
                '--name',
                edge,
                '--network',
                network,
                '--publish',
                '127.0.0.1::8444',
                '--read-only',
                '--security-opt',
                'no-new-privileges:true',
                '--tmpfs',
                '/etc/nginx/admin:rw,size=64k,mode=0750',
                '--tmpfs',
                '/var/cache/nginx:rw,size=64m,mode=0755',
                '--tmpfs',
                '/var/run:rw,size=4m,mode=0755',
                '--tmpfs',
                '/tmp:rw,size=16m,mode=1777',
                '--volume',
                `${path.resolve('infra/nginx/nginx.conf')}:/etc/nginx/nginx.conf:ro`,
                '--volume',
                `${path.resolve('infra/nginx/edge-entrypoint.sh')}:/etc/nginx/languon-edge-entrypoint.sh:ro`,
                '--volume',
                `${path.join(directory, 'active-upstream.conf')}:/etc/nginx/languon/active-upstream.conf:ro`,
                '--volume',
                `${path.join(directory, 'tls.crt')}:/etc/nginx/tls/tls.crt:ro`,
                '--volume',
                `${path.join(directory, 'tls.key')}:/etc/nginx/tls/tls.key:ro`,
                '--volume',
                `${path.join(directory, 'admin.htpasswd')}:/run/secrets/languon-admin-htpasswd:ro`,
                nginxImage,
                '/bin/sh',
                '/etc/nginx/languon-edge-entrypoint.sh',
            ]);
            const published = await runCommand(
                'docker',
                ['port', edge, '8444/tcp'],
                { capture: true },
            );
            const port = published.stdout.trim().match(/:(\d+)$/)?.[1];
            if (!port) throw new Error('Admin edge port was not published.');
            const origin = `https://127.0.0.1:${port}`;
            try {
                await waitForEdge(origin);
            } catch (error) {
                const logs = await runCommand('docker', ['logs', edge], {
                    capture: true,
                }).catch(() => ({ stderr: '', stdout: '' }));
                throw new Error(
                    `The private admin edge failed to start: ${logs.stdout}${logs.stderr}`,
                    { cause: error },
                );
            }

            const denied = await curl(origin, '/healthz', 'edge:wrong');
            assert.equal(denied.status, 401);

            const staticResponse = await curl(
                origin,
                '/healthz',
                'edge:edge-pass',
            );
            assert.equal(staticResponse.status, 200);
            assert.deepEqual(JSON.parse(staticResponse.body), {
                authorization: null,
                path: '/healthz',
                service: 'admin',
            });

            const apiResponse = await curl(
                origin,
                '/api/admin/me',
                'edge:edge-pass',
                ['X-Languon-Admin-Authorization: Bearer application-token'],
            );
            assert.equal(apiResponse.status, 200);
            assert.deepEqual(JSON.parse(apiResponse.body), {
                authorization: 'Bearer application-token',
                path: '/admin/me',
                service: 'backend',
            });

            const copiedSecret = await runCommand(
                'docker',
                [
                    'exec',
                    edge,
                    'stat',
                    '-c',
                    '%a:%U',
                    '/etc/nginx/admin/htpasswd',
                ],
                { capture: true },
            );
            assert.equal(copiedSecret.stdout.trim(), '400:nginx');

            await runCommand('docker', ['stop', fixture]);
            const unavailable = await curl(
                origin,
                '/api/admin/users?search=private-person@example.test',
                'edge:edge-pass',
                ['X-Languon-Admin-Authorization: Bearer application-token'],
            );
            assert.ok(
                [502, 504].includes(unavailable.status),
                `expected an unavailable-upstream gateway response, received ${unavailable.status}`,
            );
            const privacyLogs = await runCommand('docker', ['logs', edge], {
                capture: true,
            });
            const combinedLogs = `${privacyLogs.stdout}${privacyLogs.stderr}`;
            assert.doesNotMatch(combinedLogs, /private-person@example\.test/);
            assert.match(combinedLogs, /GET \/api\/admin\/users HTTP\/1\.1/);
        } finally {
            await runCommand('docker', ['rm', '--force', edge]).catch(() => {});
            await runCommand('docker', ['rm', '--force', fixture]).catch(
                () => {},
            );
            await runCommand('docker', ['network', 'rm', network]).catch(
                () => {},
            );
            await rm(directory, { force: true, recursive: true });
        }
    },
);

async function assertLocalDocker() {
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
}

async function createFixtureFiles(directory) {
    await writeFile(
        path.join(directory, 'active-upstream.conf'),
        [
            'upstream languon_backend { server blue-backend:4000; }',
            'upstream languon_admin { server blue-admin:3001; }',
            'upstream languon_web { server blue-web:3333; }',
            '',
        ].join('\n'),
    );
    await runCommand(
        'openssl',
        [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-days',
            '1',
            '-subj',
            '/CN=localhost',
            '-keyout',
            path.join(directory, 'tls.key'),
            '-out',
            path.join(directory, 'tls.crt'),
        ],
        { capture: true },
    );
    const password = await runCommand(
        'openssl',
        ['passwd', '-apr1', '-salt', 'languon', 'edge-pass'],
        { capture: true },
    );
    await writeFile(
        path.join(directory, 'admin.htpasswd'),
        `edge:${password.stdout.trim()}\n`,
        { mode: 0o600 },
    );
    await chmod(path.join(directory, 'tls.key'), 0o600);
}

function fixtureServerSource() {
    return `const http=require('http');for(const [port,service] of [[4000,'backend'],[3001,'admin'],[3333,'web']])http.createServer((request,response)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({authorization:request.headers.authorization??null,path:request.url,service}))}).listen(port,'0.0.0.0');`;
}

async function waitForEdge(origin) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const response = await curl(origin, '/healthz', 'edge:wrong').catch(
            () => null,
        );
        if (response?.status === 401) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('The private admin edge did not become ready.');
}

async function curl(origin, pathname, credentials, headers = []) {
    const result = await runCommand(
        'curl',
        [
            '--silent',
            '--show-error',
            '--insecure',
            '--user',
            credentials,
            ...headers.flatMap((header) => ['--header', header]),
            '--write-out',
            '\n%{http_code}',
            `${origin}${pathname}`,
        ],
        { capture: true },
    );
    const separator = result.stdout.lastIndexOf('\n');
    return {
        body: result.stdout.slice(0, separator),
        status: Number(result.stdout.slice(separator + 1)),
    };
}
