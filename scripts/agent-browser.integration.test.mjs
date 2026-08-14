import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrapperPath = resolve(repositoryRoot, 'scripts/agent-browser.mjs');

function listen(server, host) {
    return new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, host, () => {
            server.off('error', reject);
            resolveListen(server.address());
        });
    });
}

function closeServer(server) {
    if (!server.listening) return Promise.resolve();
    server.close();
    return once(server, 'close');
}

function runWrapper(arguments_) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(process.execPath, [wrapperPath, ...arguments_], {
            cwd: repositoryRoot,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.once('error', reject);
        child.once('close', (code) => {
            resolveRun({ code: code ?? 1, stderr, stdout });
        });
    });
}

test(
    'the managed browser blocks external navigation and sendBeacon traffic',
    { timeout: 30_000 },
    async () => {
        const escapedRequests = [];
        const sink = createServer((request, response) => {
            escapedRequests.push(request.url);
            response.setHeader('content-type', 'text/html; charset=utf-8');
            response.end(
                '<!doctype html><title>Disallowed destination</title>',
            );
        });
        const sinkAddress = await listen(sink, '::1');
        const sinkOrigin = `http://[::1]:${sinkAddress.port}`;

        const app = createServer((_request, response) => {
            response.setHeader('content-type', 'text/html; charset=utf-8');
            response.end(`<!doctype html>
        <html lang="en">
          <body>
            <a href="${sinkOrigin}/external">External destination</a>
            <button type="button" onclick="navigator.sendBeacon('${sinkOrigin}/leak', 'fake-browser-test-data')">
              Send beacon
            </button>
          </body>
        </html>`);
        });
        const appAddress = await listen(app, '127.0.0.1');
        const localUrl = `http://127.0.0.1:${appAddress.port}`;
        let session;

        try {
            const started = await runWrapper([
                'start',
                'containment-test',
                localUrl,
            ]);
            assert.equal(started.code, 0, started.stderr || started.stdout);
            session = started.stdout.match(
                /Languon browser session: (languon-[a-z0-9-]+-[a-f0-9]{32})/,
            )?.[1];
            assert.ok(
                session,
                `missing wrapper-owned session handle: ${started.stdout}`,
            );

            const beacon = await runWrapper([
                '--session',
                session,
                'find',
                'text',
                'Send beacon',
                'click',
                '--exact',
            ]);
            assert.equal(beacon.code, 0, beacon.stderr || beacon.stdout);
            await new Promise((resolveWait) => setTimeout(resolveWait, 300));
            assert.deepEqual(
                escapedRequests,
                [],
                'sendBeacon escaped the host allowlist',
            );

            const externalNavigation = await runWrapper([
                '--session',
                session,
                'find',
                'text',
                'External destination',
                'click',
                '--exact',
            ]);
            assert.equal(
                externalNavigation.code,
                0,
                externalNavigation.stderr || externalNavigation.stdout,
            );
            await new Promise((resolveWait) => setTimeout(resolveWait, 300));
            assert.deepEqual(
                escapedRequests,
                [],
                'top-level navigation escaped the host allowlist',
            );
        } finally {
            if (session) await runWrapper(['--session', session, 'close']);
            await Promise.all([closeServer(app), closeServer(sink)]);
        }
    },
);
