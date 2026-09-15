import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production data plane requires verified TLS and restricted Redis ACLs', async () => {
    const data = await readFile(
        'infra/deploy/compose/production-data.compose.yaml',
        'utf8',
    );
    const apps = await readFile(
        'infra/deploy/compose/apps.production.compose.yaml',
        'utf8',
    );
    assert.match(data, /ssl=on/);
    assert.match(data, /--port[\s\S]*'0'/);
    assert.match(data, /--tls-port/);
    assert.match(data, /--aclfile/);
    assert.doesNotMatch(data, /--requirepass/);
    assert.match(apps, /NODE_EXTRA_CA_CERTS/);
});

test('web and admin cannot reach the data network and readiness is private', async () => {
    const apps = await readFile(
        'infra/deploy/compose/apps.compose.yaml',
        'utf8',
    );
    const edgeCompose = await readFile(
        'infra/deploy/compose/edge.compose.yaml',
        'utf8',
    );
    const edgeEntrypoint = await readFile(
        'infra/nginx/edge-entrypoint.sh',
        'utf8',
    );
    const nginx = await readFile('infra/nginx/nginx.conf', 'utf8');
    assert.match(nginx, /client_max_body_size 2250k;/);
    assert.match(
        nginx,
        /limit_req_zone \$binary_remote_addr zone=dictionary_import_requests:10m rate=30r\/m;/,
    );
    assert.match(
        nginx,
        /location = \/api\/dictionary-imports\/preview[\s\S]*limit_conn dictionary_import_connections 2;[\s\S]*limit_req zone=dictionary_import_requests burst=5 nodelay;[\s\S]*proxy_pass http:\/\/languon_backend\/dictionary-imports\/preview;/,
    );
    const web = apps.slice(
        apps.indexOf('    web:'),
        apps.indexOf('    admin:'),
    );
    const admin = apps.slice(
        apps.indexOf('    admin:'),
        apps.indexOf('\nnetworks:'),
    );
    assert.doesNotMatch(web, /data:/);
    assert.doesNotMatch(admin, /data:/);
    assert.match(nginx, /location = \/api\/readyz[\s\S]*deny all/);
    assert.match(nginx, /location \^~ \/api\/admin\/[\s\S]*return 404/);
    assert.match(nginx, /listen 8444 ssl;/);
    assert.match(nginx, /auth_basic "Languon administration"/);
    assert.match(nginx, /auth_basic_user_file \/etc\/nginx\/admin\/htpasswd/);
    assert.match(
        edgeCompose,
        /ADMIN_HTPASSWD_PATH[^\n]+:\/run\/secrets\/languon-admin-htpasswd:ro/,
    );
    assert.match(edgeCompose, /\/etc\/nginx\/admin:size=64k/);
    assert.match(edgeEntrypoint, /chown nginx:nginx \/etc\/nginx\/admin/);
    assert.match(edgeEntrypoint, /chmod 0400 \/etc\/nginx\/admin\/htpasswd/);
    assert.match(
        nginx,
        /proxy_set_header Authorization \$http_x_languon_admin_authorization/,
    );
    assert.match(nginx, /proxy_set_header X-Languon-Admin-Authorization ""/);
    assert.match(nginx, /access_log \/dev\/stdout admin_safe/);
    assert.match(
        nginx.slice(nginx.indexOf('listen 8444 ssl;')),
        /error_log \/dev\/stderr crit/,
    );
    assert.match(nginx, /"\$request_method \$uri \$server_protocol"/);
    assert.doesNotMatch(
        nginx.slice(nginx.indexOf('listen 8444 ssl;')),
        /\$request_uri/,
    );
    assert.ok(
        nginx.indexOf('location ^~ /api/admin/') <
            nginx.indexOf('location /api/'),
        'public admin denial must precede the general API proxy',
    );
});

test('admin is a static unprivileged NGINX image with SPA fallback', async () => {
    const dockerfile = await readFile(
        'infra/docker/prod.admin.Dockerfile',
        'utf8',
    );
    const nginx = await readFile('infra/docker/admin.nginx.conf', 'utf8');
    assert.match(dockerfile, /FROM nginx:[^\s]+@sha256:/);
    assert.match(dockerfile, /USER nginx/);
    assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
    assert.match(nginx, /max-age=31536000, immutable/);
    assert.match(nginx, /location = \/healthz[\s\S]*no-store/);
    for (const header of [
        'Content-Security-Policy',
        'Referrer-Policy',
        'X-Content-Type-Options',
        'X-Frame-Options',
    ]) {
        assert.match(nginx, new RegExp(`add_header ${header}`));
    }
});

test('dictionary worker reuses the backend image without HTTP or auth/cache authority', async () => {
    const apps = await readFile(
        'infra/deploy/compose/apps.compose.yaml',
        'utf8',
    );
    const worker = apps.slice(
        apps.indexOf('    dictionary-worker:'),
        apps.indexOf('    account-purge-worker:'),
    );
    assert.match(worker, /image: \$\{BACKEND_IMAGE/);
    assert.match(worker, /dictionary-worker-command\.js/);
    assert.match(worker, /DICTIONARY_WORKER_DATABASE_URL/);
    assert.doesNotMatch(worker, /^\s+DATABASE_URL:/m);
    assert.doesNotMatch(worker, /AUTH_|REDIS_URL|BACKEND_PORT|edge:/);
    assert.match(worker, /DICTIONARY_JOB_API_ENQUEUED_FORMATS/);
    assert.match(worker, /DICTIONARY_GENERATION_PROVIDER_MODE/);
    assert.match(worker, /DICTIONARY_GENERATION_MODEL_API_KEY/);
    const backend = apps.slice(
        apps.indexOf('    backend:'),
        apps.indexOf('    dictionary-worker:'),
    );
    assert.match(backend, /DICTIONARY_HMAC_SECRET/);
    assert.doesNotMatch(worker, /DICTIONARY_HMAC_SECRET/);
    assert.doesNotMatch(backend, /DICTIONARY_GENERATION_MODEL_API_KEY/);
    for (const policy of [
        'DICTIONARY_GENERATION_MAX_INPUT_TOKENS',
        'DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS',
        'DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS',
        'DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS',
        'DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT',
    ]) {
        const mapping = `${policy}: ` + '${' + `${policy}:-}`;
        assert.equal(backend.includes(mapping), true);
        assert.equal(worker.includes(mapping), true);
    }
});

test('account purge worker has isolated database and version-delete credentials', async () => {
    const apps = await readFile('infra/deploy/compose/apps.compose.yaml', 'utf8');
    const worker = apps.slice(apps.indexOf('    account-purge-worker:'), apps.indexOf('    web:'));
    assert.match(worker, /account-purge-command\.js/);
    assert.match(worker, /ACCOUNT_PURGE_DATABASE_URL/);
    assert.match(worker, /ACCOUNT_PURGE_STORAGE_ACCESS_KEY_ID/);
    assert.doesNotMatch(worker, /^\s+DATABASE_URL:/m);
    assert.doesNotMatch(worker, /AUTH_|REDIS_URL|DICTIONARY_GENERATION_MODEL_API_KEY|edge:/);
    const role = await readFile('infra/deploy/sql/account-purge-worker-role.sql', 'utf8');
    assert.match(role, /REVOKE ALL PRIVILEGES ON ALL TABLES/);
    assert.match(role, /GRANT SELECT, DELETE ON TABLE dictionary_generation_jobs/);
    assert.doesNotMatch(role, /GRANT ALL|GRANT INSERT/);
});
