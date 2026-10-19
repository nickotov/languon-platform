import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { loadCatalog, readConfined } from './catalog.mjs';

export const repositoryRoot = resolve(
    fileURLToPath(new URL('../..', import.meta.url)),
);
const publicRoot = fileURLToPath(new URL('./public', import.meta.url));
const vendorRoot = dirname(fileURLToPath(import.meta.resolve('mermaid')));
const staticFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const headers = {
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function createDiagramServer({ root = repositoryRoot } = {}) {
    let port;
    const server = createServer(async (request, response) => {
        const send = (status, body, type = 'text/plain; charset=utf-8') => {
            response.writeHead(status, { ...headers, 'Content-Type': type });
            response.end(request.method === 'HEAD' ? undefined : body);
        };
        const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
        if (
            !hosts.includes(request.headers.host) ||
            (request.headers.origin &&
                !hosts.some(
                    (host) => request.headers.origin === `http://${host}`,
                )) ||
            request.headers['sec-fetch-site'] === 'cross-site'
        ) {
            send(403, 'Local same-origin requests only.');
            return;
        }
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.setHeader('Allow', 'GET, HEAD');
            send(405, 'Read-only viewer.');
            return;
        }
        try {
            const url = new URL(request.url, `http://${request.headers.host}`);
            if (
                url.search ||
                request.url.includes('\\') ||
                /%2f|%5c|%00/iu.test(request.url)
            ) {
                send(400, 'Unsupported URL.');
                return;
            }
            if (url.pathname === '/health') return send(200, 'ok');
            if (url.pathname === '/favicon.ico') return send(204, '');
            if (url.pathname === '/api/diagrams') {
                const catalog = await loadCatalog(root);
                return send(
                    200,
                    JSON.stringify(catalog),
                    'application/json; charset=utf-8',
                );
            }
            const staticFile = staticFiles.get(url.pathname);
            if (staticFile)
                return send(
                    200,
                    await readConfined(publicRoot, staticFile[0]),
                    staticFile[1],
                );
            const vendor =
                /^\/vendor\/(mermaid\.esm\.min\.mjs|chunks\/mermaid\.esm\.min\/[A-Za-z0-9_.-]+\.mjs)$/u.exec(
                    url.pathname,
                );
            if (vendor)
                return send(
                    200,
                    await readConfined(vendorRoot, vendor[1], 8 * 1024 * 1024),
                    'text/javascript; charset=utf-8',
                );
            send(404, 'Not found.');
        } catch {
            send(
                500,
                'Unable to read diagrams. Run pnpm diagrams:check for details.',
            );
        }
    });
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    return {
        server,
        async listen(requestedPort = 4401) {
            const selectedPort = z
                .number()
                .int()
                .min(0)
                .max(65535)
                .parse(requestedPort);
            await new Promise((resolveListen, reject) => {
                server.once('error', reject);
                server.listen(selectedPort, '127.0.0.1', resolveListen);
            });
            port = server.address().port;
            return `http://127.0.0.1:${port}`;
        },
        close: () =>
            new Promise((resolveClose, reject) =>
                server.close((error) =>
                    error ? reject(error) : resolveClose(),
                ),
            ),
    };
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === '--port'))
        throw new Error('Usage: pnpm diagrams [--port 4401]');
    const port = args.length
        ? z.coerce.number().int().min(1024).max(65535).parse(args[1])
        : 4401;
    const viewer = createDiagramServer();
    try {
        console.log(`Languon diagrams: ${await viewer.listen(port)}`);
    } catch (error) {
        if (error.code === 'EADDRINUSE')
            console.error(
                `Port ${port} is occupied. Stop that listener or use --port <port>.`,
            );
        else console.error('Unable to start the local diagram viewer.');
        process.exitCode = 1;
    }
    for (const signal of ['SIGINT', 'SIGTERM'])
        process.once(signal, () =>
            viewer.close().catch(() => {
                process.exitCode = 1;
            }),
        );
}
