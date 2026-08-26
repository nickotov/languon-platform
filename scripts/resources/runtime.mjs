import { createHash } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SECRET = 'resource-profile-only-not-a-production-secret-0123456789';

function compose(run, file, project, args, env) {
    run(
        'docker',
        ['compose', '--file', file, '--project-name', project, ...args],
        {
            capture: false,
            env,
        },
    );
}

function appEnvironment(prefix, slot, images, releaseSha) {
    return {
        ADMIN_BASE_URL: 'https://localhost:18081',
        APP_ENV: 'test',
        AUTH_ALLOWED_ORIGINS: 'https://localhost:18480',
        AUTH_CODE_HMAC_SECRET: SECRET,
        AUTH_JWT_SECRET: `${SECRET}-${SECRET}`,
        DICTIONARY_HMAC_SECRET: `${SECRET}-dictionary`,
        AUTH_WEBAUTHN_RP_ID: 'localhost',
        BACKEND_IMAGE: images.backend,
        WEB_IMAGE: images.web,
        ADMIN_IMAGE: images.admin,
        DATABASE_MAX_CONNECTIONS: '4',
        DATABASE_URL: `postgresql://languon:${SECRET}@stage-postgres:5432/languon`,
        DEPLOY_PROJECT_PREFIX: prefix,
        DEPLOY_SLOT: slot,
        EDGE_SUBNET: '172.30.252.0/24',
        REDIS_URL: `redis://:${SECRET}@stage-redis:6379`,
        NODE_ENV: 'production',
        RELEASE_SHA: releaseSha,
        SHUTDOWN_TIMEOUT_MS: '10000',
    };
}

export function createResourceRuntime({
    run,
    repositoryRoot,
    rawDirectory,
    config,
}) {
    const prefix = config.runtime.projectName;
    const files = {
        apps: resolve(repositoryRoot, 'infra/deploy/compose/apps.compose.yaml'),
        data: resolve(
            repositoryRoot,
            'infra/deploy/compose/stage-data.compose.yaml',
        ),
        edge: resolve(repositoryRoot, 'infra/deploy/compose/edge.compose.yaml'),
    };
    const projects = {
        blue: `${prefix}-blue`,
        green: `${prefix}-green`,
        data: `${prefix}-data`,
        edge: `${prefix}-edge`,
    };
    const images = Object.fromEntries(
        config.builds.map(({ service, image }) => [service, image]),
    );
    const releaseSha = config.runtime.releaseSha;
    if (!/^[0-9a-f]{7,64}$/.test(releaseSha ?? ''))
        throw new Error('Resource runtime requires a Git revision releaseSha');
    const dataEnv = {
        DEPLOY_PROJECT_PREFIX: prefix,
        POSTGRES_DB: 'languon',
        POSTGRES_PASSWORD: SECRET,
        POSTGRES_USER: 'languon',
        REDIS_PASSWORD: SECRET,
    };
    const runtimeDirectory = resolve(rawDirectory, 'nginx');
    const tlsCertificatePath = resolve(runtimeDirectory, 'tls.crt');
    const tlsPrivateKeyPath = resolve(runtimeDirectory, 'tls.key');
    const adminHtpasswdPath = resolve(runtimeDirectory, 'admin.htpasswd');

    return {
        projects,
        tlsCertificatePath,
        async prepare() {
            await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
            run('openssl', [
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
            await writeFile(
                adminHtpasswdPath,
                `admin:{SHA}${createHash('sha1').update('resource-profile-only').digest('base64')}\n`,
                { mode: 0o600 },
            );
            await chmod(tlsCertificatePath, 0o600);
            await writeFile(
                resolve(runtimeDirectory, 'active-upstream.conf'),
                [
                    'upstream languon_backend { server blue-backend:4000; }',
                    'upstream languon_web { server blue-web:3333; }',
                    'upstream languon_admin { server blue-admin:3001; }',
                    '',
                ].join('\n'),
                { mode: 0o600 },
            );
            run(
                'docker',
                [
                    'network',
                    'create',
                    '--subnet',
                    '172.30.252.0/24',
                    `${prefix}-edge`,
                ],
                {
                    allowFailure: true,
                },
            );
            run('docker', ['network', 'create', `${prefix}-data`], {
                allowFailure: true,
            });
            compose(
                run,
                files.data,
                projects.data,
                ['up', '--detach', '--wait'],
                dataEnv,
            );
            compose(
                run,
                files.apps,
                projects.blue,
                ['up', '--detach', '--wait'],
                appEnvironment(prefix, 'blue', images, releaseSha),
            );
            compose(
                run,
                files.edge,
                projects.edge,
                ['up', '--detach', '--wait'],
                {
                    ADMIN_BIND_ADDRESS: '127.0.0.1',
                    ADMIN_HTPASSWD_PATH: adminHtpasswdPath,
                    ADMIN_PORT: '18081',
                    DEPLOY_PROJECT_PREFIX: prefix,
                    DEPLOY_RUNTIME_DIR: runtimeDirectory,
                    PUBLIC_BIND_ADDRESS: '127.0.0.1',
                    PUBLIC_HTTP_PORT: '18080',
                    PUBLIC_HTTPS_PORT: '18480',
                    TLS_CERTIFICATE_PATH: tlsCertificatePath,
                    TLS_PRIVATE_KEY_PATH: tlsPrivateKeyPath,
                },
            );
        },
        overlap() {
            compose(
                run,
                files.apps,
                projects.green,
                ['up', '--detach', '--wait'],
                appEnvironment(prefix, 'green', images, releaseSha),
            );
        },
        cleanup() {
            const quietDown = (file, project, env = {}) =>
                compose(
                    run,
                    file,
                    project,
                    ['down', '--volumes', '--remove-orphans'],
                    env,
                );
            for (const [slot, project] of [
                ['green', projects.green],
                ['blue', projects.blue],
            ]) {
                try {
                    quietDown(
                        files.apps,
                        project,
                        appEnvironment(prefix, slot, images, releaseSha),
                    );
                } catch {
                    // Continue best-effort cleanup of this disposable stack.
                }
            }
            try {
                quietDown(files.edge, projects.edge, {
                    ADMIN_BIND_ADDRESS: '127.0.0.1',
                    ADMIN_HTPASSWD_PATH: adminHtpasswdPath,
                    ADMIN_PORT: '18081',
                    DEPLOY_PROJECT_PREFIX: prefix,
                    DEPLOY_RUNTIME_DIR: runtimeDirectory,
                    PUBLIC_BIND_ADDRESS: '127.0.0.1',
                    PUBLIC_HTTP_PORT: '18080',
                    PUBLIC_HTTPS_PORT: '18480',
                    TLS_CERTIFICATE_PATH: tlsCertificatePath,
                    TLS_PRIVATE_KEY_PATH: tlsPrivateKeyPath,
                });
            } catch {
                // Continue with data cleanup.
            }
            try {
                quietDown(files.data, projects.data, dataEnv);
            } finally {
                run('docker', ['network', 'rm', `${prefix}-edge`], {
                    allowFailure: true,
                });
                run('docker', ['network', 'rm', `${prefix}-data`], {
                    allowFailure: true,
                });
            }
        },
    };
}
