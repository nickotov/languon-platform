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
    const nginx = await readFile('infra/nginx/nginx.conf', 'utf8');
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
});
