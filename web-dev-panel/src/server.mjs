import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { CatalogStore } from './catalog.mjs';
import {
    validateBatchBody,
    validateEmptyBody,
    validateStopBody,
} from './http-validation.mjs';
import { PanelOperationError, ProcessManager } from './process-manager.mjs';

const maximumRequestBytes = 8 * 1024;
const maximumSubscriberBufferBytes = 8 * 1024 * 1024;
const sessionCookie = 'languon_web_dev_panel_session';
const staticFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/selection.js', ['selection.js', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

function securityHeaders(contentType) {
    return {
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        'Content-Type': contentType,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Permissions-Policy':
            'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    };
}

function parseCookies(header) {
    const cookies = new Map();
    if (typeof header !== 'string') return cookies;
    for (const item of header.split(';')) {
        const separator = item.indexOf('=');
        if (separator <= 0) continue;
        cookies.set(
            item.slice(0, separator).trim(),
            item.slice(separator + 1).trim(),
        );
    }
    return cookies;
}

function writeJson(response, status, value) {
    const body = JSON.stringify(value);
    response.writeHead(status, {
        ...securityHeaders('application/json; charset=utf-8'),
        'Content-Length': Buffer.byteLength(body),
    });
    response.end(body);
}

async function readJson(request) {
    const contentType = request.headers['content-type'];
    if (
        typeof contentType !== 'string' ||
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)
    ) {
        throw new PanelOperationError(
            'invalid_content_type',
            'Mutating requests require application/json.',
            { status: 415 },
        );
    }
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (
        !Number.isFinite(contentLength) ||
        contentLength < 0 ||
        contentLength > maximumRequestBytes
    ) {
        throw new PanelOperationError(
            'request_too_large',
            'Request body is too large.',
            { status: 413 },
        );
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
        length += chunk.length;
        if (length > maximumRequestBytes) {
            throw new PanelOperationError(
                'request_too_large',
                'Request body is too large.',
                { status: 413 },
            );
        }
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new PanelOperationError(
            'invalid_json',
            'Request body must be valid JSON.',
            { status: 400 },
        );
    }
}

function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}

export function createWebDevPanelServer({
    catalogPath,
    environment = process.env,
    host = '127.0.0.1',
    launchToken = randomBytes(32).toString('base64url'),
    port = 4400,
    publicDirectory,
    repositoryRoot,
}) {
    const catalogStore = new CatalogStore({
        catalogPath,
        packageManagerEntrypoint: environment.npm_execpath,
        repositoryRoot,
    });
    const processManager = new ProcessManager({ catalogStore, environment });
    const serverSessionId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    const eventClients = new Map();
    let sequence = 0;
    let started = false;
    let closing = false;
    let closePromise;
    let startPromise;

    const snapshot = () => {
        const catalog = catalogStore.publicSnapshot();
        const runs = processManager.snapshot();
        return {
            catalogIssues: catalog.issues,
            commands: catalog.commands.map((command) => ({
                ...command,
                run: runs[command.id] ?? null,
            })),
            sequence,
            serverSessionId,
            version: catalog.version,
        };
    };

    const eventPayload = (event, data, id = sequence) =>
        `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    const send = (response, event, data, id = sequence) => {
        if (response.destroyed || response.writableEnded) return false;
        response.write(eventPayload(event, data, id));
        if (response.writableLength > maximumSubscriberBufferBytes) {
            response.end();
            return false;
        }
        return true;
    };

    const broadcast = (event, createData) => {
        sequence += 1;
        const data = createData();
        for (const [response, heartbeat] of eventClients) {
            if (!send(response, event, data)) {
                clearInterval(heartbeat);
                eventClients.delete(response);
            }
        }
    };
    const broadcastSnapshot = () => broadcast('snapshot', snapshot);
    catalogStore.on('changed', broadcastSnapshot);
    catalogStore.on('watch-error', ({ code }) =>
        broadcast('server-warning', () => ({ code })),
    );
    processManager.on('state', broadcastSnapshot);
    processManager.on('log', (value) => broadcast('log', () => value));
    processManager.on('agent', (value) => broadcast('agent', () => value));

    const expectedHost = () => {
        const address = server.address();
        const activePort =
            address && typeof address === 'object' ? address.port : port;
        return `${host}:${activePort}`;
    };
    const expectedOrigin = () => `http://${expectedHost()}`;

    const hasSession = (request) =>
        parseCookies(request.headers.cookie).get(sessionCookie) ===
        sessionToken;

    const validLaunchToken = (value) => {
        if (typeof value !== 'string') return false;
        const actual = Buffer.from(value);
        const expected = Buffer.from(launchToken);
        return (
            actual.length === expected.length &&
            timingSafeEqual(actual, expected)
        );
    };

    const hasEventStreamBoundary = (request) =>
        hasSession(request) &&
        (request.headers.origin === expectedOrigin() ||
            (request.headers.origin === undefined &&
                request.headers['sec-fetch-site'] === 'same-origin'));

    const requireMutationBoundary = (request) => {
        if (!hasSession(request)) {
            throw new PanelOperationError(
                'invalid_session',
                'Reload the panel to establish a current server session.',
                { status: 401 },
            );
        }
        if (
            request.headers.origin !== expectedOrigin() ||
            request.headers['x-languon-dev-panel'] !== '1' ||
            (request.headers['sec-fetch-site'] &&
                request.headers['sec-fetch-site'] !== 'same-origin')
        ) {
            throw new PanelOperationError(
                'invalid_origin',
                'The request did not originate from this panel.',
                { status: 403 },
            );
        }
    };

    const serveStatic = async (request, response, url) => {
        const { pathname, searchParams } = url;
        if (pathname === '/favicon.ico') {
            if (request.method !== 'GET') {
                writeJson(response, 405, { code: 'method_not_allowed' });
            } else {
                response.writeHead(204, securityHeaders('image/x-icon'));
                response.end();
            }
            return true;
        }
        const staticFile = staticFiles.get(pathname);
        if (!staticFile) return false;
        if (request.method !== 'GET') {
            writeJson(response, 405, { code: 'method_not_allowed' });
            return true;
        }
        if (pathname === '/' && !hasSession(request)) {
            if (
                [...searchParams.keys()].length !== 1 ||
                !validLaunchToken(searchParams.get('launch'))
            ) {
                writeJson(response, 401, {
                    code: 'launch_authorization_required',
                    message:
                        'Open the private launch URL printed by the panel process.',
                });
                return true;
            }
            response.writeHead(303, {
                ...securityHeaders('text/plain; charset=utf-8'),
                Location: '/',
                'Set-Cookie': `${sessionCookie}=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`,
            });
            response.end('Authorized. Redirecting to the panel.');
            return true;
        }
        if (searchParams.size > 0) {
            writeJson(response, 400, { code: 'query_not_supported' });
            return true;
        }
        const [filename, contentType] = staticFile;
        const body = await readFile(join(publicDirectory, filename));
        const headers = {
            ...securityHeaders(contentType),
            'Content-Length': body.length,
        };
        response.writeHead(200, headers);
        response.end(body);
        return true;
    };

    const handleApi = async (request, response, pathname) => {
        if (pathname === '/api/snapshot') {
            if (request.method !== 'GET') {
                writeJson(response, 405, { code: 'method_not_allowed' });
            } else if (!hasSession(request)) {
                writeJson(response, 401, { code: 'invalid_session' });
            } else {
                writeJson(response, 200, snapshot());
            }
            return true;
        }
        if (pathname === '/api/events') {
            if (request.method !== 'GET') {
                writeJson(response, 405, { code: 'method_not_allowed' });
            } else if (!hasEventStreamBoundary(request)) {
                writeJson(response, 401, { code: 'invalid_session' });
            } else {
                response.writeHead(200, {
                    ...securityHeaders('text/event-stream; charset=utf-8'),
                    Connection: 'keep-alive',
                });
                send(response, 'snapshot', snapshot(), sequence);
                const heartbeat = setInterval(() => {
                    if (!response.write(': keepalive\n\n')) response.end();
                }, 15_000);
                heartbeat.unref();
                eventClients.set(response, heartbeat);
                request.once('close', () => {
                    clearInterval(heartbeat);
                    eventClients.delete(response);
                });
            }
            return true;
        }

        if (request.method !== 'POST') return false;
        requireMutationBoundary(request);
        const body = await readJson(request);
        if (pathname === '/api/start') {
            if (!validateBatchBody(body)) {
                throw new PanelOperationError(
                    'invalid_request',
                    'Expected exactly one bounded selections array.',
                    { status: 400 },
                );
            }
            const runs = await processManager.startBatch(body.selections);
            writeJson(response, 202, { runs });
            return true;
        }
        if (pathname === '/api/stop-all') {
            if (!validateEmptyBody(body)) {
                throw new PanelOperationError(
                    'invalid_request',
                    'Expected an empty JSON object.',
                    { status: 400 },
                );
            }
            const runs = await processManager.stopAll();
            writeJson(response, 202, { runs });
            return true;
        }
        if (pathname !== '/api/stop') return false;
        if (!validateStopBody(body)) {
            throw new PanelOperationError(
                'invalid_request',
                'Expected exactly commandId and runId.',
                { status: 400 },
            );
        }
        const result = await processManager.stop(body.commandId, body.runId);
        writeJson(response, 202, { runs: [result] });
        return true;
    };

    const server = createServer(async (request, response) => {
        try {
            if (request.headers.host !== expectedHost()) {
                writeJson(response, 421, { code: 'invalid_host' });
                return;
            }
            const url = new URL(request.url ?? '/', expectedOrigin());
            if (
                url.pathname === '/health' &&
                request.method === 'GET' &&
                !url.search
            ) {
                response.writeHead(
                    204,
                    securityHeaders('text/plain; charset=utf-8'),
                );
                response.end();
                return;
            }
            if (url.hash) {
                writeJson(response, 400, { code: 'query_not_supported' });
                return;
            }
            if (await serveStatic(request, response, url)) return;
            if (url.search) {
                writeJson(response, 400, { code: 'query_not_supported' });
                return;
            }
            if (await handleApi(request, response, url.pathname)) return;
            writeJson(response, 404, { code: 'not_found' });
        } catch (error) {
            if (error instanceof PanelOperationError) {
                writeJson(response, error.status, {
                    code: error.code,
                    issues: error.issues,
                    message: error.message,
                });
                return;
            }
            writeJson(response, 500, {
                code: 'internal_error',
                message: 'The panel could not complete this request.',
            });
        }
    });
    server.on('clientError', (_error, socket) => {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    });

    return {
        catalogStore,
        close: () => {
            if (closePromise) return closePromise;
            closing = true;
            closePromise = (async () => {
                if (startPromise) await startPromise.catch(() => {});
                await processManager.shutdown();
                catalogStore.close();
                for (const [response, heartbeat] of eventClients) {
                    clearInterval(heartbeat);
                    response.end();
                }
                eventClients.clear();
                if (started) {
                    await closeServer(server);
                    started = false;
                }
            })();
            return closePromise;
        },
        processManager,
        server,
        snapshot,
        start: () => {
            if (started || startPromise)
                throw new Error('panel server already started');
            if (closing) throw new Error('panel server is shutting down');
            startPromise = (async () => {
                await catalogStore.refresh();
                if (closing) throw new Error('panel server is shutting down');
                await new Promise((resolveStart, rejectStart) => {
                    server.once('error', rejectStart);
                    server.listen(port, host, () => {
                        server.removeListener('error', rejectStart);
                        resolveStart();
                    });
                });
                started = true;
                if (closing) {
                    await closeServer(server);
                    started = false;
                    throw new Error('panel server is shutting down');
                }
                catalogStore.startWatching();
                return {
                    launchUrl: `${expectedOrigin()}/?launch=${encodeURIComponent(launchToken)}`,
                    origin: expectedOrigin(),
                    port: server.address().port,
                    serverSessionId,
                };
            })();
            startPromise.then(
                () => {
                    startPromise = undefined;
                },
                () => {
                    startPromise = undefined;
                },
            );
            return startPromise;
        },
    };
}
