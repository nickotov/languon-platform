import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createWebDevPanelServer } from '../src/server.mjs';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const panelRoot = resolve(testDirectory, '..');

function rawRequest(origin, { headers = {}, method = 'GET', path = '/' } = {}) {
    const url = new URL(origin);
    return new Promise((resolveRequest, rejectRequest) => {
        const request = httpRequest(
            {
                headers,
                host: url.hostname,
                method,
                path,
                port: url.port,
            },
            (response) => {
                response.resume();
                response.once('end', () => resolveRequest(response.statusCode));
            },
        );
        request.once('error', rejectRequest);
        request.end();
    });
}

async function waitForStatus(origin, cookie, commandId, expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await fetch(`${origin}/api/snapshot`, {
            headers: { Cookie: cookie },
        });
        const snapshot = await response.json();
        const command = snapshot.commands.find(({ id }) => id === commandId);
        if (command.run?.status === expected) return command;
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    throw new Error(`${commandId} did not reach ${expected}`);
}

test('native HTTP boundary synchronizes races, SSE, logs, and safe stops', async () => {
    const application = createWebDevPanelServer({
        catalogPath: resolve(testDirectory, 'fixture-commands.json'),
        host: '127.0.0.1',
        port: 0,
        publicDirectory: resolve(panelRoot, 'public'),
        repositoryRoot: resolve(testDirectory, 'fixture-repository'),
    });
    const { launchUrl, origin } = await application.start();
    try {
        const unauthorizedBootstrap = await fetch(origin);
        assert.equal(unauthorizedBootstrap.status, 401);
        const authorization = await fetch(launchUrl, { redirect: 'manual' });
        assert.equal(authorization.status, 303);
        assert.equal(authorization.headers.get('location'), '/');
        const cookie = authorization.headers.get('set-cookie').split(';', 1)[0];
        const bootstrap = await fetch(origin, { headers: { Cookie: cookie } });
        assert.equal(bootstrap.status, 200);
        assert.equal(
            bootstrap.headers.get('access-control-allow-origin'),
            null,
        );
        assert.match(
            bootstrap.headers.get('content-security-policy'),
            /default-src 'none'/u,
        );
        const withoutSession = await fetch(`${origin}/api/snapshot`);
        assert.equal(withoutSession.status, 401);
        const wrongHost = await rawRequest(origin, {
            headers: { Cookie: cookie, Host: 'localhost:4411' },
            path: '/api/snapshot',
        });
        assert.equal(wrongHost, 421);
        const query = await fetch(`${origin}/api/snapshot?unexpected=true`, {
            headers: { Cookie: cookie },
        });
        assert.equal(query.status, 400);
        const missingEventMetadata = await fetch(`${origin}/api/events`, {
            headers: { Cookie: cookie },
        });
        assert.equal(missingEventMetadata.status, 401);

        const controlHeaders = {
            'Content-Type': 'application/json',
            Cookie: cookie,
            Origin: origin,
            'X-Languon-Dev-Panel': '1',
        };
        const wrongContentType = await fetch(`${origin}/api/start`, {
            body: '{}',
            headers: { ...controlHeaders, 'Content-Type': 'text/plain' },
            method: 'POST',
        });
        assert.equal(wrongContentType.status, 415);
        const malformed = await fetch(`${origin}/api/start`, {
            body: '{',
            headers: controlHeaders,
            method: 'POST',
        });
        assert.equal(malformed.status, 400);
        const oversized = await fetch(`${origin}/api/start`, {
            body: JSON.stringify({ value: 'x'.repeat(9_000) }),
            headers: controlHeaders,
            method: 'POST',
        });
        assert.equal(oversized.status, 413);
        const unknownField = await fetch(`${origin}/api/start`, {
            body: JSON.stringify({ selections: [], unexpected: true }),
            headers: controlHeaders,
            method: 'POST',
        });
        assert.equal(unknownField.status, 400);
        const options = await fetch(`${origin}/api/start`, {
            method: 'OPTIONS',
        });
        assert.equal(options.status, 404);
        assert.equal(options.headers.get('access-control-allow-origin'), null);

        const forbidden = await fetch(`${origin}/api/start`, {
            body: JSON.stringify({
                selections: [
                    {
                        id: 'alpha',
                        sourceRevision:
                            'sha256:2bc1d09e6fd2511422f8d0b26ac5feab40b685442cee40247adc2e89045ee461',
                    },
                ],
            }),
            headers: {
                'Content-Type': 'application/json',
                Cookie: cookie,
                'X-Languon-Dev-Panel': '1',
            },
            method: 'POST',
        });
        assert.equal(forbidden.status, 403);

        const post = (path, body) =>
            fetch(`${origin}${path}`, {
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json',
                    Cookie: cookie,
                    Origin: origin,
                    'X-Languon-Dev-Panel': '1',
                },
                method: 'POST',
            });
        const selection = {
            id: 'alpha',
            sourceRevision:
                'sha256:2bc1d09e6fd2511422f8d0b26ac5feab40b685442cee40247adc2e89045ee461',
        };
        const starts = await Promise.all([
            post('/api/start', { selections: [selection] }),
            post('/api/start', { selections: [selection] }),
        ]);
        assert.deepEqual(starts.map(({ status }) => status).sort(), [202, 409]);
        const running = await waitForStatus(origin, cookie, 'alpha', 'running');

        const controller = new AbortController();
        const events = await fetch(`${origin}/api/events`, {
            headers: {
                Cookie: cookie,
                'Sec-Fetch-Site': 'same-origin',
            },
            signal: controller.signal,
        });
        assert.equal(events.status, 200);
        const firstEvent = new TextDecoder().decode(
            (await events.body.getReader().read()).value,
        );
        assert.match(firstEvent, /event: snapshot/u);
        controller.abort();

        const stale = await post('/api/stop', {
            commandId: 'alpha',
            runId: '00000000-0000-0000-0000-000000000000',
        });
        assert.equal(stale.status, 409);
        const stopped = await post('/api/stop', {
            commandId: 'alpha',
            runId: running.run.id,
        });
        assert.equal(stopped.status, 202);
        await waitForStatus(origin, cookie, 'alpha', 'cancelled');
    } finally {
        await application.close();
    }
});

test('shutdown racing startup cannot leave a listening server', async () => {
    const application = createWebDevPanelServer({
        catalogPath: resolve(testDirectory, 'fixture-commands.json'),
        host: '127.0.0.1',
        port: 0,
        publicDirectory: resolve(panelRoot, 'public'),
        repositoryRoot: resolve(testDirectory, 'fixture-repository'),
    });
    const start = application.start();
    const close = application.close();
    const [startResult] = await Promise.allSettled([start, close]);
    assert.equal(startResult.status, 'rejected');
    assert.equal(application.server.listening, false);
});
