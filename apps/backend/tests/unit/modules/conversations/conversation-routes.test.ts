import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import { createConversationRoutes } from '../../../../src/modules/conversations/interface/http/conversation.routes';

function composedRoutes() {
    // These middleware composition cases never execute a business handler.
    const conversations = createConversationRoutes({
        service: {} as never,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const app = new Hono();
    app.route('/', conversations);
    app.post('/dictionary-upload', async (c) =>
        c.json({ size: (await c.req.text()).length }),
    );
    app.options('/dictionary-upload', (c) =>
        c.json({ owner: 'dictionary-upload' }, 202),
    );
    return app;
}

describe('conversation router mounting boundaries', () => {
    it('leaves unrelated upload limits, CORS and preflight ownership with their router', async () => {
        const app = composedRoutes();
        const payload = 'x'.repeat(1_200_000);
        const response = await app.request('/dictionary-upload', {
            method: 'POST',
            headers: {
                Origin: 'http://unrelated-origin.example',
                'Content-Length': String(payload.length),
            },
            body: payload,
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ size: payload.length });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        const preflight = await app.request('/dictionary-upload', {
            method: 'OPTIONS',
        });
        expect(preflight.status).toBe(202);
        expect(await preflight.json()).toEqual({ owner: 'dictionary-upload' });
    });
    it('retains the conversation namespace body limit and supported preflight headers', async () => {
        const app = composedRoutes();
        const payload = 'x'.repeat(1_200_000);
        const response = await app.request('/conversations', {
            method: 'POST',
            headers: { 'Content-Length': String(payload.length) },
            body: payload,
        });
        expect(response.status).toBe(413);
        for (const path of [
            '/conversations',
            '/conversations/00000000-0000-4000-8000-000000000001/events',
            '/conversation-settings',
        ]) {
            const preflight = await app.request(path, {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3333' },
            });
            expect(preflight.status).toBe(204);
            expect(
                preflight.headers.get('Access-Control-Allow-Headers'),
            ).toContain('Last-Event-ID');
        }
    });
});

it('keeps live SSE private and prevents proxy compression from buffering small batches', async () => {
    const app = createConversationRoutes({
        service: {
            access: async () => ({
                ownerId: '00000000-0000-4000-8000-000000000002',
            }),
            revalidate: async () => ({
                ownerId: '00000000-0000-4000-8000-000000000002',
            }),
            admitStream: async () => ({ release: async () => {} }),
            store: {
                detail: async () => ({ turns: [] }),
                events: async () => [],
            },
        } as never,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const response = await app.request(
        '/conversations/00000000-0000-4000-8000-000000000001/events',
        { headers: { Authorization: 'Bearer synthetic.test.token' } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
        'private, no-store, no-transform',
    );
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    const reader = response.body!.getReader();
    try {
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toContain(
            'event: heartbeat',
        );
    } finally {
        await reader.cancel();
    }
});
