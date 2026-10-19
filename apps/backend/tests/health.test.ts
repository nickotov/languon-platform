import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

describe('operational endpoints', () => {
    it('reports default process liveness', async () => {
        const response = await createApp().request('/livez');

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            release: 'development',
            service: 'backend',
            status: 'ok',
        });
    });

    it('publishes only current operational routes in OpenAPI', async () => {
        const response = await createApp().request('/openapi.json');
        const document = (await response.json()) as {
            paths?: Record<string, unknown>;
        };

        expect(response.status).toBe(200);
        expect(document.paths).not.toHaveProperty('/health');
        expect(document.paths).toHaveProperty('/livez');
        expect(document.paths).toHaveProperty('/readyz');
    });

    it('does not serve the retired compatibility liveness alias', async () => {
        expect((await createApp().request('/health')).status).toBe(404);
    });

    it('reports release identity without coupling liveness to dependencies', async () => {
        const app = createApp({
            operational: {
                isShuttingDown: () => false,
                readiness: async () => {
                    throw new Error('database unavailable');
                },
                releaseSha: 'abcdef1234567',
            },
        });

        const response = await app.request('/livez');

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            release: 'abcdef1234567',
            service: 'backend',
            status: 'ok',
        });
    });

    it('fails readiness closed for unavailable dependencies and while draining', async () => {
        let shuttingDown = false;
        const app = createApp({
            operational: {
                isShuttingDown: () => shuttingDown,
                readiness: async () => ({
                    postgres: 'ok',
                    redis: 'unavailable',
                }),
                releaseSha: 'abcdef1234567',
            },
        });

        const unavailable = await app.request('/readyz');
        expect(unavailable.status).toBe(503);
        await expect(unavailable.json()).resolves.toMatchObject({
            dependencies: { postgres: 'ok', redis: 'unavailable' },
            status: 'unavailable',
        });

        shuttingDown = true;
        const draining = await app.request('/readyz');
        expect(draining.status).toBe(503);
        await expect(draining.json()).resolves.toMatchObject({
            dependencies: {
                postgres: 'unavailable',
                redis: 'unavailable',
            },
            status: 'unavailable',
        });
    });
});
