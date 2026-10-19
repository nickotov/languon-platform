import assert from 'node:assert/strict';
import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { loadCatalog, parseDiagram, sourceFingerprint } from '../catalog.mjs';
import { createDiagramServer } from '../server.mjs';

const document = `---
type: diagram
title: Synthetic flow
summary: A source-backed fixture.
source_paths:
    - source.ts
source_fingerprint: pending
reviewed: 2026-10-19
---

# Synthetic flow

\`\`\`mermaid
flowchart LR
    Request --> Result
\`\`\`

This note is text, including <script>untrusted()</script>.
`;

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'languon-diagrams-'));
    await mkdir(join(root, 'docs/diagrams'), { recursive: true });
    await writeFile(join(root, 'source.ts'), 'export const fixture = true;\n');
    await writeFile(join(root, 'docs/diagrams/fixture.md'), document);
    t.after(() => rm(root, { recursive: true, force: true }));
    return root;
}

test('freshness notices changed source, stamp is explicit, source notes remain inert strings', async (t) => {
    const root = await fixture(t);
    const original = await readFile(
        join(root, 'docs/diagrams/fixture.md'),
        'utf8',
    );
    let catalog = await loadCatalog(root);
    assert.equal(catalog.diagrams[0].fresh, false);
    assert.match(catalog.diagrams[0].notes, /<script>untrusted/u);
    assert.equal(
        await readFile(join(root, 'docs/diagrams/fixture.md'), 'utf8'),
        original,
    );
    assert.match(
        await sourceFingerprint(root, ['source.ts']),
        /^sha256:[a-f0-9]{64}$/u,
    );
    catalog = await loadCatalog(root, { stamp: true });
    assert.equal(catalog.diagrams[0].fresh, true);
    assert.equal((await loadCatalog(root)).diagrams[0].fresh, true);
    await writeFile(join(root, 'source.ts'), 'export const fixture = false;\n');
    assert.equal((await loadCatalog(root)).diagrams[0].fresh, false);
});

test('invalid metadata, Mermaid directives and external resources fail closed', () => {
    assert.throws(() =>
        parseDiagram(
            document.replace('type: diagram', 'type: diagram\nunknown: value'),
            'fixture',
        ),
    );
    assert.throws(() =>
        parseDiagram(
            document.replace(
                'title: Synthetic flow',
                'title: Synthetic flow\ntitle: Duplicate',
            ),
            'fixture',
        ),
    );
    assert.throws(() =>
        parseDiagram(
            document.replace(
                'Request --> Result',
                '%%{init: { securityLevel: "loose" }}%%\nRequest --> Result',
            ),
            'fixture',
        ),
    );
    assert.throws(() =>
        parseDiagram(
            document.replace(
                'Request --> Result',
                'A["<img src=x>"] --> Result',
            ),
            'fixture',
        ),
    );
    assert.throws(() =>
        parseDiagram(
            document.replace(
                'Request --> Result',
                'Request --> Result\nclick Request "https://example.com"',
            ),
            'fixture',
        ),
    );
    assert.throws(() => parseDiagram(document, '../escape'));
});

test('source and diagram symlinks cannot escape the repository boundary', async (t) => {
    const root = await fixture(t);
    const outside = await mkdtemp(join(tmpdir(), 'languon-diagram-outside-'));
    t.after(() => rm(outside, { recursive: true, force: true }));
    await writeFile(join(outside, 'private.txt'), 'private');
    await symlink(join(outside, 'private.txt'), join(root, 'linked.ts'));
    await assert.rejects(sourceFingerprint(root, ['linked.ts']), /outside/u);
    await assert.rejects(
        sourceFingerprint(root, ['.env.local']),
        /Invalid source/u,
    );
    await symlink(
        join(outside, 'private.txt'),
        join(root, 'docs/diagrams/escape.md'),
    );
    const catalog = await loadCatalog(root);
    assert.equal(catalog.issues.length, 1);
    assert.equal(catalog.diagrams.length, 1);
});

function get(url, { method = 'GET', headers = {}, path } = {}) {
    return new Promise((resolve, reject) => {
        const call = request(
            url,
            { method, headers, ...(path ? { path } : {}) },
            (response) => {
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () =>
                    resolve({
                        status: response.statusCode,
                        headers: response.headers,
                        body: Buffer.concat(chunks).toString(),
                    }),
                );
            },
        );
        call.on('error', reject);
        call.end();
    });
}

test('HTTP serves only read-only local assets/catalog and rejects hostile Host, Origin and paths', async (t) => {
    const root = await fixture(t);
    const viewer = createDiagramServer({ root });
    const url = await viewer.listen(0);
    t.after(() => viewer.close());
    const catalog = await get(`${url}/api/diagrams`);
    assert.equal(catalog.status, 200);
    assert.equal(JSON.parse(catalog.body).diagrams.length, 1);
    assert.equal(catalog.headers['access-control-allow-origin'], undefined);
    assert.match(
        catalog.headers['content-security-policy'],
        /script-src 'self'/u,
    );
    assert.equal((await get(url)).status, 200);
    assert.equal((await get(`${url}/app.mjs`, { method: 'HEAD' })).body, '');
    assert.equal((await get(`${url}/vendor/mermaid.esm.min.mjs`)).status, 200);
    assert.equal(
        (await get(url, { headers: { host: 'attacker.example' } })).status,
        403,
    );
    assert.equal(
        (await get(url, { headers: { origin: 'https://attacker.example' } }))
            .status,
        403,
    );
    assert.equal((await get(url, { headers: { origin: 'null' } })).status, 403);
    assert.equal(
        (await get(url, { headers: { 'sec-fetch-site': 'cross-site' } }))
            .status,
        403,
    );
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS'])
        assert.equal(
            (await get(`${url}/api/diagrams`, { method })).status,
            405,
        );
    for (const path of [
        '/.env.local',
        '/package.json',
        '/api/run',
        '/vendor/package.json',
        '/vendor/chunks/mermaid.esm.min/private.map',
        '/vendor/../../package.json',
    ])
        assert.equal((await get(url, { path })).status, 404);
    assert.equal((await get(url, { path: '/vendor/%2fetc' })).status, 400);
    assert.equal((await get(url, { path: '/?file=.env.local' })).status, 400);
    assert.equal(
        await readFile(join(root, 'docs/diagrams/fixture.md'), 'utf8'),
        document,
    );
});
