import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { serve } from '@hono/node-server';

import { createApp } from './app';
import { loadEnvironment } from './config/environment';
import { createGracefulShutdown } from './infrastructure/server/graceful-shutdown';
import { createAuthenticationComposition } from './modules/authentication/infrastructure/authentication-composition';

const localEnvironmentFile = new URL('../../../.env.local', import.meta.url);

if (existsSync(localEnvironmentFile)) {
    loadEnvFile(localEnvironmentFile);
}

const environment = loadEnvironment();
const authentication = await createAuthenticationComposition(environment);
let shuttingDown = false;
const app = createApp({
    authentication: authentication.options,
    operational: {
        isShuttingDown: () => shuttingDown,
        readiness: authentication.readiness,
        releaseSha: environment.RELEASE_SHA,
    },
});
const server = serve(
    {
        fetch: app.fetch,
        hostname: environment.BACKEND_HOST,
        port: environment.BACKEND_PORT,
    },
    ({ port }) => {
        console.log(
            `Languon backend listening on http://${environment.BACKEND_HOST}:${port}`,
        );
    },
);

const performShutdown = createGracefulShutdown({
    closeResources: authentication.close,
    onDeadline: () => {
        process.exitCode = 1;
    },
    onError: (error) => {
        console.error(error);
        process.exitCode = 1;
    },
    server,
    timeoutMs: environment.SHUTDOWN_TIMEOUT_MS,
});

function shutdown(signal: string): void {
    shuttingDown = true;
    performShutdown(signal);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
