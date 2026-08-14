import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { serve } from '@hono/node-server';

import { createApp } from './app';
import { loadEnvironment } from './config/environment';
import { createAuthenticationComposition } from './modules/authentication/infrastructure/authentication-composition';

const localEnvironmentFile = new URL('../../../.env.local', import.meta.url);

if (existsSync(localEnvironmentFile)) {
    loadEnvFile(localEnvironmentFile);
}

const environment = loadEnvironment();
const authentication = await createAuthenticationComposition(environment);
const app = createApp({ authentication: authentication.options });
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

let shuttingDown = false;

function shutdown(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down.`);
    server.close(async (error) => {
        if (error) {
            console.error(error);
            process.exitCode = 1;
        }
        await authentication.close().catch((closeError: unknown) => {
            console.error(closeError);
            process.exitCode = 1;
        });
    });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
