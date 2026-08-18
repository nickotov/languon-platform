import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

describe('health endpoint', () => {
    it('reports that the backend is ready', async () => {
        const response = await createApp().request('/health');

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            service: 'backend',
            status: 'ok',
        });
    });

    it('publishes the health operation in OpenAPI', async () => {
        const response = await createApp().request('/openapi.json');
        const document = (await response.json()) as {
            paths?: Record<string, unknown>;
        };

        expect(response.status).toBe(200);
        expect(document.paths).toHaveProperty('/health');
        expect(document.paths).toHaveProperty('/livez');
        expect(document.paths).toHaveProperty('/readyz');
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
